import Dexie, { type Table } from "dexie";
import {
  assertIdentityLease, beginIdentityDeletion, finishIdentityDeletion,
  IdentityBoundaryError, initializeIdentitySpace, normalizeIdentitySpace,
  switchIdentitySpace, type CharacterIdentityAccess, type IdentityLease, type IdentitySpaceManifest,
} from "./identity-space";

type IdentityMetadata = { id: "manifest"; value: IdentitySpaceManifest };
export type IdentityPrivateRecord = {
  id: string;
  userId: string;
  module: string;
  resourceId: string;
  value: unknown;
};
type IdentityAccessRow = { characterId: string; userIds: string[] };

/** Separate database; does not migrate or delete existing app databases on import. */
export class IdentitySpaceDatabase extends Dexie {
  metadata!: Table<IdentityMetadata, string>;
  records!: Table<IdentityPrivateRecord, string>;
  access!: Table<IdentityAccessRow, string>;
  constructor(name = "AiPhoneIdentitySpacesDB") {
    super(name);
    this.version(1).stores({
      metadata: "id",
      records: "id, userId, [userId+module], [userId+module+resourceId]",
      access: "characterId",
    });
  }
}

function privateRecordId(userId: string, module: string, resourceId: string): string {
  return JSON.stringify([userId, module, resourceId]);
}

/** All writers and switch/delete operations include metadata in the same transaction. */
export class IdentitySpaceRepository {
  constructor(readonly db: IdentitySpaceDatabase) {}

  async initialize(userIds: string[], previousGlobalUserId?: string): Promise<IdentitySpaceManifest> {
    return this.db.transaction("rw", this.db.metadata, async () => {
      const existing = await this.db.metadata.get("manifest");
      if (existing) return normalizeIdentitySpace(existing.value);
      const value = initializeIdentitySpace(userIds, previousGlobalUserId);
      await this.db.metadata.put({ id: "manifest", value });
      return value;
    });
  }

  async readState(): Promise<IdentitySpaceManifest> {
    const row = await this.db.metadata.get("manifest");
    if (!row) throw new IdentityBoundaryError("身份空间尚未初始化");
    return normalizeIdentitySpace(row.value);
  }

  async switchTo(userId: string): Promise<IdentitySpaceManifest> {
    return this.db.transaction("rw", this.db.metadata, async () => {
      const value = switchIdentitySpace(await this.readState(), userId);
      await this.db.metadata.put({ id: "manifest", value });
      return value;
    });
  }

  async registerUser(userId: string): Promise<IdentitySpaceManifest> {
    if (!userId) throw new IdentityBoundaryError("身份 ID 不能为空");
    return this.db.transaction("rw", this.db.metadata, async () => {
      const state = await this.readState();
      if (state.deletingUserIds.includes(userId)) throw new IdentityBoundaryError();
      if (state.userIds.includes(userId)) return state;
      const value = { ...state, userIds: [...state.userIds, userId], revision: state.revision + 1 };
      await this.db.metadata.put({ id: "manifest", value });
      return value;
    });
  }

  async read(lease: IdentityLease, module: string, resourceId: string): Promise<unknown> {
    return this.db.transaction("r", this.db.metadata, this.db.records, async () => {
      assertIdentityLease(await this.readState(), lease);
      return (await this.db.records.get(privateRecordId(lease.userId, module, resourceId)))?.value;
    });
  }

  async write(lease: IdentityLease, module: string, resourceId: string, value: unknown): Promise<void> {
    await this.db.transaction("rw", this.db.metadata, this.db.records, async () => {
      assertIdentityLease(await this.readState(), lease);
      await this.db.records.put({ id: privateRecordId(lease.userId, module, resourceId),
        userId: lease.userId, module, resourceId, value });
    });
  }

  async remove(lease: IdentityLease, module: string, resourceId: string): Promise<void> {
    await this.db.transaction("rw", this.db.metadata, this.db.records, async () => {
      assertIdentityLease(await this.readState(), lease);
      await this.db.records.delete(privateRecordId(lease.userId, module, resourceId));
    });
  }

  async list(lease: IdentityLease, module: string): Promise<IdentityPrivateRecord[]> {
    return this.db.transaction("r", this.db.metadata, this.db.records, async () => {
      assertIdentityLease(await this.readState(), lease);
      return this.db.records.where("[userId+module]").equals([lease.userId, module]).toArray();
    });
  }

  async readAccess(): Promise<CharacterIdentityAccess> {
    return Object.fromEntries((await this.db.access.toArray()).map(row => [row.characterId, row.userIds]));
  }

  async setAccess(characterId: string, userIds: string[]): Promise<void> {
    await this.db.transaction("rw", this.db.metadata, this.db.access, async () => {
      const state = await this.readState();
      const valid = [...new Set(userIds)].filter(id => state.userIds.includes(id) && !state.deletingUserIds.includes(id));
      await this.db.access.put({ characterId, userIds: valid });
    });
  }

  async beginDeletion(userId: string): Promise<IdentitySpaceManifest> {
    return this.db.transaction("rw", this.db.metadata, async () => {
      const value = beginIdentityDeletion(await this.readState(), userId);
      await this.db.metadata.put({ id: "manifest", value });
      return value;
    });
  }

  /** External cleanup must finish first. Local records, whitelist and manifest commit atomically. */
  async finishDeletion(userId: string): Promise<IdentitySpaceManifest> {
    return this.db.transaction("rw", this.db.metadata, this.db.records, this.db.access, async () => {
      const value = finishIdentityDeletion(await this.readState(), userId);
      await this.db.records.where("userId").equals(userId).delete();
      const policies = await this.db.access.toArray();
      await this.db.access.bulkPut(policies.map(row => ({ ...row, userIds: row.userIds.filter(id => id !== userId) })));
      await this.db.metadata.put({ id: "manifest", value });
      return value;
    });
  }
}
