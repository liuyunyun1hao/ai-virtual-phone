import { kvGet, kvSet } from "./kv-db";
import { canIdentityInteract, IdentityBoundaryError } from "./identity-space";
import { readIdentityRuntime, getCurrentIdentityId, assertIdentityActive, IDENTITY_ACCESS_KEY } from "./identity-runtime";

export function loadCharacterIdentityAccess(): Record<string, string[]> {
  try { return JSON.parse(kvGet(IDENTITY_ACCESS_KEY) ?? "{}"); } catch { return {}; }
}
export function getCharacterIdentityAccess(characterId: string): string[] {
  const state = readIdentityRuntime();
  return (loadCharacterIdentityAccess()[characterId] ?? []).filter(id => state?.userIds.includes(id));
}
export function setCharacterIdentityAccess(characterId: string, userIds: string[]): void {
  const state = readIdentityRuntime();
  const policy = loadCharacterIdentityAccess();
  policy[characterId] = [...new Set(userIds)].filter(id => state?.userIds.includes(id) && !state.deletingUserIds.includes(id));
  kvSet(IDENTITY_ACCESS_KEY, JSON.stringify(policy));
  window.dispatchEvent(new Event("settings-bindings-updated"));
}
export function canCurrentIdentityInteract(characterId: string): boolean {
  const state = readIdentityRuntime();
  if (!state) return true; // Startup migration has not assigned the old namespace yet.
  const userId = getCurrentIdentityId();
  return Boolean(userId && canIdentityInteract(state, loadCharacterIdentityAccess(), userId, characterId));
}
export function assertCharacterIdentityAccess(characterId: string): void {
  assertIdentityActive();
  if (!canCurrentIdentityInteract(characterId)) throw new IdentityBoundaryError("当前身份不能与这个角色互动");
}
