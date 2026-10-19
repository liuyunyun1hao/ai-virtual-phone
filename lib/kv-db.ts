import { identityLocalStorage } from "@/lib/identity-runtime";
// lib/kv-db.ts
// Generic IndexedDB-backed key-value store with synchronous in-memory cache.
// Replaces all localStorage usage to avoid the ~5-10MB quota limit.

import Dexie from "dexie";
import { physicalIdentityKey, logicalIdentityKey, isSharedIdentityKey, assertIdentityActive } from "./identity-runtime";

class KvDatabase extends Dexie {
    entries!: Dexie.Table<{ key: string; value: string }, string>;
    constructor() {
        super("AiPhoneKvDB");
        this.version(1).stores({ entries: "key" });
    }
}

const kvDb = new KvDatabase();
if (typeof window !== "undefined") window.addEventListener("float-identity-silenced", () => kvDb.close());

// ── In-memory cache ──
const _cache = new Map<string, string>();
let _hydrated = false;
const failedWrites = new Set<string>();
let lastFailureNotice = 0;
function writeFailed(key: string, value: string): void {
    if (_cache.get(key) !== value) return;
    failedWrites.add(key);
    if (typeof window !== "undefined" && Date.now() - lastFailureNotice > 15_000) {
        lastFailureNotice = Date.now();
        window.dispatchEvent(new CustomEvent("global-notice", { detail: "部分数据尚未保存，请保持页面打开、检查设备存储空间；返回页面时会重试。" }));
    }
}
export async function retryFailedKvWrites(): Promise<void> {
    for (const key of [...failedWrites]) {
        const value = _cache.get(key);
        if (value === undefined) { failedWrites.delete(key); continue; }
        await kvSetAsync(key, value);
    }
}
if (typeof window !== "undefined") {
    window.addEventListener("focus", () => { void retryFailedKvWrites().catch(() => undefined); });
    window.addEventListener("beforeunload", event => {
        if (failedWrites.size) { event.preventDefault(); event.returnValue = ""; }
    });
}

// ── Migration registry ──
const _fixedKeys: string[] = [];
const _dynamicPrefixes: string[] = [];

export function registerKvMigration(lsKey: string): void {
    _fixedKeys.push(lsKey);
    // If hydration already ran, this module was imported late (e.g. a lazily
    // loaded app). Migrate its key now so its localStorage data isn't stranded
    // forever — hydrateKvDb only migrates keys registered before it ran.
    if (_hydrated) migrateLegacyKey(lsKey);
}

export function registerDynamicPrefix(prefix: string): void {
    _dynamicPrefixes.push(prefix);
    if (_hydrated) migrateLegacyPrefix(prefix);
}

// Migrate a single legacy localStorage key into the cache + IDB, then drop it
// from localStorage. Used by both initial hydration and late registration.
function migrateLegacyKey(lsKey: string): void {
    if (typeof window === "undefined") return;
    const raw = identityLocalStorage.getItem(lsKey);
    if (raw === null) return;
    _cache.set(lsKey, raw);
    // Cache equality is not proof of a committed write (a previous attempt may
    // have failed). Keep the durable source until this exact value commits.
    kvDb.entries.put({ key: physicalIdentityKey(lsKey), value: raw }).then(() => {
        if (_cache.get(lsKey) === raw) failedWrites.delete(lsKey);
        removeLegacyLocalStorageKeyIfValue(lsKey, raw);
    }).catch(err => {
        writeFailed(lsKey, raw);
        console.warn("[KvDB] migration pending:", lsKey, err);
    });
}

function migrateLegacyPrefix(prefix: string): void {
    if (typeof window === "undefined") return;
    const matched: string[] = [];
    for (let i = 0; i < identityLocalStorage.length; i++) {
        const k = identityLocalStorage.key(i);
        if (k && k.startsWith(prefix)) matched.push(k);
    }
    for (const k of matched) migrateLegacyKey(k);
}

function matchesDynamicPrefix(key: string): boolean {
    return _dynamicPrefixes.some(prefix => key.startsWith(prefix));
}

function isManagedLegacyKey(key: string): boolean {
    return _fixedKeys.includes(key) || matchesDynamicPrefix(key);
}

function removeLegacyLocalStorageKey(key: string): void {
    if (typeof window === "undefined") return;
    try {
        identityLocalStorage.removeItem(key);
    } catch {
        // Ignore localStorage cleanup failures; IndexedDB remains the source of truth.
    }
}

function removeLegacyLocalStorageKeyIfValue(key: string, value: string): void {
    if (typeof window === "undefined") return;
    try {
        if (identityLocalStorage.getItem(key) === value) identityLocalStorage.removeItem(key);
    } catch {
        // Ignore localStorage cleanup failures; IndexedDB remains the source of truth.
    }
}

// localStorage 配额只有 ~5MB,超过这个量级的 value(如自定义APP的整批
// 音频/封面 dataURL)镜像必失败,setItem 前还得整份拷贝一次内存——直接跳过。
const LOCAL_STORAGE_MIRROR_MAX_LENGTH = 400_000;

function writeFallbackLocalStorage(key: string, value: string): void {
    if (typeof window === "undefined" || !isManagedLegacyKey(key)) return;
    if (value.length > LOCAL_STORAGE_MIRROR_MAX_LENGTH) return;
    try {
        identityLocalStorage.setItem(key, value);
    } catch {
        // Ignore fallback persistence failures; in-memory cache is already updated.
    }
}

function isAbortLikeError(err: unknown): boolean {
    if (!err || typeof err !== "object") return false;
    const maybe = err as { name?: string; message?: string; inner?: unknown };
    return (
        maybe.name === "AbortError"
        || maybe.message?.includes("transaction was aborted") === true
        || isAbortLikeError(maybe.inner)
    );
}

// ── Hydration (call once at app startup) ──
let hydrationPromise: Promise<void> | null = null;
export function hydrateKvDb(): Promise<void> {
    if (hydrationPromise) return hydrationPromise;
    hydrationPromise = hydrateKvDbOnce();
    return hydrationPromise;
}
async function hydrateKvDbOnce(): Promise<void> {
    if (_hydrated || typeof window === "undefined") return;
    const { resumeIdentityRecovery } = await import("./identity-recovery");
    if (await resumeIdentityRecovery()) {
        const { requestPhoneSessionRemount } = await import("./phone-session-protocol");
        requestPhoneSessionRemount();
        throw new Error("数据恢复已完成，请刷新进入");
    }
    try {
        // Select keys before reading values: other identities may contain large
        // inline media and must not be materialized just to discard them.
        const keys = (await kvDb.entries.toCollection().primaryKeys())
            .filter(key => logicalIdentityKey(key) !== null);
        for (let offset = 0; offset < keys.length; offset += 32) {
            const rows = await kvDb.entries.bulkGet(keys.slice(offset, offset + 32));
            for (const row of rows) {
                if (!row) continue;
                const key = logicalIdentityKey(row.key);
                if (key !== null && !_cache.has(key)) _cache.set(key, row.value);
            }
        }

        // Migrate from localStorage
        const batch: { key: string; value: string }[] = [];
        const removeKeys = new Set<string>();

        // Fixed keys
        for (const lsKey of _fixedKeys) {
            const raw = identityLocalStorage.getItem(lsKey);
            if (raw === null) continue;
            if (_cache.get(lsKey) !== raw) {
                batch.push({ key: physicalIdentityKey(lsKey), value: raw });
                _cache.set(lsKey, raw);
            }
            removeKeys.add(lsKey);
        }

        // Dynamic prefix keys
        for (let i = 0; i < identityLocalStorage.length; i++) {
            const k = identityLocalStorage.key(i);
            if (!k || !matchesDynamicPrefix(k)) continue;
            const raw = identityLocalStorage.getItem(k);
            if (raw !== null) {
                if (_cache.get(k) !== raw) {
                    batch.push({ key: physicalIdentityKey(k), value: raw });
                    _cache.set(k, raw);
                }
                removeKeys.add(k);
            }
        }

        if (batch.length > 0) await kvDb.entries.bulkPut(batch);
        for (const k of removeKeys) identityLocalStorage.removeItem(k);
    } catch (err) {
        console.warn("[KvDB] hydration error:", err);
        throw err;
    }
    _hydrated = true;
    const { initializePhoneIdentity } = await import("./identity-lifecycle");
    await initializePhoneIdentity(_cache);
}

// ── Synchronous read (IndexedDB-backed in-memory cache only) ──
/** kv 是否已从 IndexedDB 水合完成。孤儿素材清理等「以 kv 内容为安全依据」的
 *  流程必须先确认此状态：未水合时 kvEntries() 是空的，扫不到引用会导致误删。 */
export function isKvHydrated(): boolean {
    return _hydrated;
}

export function kvGet(key: string): string | null {
    const cached = _cache.get(key);
    if (cached !== undefined) return cached;
    return null;
}

// ── Write: update cache + fire-and-forget to IDB ──
export function kvSet(key: string, value: string): void {
    if (!isSharedIdentityKey(key)) assertIdentityActive();
    _cache.set(key, value);
    if (isManagedLegacyKey(key)) writeFallbackLocalStorage(key, value);
    kvDb.entries.put({ key: physicalIdentityKey(key), value }).then(() => {
        if (_cache.get(key) === value) failedWrites.delete(key);
        if (isManagedLegacyKey(key)) removeLegacyLocalStorageKeyIfValue(key, value);
    }).catch(err => {
        if (_cache.get(key) === value) writeFallbackLocalStorage(key, value);
        writeFailed(key, value);
        if (!isAbortLikeError(err)) {
            console.warn("[KvDB] put failed:", key, err);
        }
    });
}

export async function kvSetAsync(key: string, value: string): Promise<void> {
    if (!isSharedIdentityKey(key)) assertIdentityActive();
    _cache.set(key, value);
    if (isManagedLegacyKey(key)) writeFallbackLocalStorage(key, value);
    try {
        await kvDb.entries.put({ key: physicalIdentityKey(key), value });
        if (_cache.get(key) === value) failedWrites.delete(key);
        if (isManagedLegacyKey(key)) removeLegacyLocalStorageKeyIfValue(key, value);
    } catch (err) {
        if (_cache.get(key) === value) writeFallbackLocalStorage(key, value);
        writeFailed(key, value);
        if (!isAbortLikeError(err)) {
            console.warn("[KvDB] put failed:", key, err);
        }
        throw err;
    }
}

// ── Delete ──
export function kvRemove(key: string): void {
    if (!isSharedIdentityKey(key)) assertIdentityActive();
    _cache.delete(key);
    failedWrites.delete(key);
    if (isManagedLegacyKey(key)) removeLegacyLocalStorageKey(key);
    kvDb.entries.delete(physicalIdentityKey(key)).catch(err =>
        console.warn("[KvDB] delete failed:", key, err));
}

// ── Iterate keys with a prefix (for dynamic keys) ──
export function kvKeysWithPrefix(prefix: string): string[] {
    const result: string[] = [];
    for (const k of _cache.keys()) {
        if (k.startsWith(prefix)) result.push(k);
    }
    return result;
}

export function kvEntries(): Array<{ key: string; value: string }> {
    return Array.from(_cache.entries()).map(([key, value]) => ({ key, value }));
}

/** Commit a legacy split and removal together; concurrent per-record edits win. */
export async function migrateKvRecords(sourceKey: string, raw: string, records: Array<{ key: string; value: string }>): Promise<void> {
    assertIdentityActive();
    const source = physicalIdentityKey(sourceKey);
    const added: typeof records = [];
    await kvDb.transaction("rw", kvDb.entries, async () => {
        if ((await kvDb.entries.get(source))?.value !== raw) return;
        for (const record of records) {
            const key = physicalIdentityKey(record.key);
            if (await kvDb.entries.get(key)) continue;
            await kvDb.entries.put({ key, value: record.value });
            added.push(record);
        }
        await kvDb.entries.delete(source);
    });
    for (const record of added) if (!_cache.has(record.key)) _cache.set(record.key, record.value);
    if (_cache.get(sourceKey) === raw && !(await kvDb.entries.get(source))) {
        _cache.delete(sourceKey);
        removeLegacyLocalStorageKeyIfValue(sourceKey, raw);
    }
}
