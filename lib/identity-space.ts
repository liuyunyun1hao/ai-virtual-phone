/** Identity boundaries are supplied by the host, never by app/model input. */
export type IdentitySpaceManifest = {
  version: 1;
  activeUserId: string | null;
  legacyOwnerId: string | null;
  userIds: string[];
  deletingUserIds: string[];
  revision: number;
};

export type IdentityLease = Readonly<{ userId: string; revision: number }>;
export type CharacterIdentityAccess = Record<string, string[]>;
export function createIdentityId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class IdentityBoundaryError extends Error {
  constructor(message = "身份已切换或不可用，请重新打开应用") {
    super(message);
    this.name = "IdentityBoundaryError";
  }
}

export function normalizeIdentitySpace(value: unknown): IdentitySpaceManifest {
  const data = value && typeof value === "object" ? value as Partial<IdentitySpaceManifest> : {};
  const ids = Array.isArray(data.userIds)
    ? [...new Set(data.userIds.filter((id): id is string => typeof id === "string" && id.length > 0))] : [];
  const deleting = Array.isArray(data.deletingUserIds)
    ? [...new Set(data.deletingUserIds.filter(id => ids.includes(id)))] : [];
  const active = typeof data.activeUserId === "string" && ids.includes(data.activeUserId)
    && !deleting.includes(data.activeUserId) ? data.activeUserId : null;
  return {
    version: 1, activeUserId: active,
    legacyOwnerId: typeof data.legacyOwnerId === "string" ? data.legacyOwnerId : null,
    userIds: ids, deletingUserIds: deleting,
    revision: Number.isSafeInteger(data.revision) && Number(data.revision) >= 0 ? Number(data.revision) : 0,
  };
}

/** Called once during migration; old IDs remain intact, and old data has one owner. */
export function initializeIdentitySpace(userIds: string[], previousGlobalUserId?: string): IdentitySpaceManifest {
  const ids = [...new Set(userIds.filter(Boolean))];
  const owner = previousGlobalUserId && ids.includes(previousGlobalUserId)
    ? previousGlobalUserId : ids[0] ?? null;
  return normalizeIdentitySpace({ userIds: ids, activeUserId: owner, legacyOwnerId: owner, revision: 0 });
}

export function switchIdentitySpace(state: IdentitySpaceManifest, userId: string): IdentitySpaceManifest {
  if (!state.userIds.includes(userId) || state.deletingUserIds.includes(userId)) throw new IdentityBoundaryError();
  if (state.activeUserId === userId) return state;
  return { ...state, activeUserId: userId, revision: state.revision + 1 };
}

export function acquireIdentityLease(state: IdentitySpaceManifest): IdentityLease {
  if (!state.activeUserId || state.deletingUserIds.includes(state.activeUserId)) throw new IdentityBoundaryError("请先创建或选择用户身份");
  return Object.freeze({ userId: state.activeUserId, revision: state.revision });
}

/** The revision invalidates A→B→A callbacks as well as plain A→B callbacks. */
export function assertIdentityLease(state: IdentitySpaceManifest, lease: IdentityLease): void {
  if (state.activeUserId !== lease.userId || state.revision !== lease.revision
    || !state.userIds.includes(lease.userId) || state.deletingUserIds.includes(lease.userId)) {
    throw new IdentityBoundaryError();
  }
}

/** Seals writes before any data cleanup; identity metadata remains until cleanup succeeds. */
export function beginIdentityDeletion(state: IdentitySpaceManifest, userId: string): IdentitySpaceManifest {
  if (!state.userIds.includes(userId)) throw new IdentityBoundaryError("身份不存在");
  if (state.deletingUserIds.includes(userId)) return state;
  const deleting = [...state.deletingUserIds, userId];
  return {
    ...state, deletingUserIds: deleting, revision: state.revision + 1,
    activeUserId: state.activeUserId === userId
      ? state.userIds.find(id => !deleting.includes(id)) ?? null : state.activeUserId,
  };
}

/** Only call after every cleanup participant has completed successfully. */
export function finishIdentityDeletion(state: IdentitySpaceManifest, userId: string): IdentitySpaceManifest {
  if (!state.deletingUserIds.includes(userId)) throw new IdentityBoundaryError("身份尚未进入删除流程");
  return { ...state, userIds: state.userIds.filter(id => id !== userId),
    deletingUserIds: state.deletingUserIds.filter(id => id !== userId), revision: state.revision + 1 };
}

export function identityStoragePrefix(userId: string): string {
  return `identity:${encodeURIComponent(userId)}:`;
}

/** Separate app collections/char resources without changing the app's logical IDs. */
export function identityStorageKey(userId: string, logicalKey: string): string {
  return `${identityStoragePrefix(userId)}${logicalKey}`;
}

export function identityCharacterKey(userId: string, characterId: string): string {
  return JSON.stringify([userId, characterId]);
}

export function canIdentityInteract(
  state: IdentitySpaceManifest, access: CharacterIdentityAccess, userId: string, characterId: string,
): boolean {
  if (!state.userIds.includes(userId) || state.deletingUserIds.includes(userId)) return false;
  const valid = (access[characterId] ?? []).filter(id => state.userIds.includes(id));
  return valid.length === 0 || valid.includes(userId);
}

export function removeIdentityAccess(access: CharacterIdentityAccess, userId: string): CharacterIdentityAccess {
  return Object.fromEntries(Object.entries(access).map(([charId, ids]) => [charId, ids.filter(id => id !== userId)]));
}

export type IdentityCleanupParticipant = { name: string; remove: (userId: string) => Promise<void> };

/** Idempotent participants allow retry after partial failure. Never clear a whole shared DB. */
export async function cleanIdentityData(userId: string, participants: IdentityCleanupParticipant[]): Promise<void> {
  const results = await Promise.allSettled(participants.map(participant => participant.remove(userId)));
  const failed = results.flatMap((result, index) => result.status === "rejected" ? [participants[index].name] : []);
  if (failed.length) throw new IdentityBoundaryError(`身份数据删除未完成：${failed.join("、")}`);
}

/** Cancels owned work on switch; the lease also rejects results from uncancellable APIs. */
export class IdentityTaskRegistry {
  private controllers = new Set<AbortController>();
  start(state: IdentitySpaceManifest): { lease: IdentityLease; signal: AbortSignal; release: () => void } {
    const lease = acquireIdentityLease(state);
    const controller = new AbortController();
    this.controllers.add(controller);
    return { lease, signal: controller.signal, release: () => { this.controllers.delete(controller); } };
  }
  silence(): void {
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }
}
