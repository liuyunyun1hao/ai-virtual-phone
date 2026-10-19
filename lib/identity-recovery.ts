/** Local pre-migration snapshots; never exported or sent to a server automatically. */
import Dexie, { type Table, type IndexableTypeArrayReadonly } from "dexie";
import { withBackupOperation } from "./data-management/operation-lock";
import { createIdentityId } from "./identity-space";
import { IDENTITY_RUNTIME_KEY, isSharedIdentityKey, identityDatabaseIsShared, silenceIdentityRuntime } from "./identity-runtime";
type RecoveryMeta = { id: string; createdAt: string; complete: boolean; local: Array<[string, string]>; databases: Array<{ name: string; version: number; stores: Array<{ name: string; chunkCount?: number; keyPath: string | string[] | null; autoIncrement: boolean; indexes: Array<{ name: string; keyPath: string | string[]; unique: boolean; multiEntry: boolean }> }> }> };
type RecoveryChunk = { id: string; recoveryId: string; database: string; store: string; rows: unknown[]; keys: IDBValidKey[] };
class RecoveryDb extends Dexie {
  points!: Table<RecoveryMeta, string>;
  chunks!: Table<RecoveryChunk, string>;
  operations!: Table<{ id: string; data: unknown }, string>;
  constructor() { super("AiPhoneIdentityRecoveryDB"); this.version(1).stores({ points: "id, createdAt", chunks: "id, recoveryId" });
    this.version(2).stores({ points: "id, createdAt", chunks: "id, recoveryId, [recoveryId+database+store]", operations: "id" }); }
}
const recovery = new RecoveryDb();
export async function readIdentityOperation<T>(id: string): Promise<T | undefined> { return (await recovery.operations.get(id))?.data as T | undefined; }
export async function saveIdentityOperation(id: string, data: unknown): Promise<void> { await recovery.operations.put({ id, data }); }
export async function removeIdentityOperation(id: string): Promise<void> { await recovery.operations.delete(id); }
/** Deletion also removes the deleted world's private copies from local recovery points. */
export async function purgeIdentityRecoveryData(userId: string, legacyOwnerId: string | null, removedAssetIds: string[]): Promise<void> {
  const prefix = `identity:${encodeURIComponent(userId)}:`;
  const ownsKey = (key: string) => userId === legacyOwnerId ? !key.startsWith("identity:") && !isSharedIdentityKey(key) && key !== IDENTITY_RUNTIME_KEY : key.startsWith(prefix);
  const ownsDb = (name: string) => !identityDatabaseIsShared(name) && (userId === legacyOwnerId ? !name.includes("::identity:") : name.endsWith(`::identity:${encodeURIComponent(userId)}`));
  await recovery.transaction("rw", recovery.points, recovery.chunks, async () => {
    for (const point of await recovery.points.toArray()) {
      point.databases = point.databases.filter(database => !ownsDb(database.name));
      point.local = point.local.filter(([key]) => !ownsKey(key)).map(([key, value]) => {
        if (key === IDENTITY_RUNTIME_KEY) {
          const state = JSON.parse(value);
          state.userIds = state.userIds.filter((id: string) => id !== userId);
          state.deletingUserIds = state.deletingUserIds.filter((id: string) => id !== userId);
          if (state.activeUserId === userId) state.activeUserId = state.userIds[0] ?? null;
          return [key, JSON.stringify(state)];
        }
        return [key, value];
      });
      await recovery.points.put(point);
      for (const chunkId of await recovery.chunks.where("recoveryId").equals(point.id).primaryKeys()) {
        const chunk = (await recovery.chunks.get(chunkId))!;
        if (ownsDb(chunk.database)) { await recovery.chunks.delete(chunk.id); continue; }
        const keep = (row: any) => {
          if (chunk.database === "AiPhoneKvDB") return !ownsKey(row.key);
          if (chunk.database === "ai_phone_theme_db_v1") return !removedAssetIds.includes(row.id);
          return true;
        };
        const indices = chunk.rows.map((_, i) => i).filter(i => keep(chunk.rows[i]));
        chunk.rows = indices.map(i => {
          const row = chunk.rows[i] as { key?: string; value?: string };
          if (row.key === "ai_phone_user_identities_v1") return { ...row, value: JSON.stringify(JSON.parse(row.value!).filter((identity: { id: string }) => identity.id !== userId)) };
          if (row.key === "float_identity_character_access_v1") return { ...row, value: JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(row.value!)).map(([charId, ids]) => [charId, (ids as string[]).filter(id => id !== userId)]))) };
          return row;
        });
        chunk.keys = indices.map(i => chunk.keys[i]);
        await recovery.chunks.put(chunk);
      }
    }
  });
}
function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
export async function createIdentityRecoveryPoint(): Promise<string> {
  const id = `identity-before-${createIdentityId()}`;
  const local: Array<[string, string]> = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i); if (key) local.push([key, window.localStorage.getItem(key) ?? ""]);
  }
  const meta: RecoveryMeta = { id, createdAt: new Date().toISOString(), complete: false, local, databases: [] };
  await recovery.points.put(meta);
  if (!indexedDB.databases) throw new Error("当前浏览器无法建立完整身份备份，请先升级浏览器");
  const databases = await indexedDB.databases();
  try {
    for (const entry of databases) {
      if (!entry.name || entry.name === "AiPhoneIdentityRecoveryDB") continue;
      const db = await req(indexedDB.open(entry.name));
      try {
        const definition: RecoveryMeta["databases"][number] = { name: db.name, version: db.version, stores: [] };
        for (const name of Array.from(db.objectStoreNames)) {
          const info = db.transaction(name).objectStore(name);
          definition.stores.push({ name, keyPath: info.keyPath, autoIncrement: info.autoIncrement,
            indexes: Array.from(info.indexNames).map(indexName => { const index = info.index(indexName); return { name: index.name, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry }; }) });
          let lastKey: IDBValidKey | undefined; let chunk = 0;
          while (true) {
            const store = db.transaction(name).objectStore(name);
            const range = lastKey === undefined ? undefined : IDBKeyRange.lowerBound(lastKey, true);
            const [rows, keys] = await Promise.all([req(store.getAll(range, 64)), req(store.getAllKeys(range, 64))]);
            if (!keys.length) break;
            await recovery.chunks.put({ id: JSON.stringify([id, db.name, name, chunk++]), recoveryId: id, database: db.name, store: name, rows, keys });
            lastKey = keys[keys.length - 1];
          }
          definition.stores[definition.stores.length - 1].chunkCount = chunk;
        }
        meta.databases.push(definition);
      } finally { db.close(); }
    }
    meta.complete = true; await recovery.points.put(meta); return id;
  } catch (error) {
    await recovery.chunks.where("recoveryId").equals(id).delete();
    await recovery.points.delete(id); throw error;
  }
}
export async function listIdentityRecoveryPoints(): Promise<Array<{ id: string; createdAt: string }>> {
  return (await recovery.points.toArray()).filter(point => point.complete).map(({ id, createdAt }) => ({ id, createdAt }));
}

type RestoreProgress = { recoveryId: string; completed: string[] };

/** Each database commits atomically; the durable journal resumes across databases. */
export async function restoreIdentityRecoveryPoint(id: string): Promise<void> {
  return withBackupOperation(() => restorePoint(id));
}
async function restorePoint(id: string): Promise<void> {
  const point = await recovery.points.get(id);
  if (!point?.complete) throw new Error("身份恢复点不存在或不完整");
  const pending = await readIdentityOperation<RestoreProgress>("restore");
  if (pending && pending.recoveryId !== id) throw new Error("请先完成上一次恢复");
  // Validate all chunks before changing any live data. Read one chunk at a time.
  const groups = new Map<string, string[]>();
  for (const definition of point.databases) for (const info of definition.stores) {
    const ids = await recovery.chunks.where("[recoveryId+database+store]").equals([id, definition.name, info.name]).primaryKeys();
    if (info.chunkCount !== undefined && ids.length !== info.chunkCount) throw new Error("恢复点缺少分块，未开始恢复");
    for (const chunkId of ids) {
      const chunk = await recovery.chunks.get(chunkId);
      if (!chunk || chunk.rows.length !== chunk.keys.length) throw new Error("恢复点分块不完整，未开始恢复");
    }
    groups.set(JSON.stringify([definition.name, info.name]), ids);
  }
  const progress = pending || { recoveryId: id, completed: [] };
  await saveIdentityOperation("restore", progress);
  silenceIdentityRuntime();
  for (const definition of point.databases) {
    if (progress.completed.includes(definition.name)) continue;
    const existing = (await indexedDB.databases()).find(db => db.name === definition.name);
    const request = indexedDB.open(definition.name, existing?.version || definition.version);
    request.onupgradeneeded = () => {
      for (const info of definition.stores) {
        const store = request.result.createObjectStore(info.name, { keyPath: info.keyPath, autoIncrement: info.autoIncrement });
        for (const index of info.indexes) store.createIndex(index.name, index.keyPath, { unique: index.unique, multiEntry: index.multiEntry });
      }
    };
    request.onblocked = () => { /* No data has been deleted; closing the other tab allows progress. */ };
    const native = await req(request);
    try {
      for (const info of definition.stores) {
        if (!native.objectStoreNames.contains(info.name) || JSON.stringify(native.transaction(info.name).objectStore(info.name).keyPath) !== JSON.stringify(info.keyPath)) {
          throw new Error("数据库结构与恢复点不一致，已保留现有数据，请使用文件备份导入");
        }
      }
    } finally { native.close(); }
    const target = new Dexie(definition.name);
    try {
      await target.open();
      if (target.tables.length) await target.transaction("rw", target.tables, async () => {
        for (const table of target.tables) await table.clear();
        for (const info of definition.stores) {
          for (const chunkId of groups.get(JSON.stringify([definition.name, info.name])) || []) {
            // Hold the target transaction while reading a single external chunk.
            const chunk = await Dexie.waitFor(Dexie.ignoreTransaction(() => recovery.chunks.get(chunkId)));
            if (!chunk) throw new Error("恢复分块已丢失");
            if (info.keyPath === null) await target.table(info.name).bulkPut(chunk.rows, chunk.keys as IndexableTypeArrayReadonly);
            else await target.table(info.name).bulkPut(chunk.rows);
          }
        }
      });
    } finally { target.close(); }
    progress.completed.push(definition.name);
    await saveIdentityOperation("restore", progress);
  }
  // Only after all snapshot databases committed may obsolete databases be removed.
  for (const db of await indexedDB.databases()) {
    if (!db.name || db.name === "AiPhoneIdentityRecoveryDB" || point.databases.some(d => d.name === db.name)) continue;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(db.name!);
      request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("其他页面占用数据库，关闭后刷新可继续恢复"));
    });
  }
  // Do not clear the whole storage first: a quota failure leaves the journal for retry.
  const keys = new Set(point.local.map(([key]) => key));
  for (const [key, value] of point.local) window.localStorage.setItem(key, value);
  for (const key of Object.keys(window.localStorage)) if (!keys.has(key)) window.localStorage.removeItem(key);
  await removeIdentityOperation("restore");
}

export async function resumeIdentityRecovery(): Promise<boolean> {
  const pending = await readIdentityOperation<RestoreProgress>("restore");
  if (!pending) return false;
  await restoreIdentityRecoveryPoint(pending.recoveryId);
  return true;
}
