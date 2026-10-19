import { identityDatabaseIsShared } from "./identity-runtime";

const req = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
function scanStore(db: IDBDatabase, store: string, visit: (row: any) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store);
    const cursor = tx.objectStore(store).openCursor();
    cursor.onsuccess = () => { const row = cursor.result; if (row) { visit(row.value); row.continue(); } };
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
/** Keep only reference IDs in memory; never stringify whole private databases. */
export async function planIdentityMediaDeletion(userId: string, legacyOwnerId: string | null, ownsKey: (key: string) => boolean): Promise<string[]> {
  const databases = await indexedDB.databases();
  if (!databases.some(database => database.name === "ai_phone_theme_db_v1")) return [];
  const candidates = new Map<string, string | undefined>();
  const theme = await req(indexedDB.open("ai_phone_theme_db_v1"));
  try {
    if (!theme.objectStoreNames.contains("assets")) return [];
    await scanStore(theme, "assets", asset => {
      if (["chat_bg", "vn_scene", "vn_sprite"].includes(asset.type) && (!asset.ownerUserId || asset.ownerUserId === userId)) candidates.set(asset.id, asset.ownerUserId);
    });
  } finally { theme.close(); }
  const owned = new Set<string>(), retained = new Set<string>();
  const collect = (value: unknown, ids: Set<string>, depth = 0): void => {
    if (depth > 100) throw new Error("素材引用过深，保留数据并停止删除");
    if (typeof value === "string") {
      if (value.startsWith("data:")) return;
      for (const id of candidates.keys()) if (value.includes(id)) ids.add(id);
    } else if (value && typeof value === "object" && !(value instanceof Blob) && !(value instanceof ArrayBuffer) && !ArrayBuffer.isView(value)) {
      for (const child of Object.values(value)) collect(child, ids, depth + 1);
    }
  };
  for (const database of databases) {
    if (!database.name || database.name === "AiPhoneIdentityRecoveryDB" || database.name === "ai_phone_theme_db_v1") continue;
    const isOwned = !identityDatabaseIsShared(database.name) && (userId === legacyOwnerId ? !database.name.includes("::identity:") : database.name.endsWith("::identity:" + encodeURIComponent(userId)));
    const db = await req(indexedDB.open(database.name));
    try {
      for (const store of Array.from(db.objectStoreNames)) {
        await scanStore(db, store, row => collect(row, database.name === "AiPhoneKvDB" ? (ownsKey(row.key) ? owned : retained) : isOwned ? owned : retained));
      }
    } finally { db.close(); }
  }
  return [...candidates].filter(([id, owner]) => (owner === userId || owned.has(id)) && !retained.has(id)).map(([id]) => id);
}

export async function removeIdentityMediaIds(deleted: string[]): Promise<void> {
  if (!deleted.length) return;
  const theme = await req(indexedDB.open("ai_phone_theme_db_v1"));
  try {
    const tx = theme.transaction("assets", "readwrite");
    const done = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
    for (const id of deleted) tx.objectStore("assets").delete(id);
    await done;
  } finally { theme.close(); }
}
