import { kvGet, kvSet } from "./kv-db";
import { BUBBLE_COLORS_EVENT, type BubbleColors } from "./chat-bubble-colors";
export type ColorScope = "local" | "global";
type RecordValue = { revision: number; colors: BubbleColors };
export type ColorHistory = RecordValue & { id: string; name?: string; scope: ColorScope; sessionId: string; createdAt: number };
export type ColorStore = { revision: number; global?: RecordValue; locals: Record<string, RecordValue>; history: ColorHistory[] };
const KEY = "chat-bubble-color-settings-v1";
export function readColorStore(): ColorStore {
    try { const v = JSON.parse(kvGet(KEY) || "null"); if (v && typeof v.revision === "number" && v.locals && Array.isArray(v.history)) return v; } catch { /* Old or damaged settings fall back safely. */ }
    return { revision: 0, locals: {}, history: [] };
}
export function effectiveColors(store: ColorStore, sessionId: string, legacy: BubbleColors = {}): BubbleColors {
    const local = store.locals[sessionId];
    if (store.global && (!local || store.global.revision >= local.revision)) return { ...store.global.colors };
    return { ...(local?.colors || legacy) };
}
export function loadBubbleColors(sessionId: string, legacy: BubbleColors = {}) { return effectiveColors(readColorStore(), sessionId, legacy); }
export function deleteColorHistory(id: string) {
    const store = readColorStore();
    const next = { ...store, history: store.history.filter(entry => entry.id !== id) };
    // Removing a saved snapshot must never change the applied colors or revision.
    kvSet(KEY, JSON.stringify(next));
    return next.history;
}
export function renameColorHistory(id: string, name: string) {
    const store = readColorStore();
    const next = { ...store, history: store.history.map(entry=>entry.id===id?{...entry,name:name.trim().slice(0,40) || undefined}:entry) };
    kvSet(KEY,JSON.stringify(next));
    return next.history;
}
export function updateColorStore(store: ColorStore, sessionId: string, colors: BubbleColors, scope: ColorScope, remember = false): ColorStore {
    const revision = store.revision + 1;
    const record = { revision, colors: { ...colors } };
    const next = { ...store, revision, locals: { ...store.locals }, history: [...store.history] };
    if (scope === "global") next.global = record;
    else next.locals[sessionId] = record;
    if (remember) next.history.unshift({ ...record, id: String(revision), scope, sessionId, createdAt: Date.now() });
    return next;
}
export function saveBubbleColors(sessionId: string, colors: BubbleColors, scope: ColorScope = "local", remember = false) {
    // Dedicated KV settings avoid stale message/session saves overwriting colors.
    const next = updateColorStore(readColorStore(), sessionId, colors, scope, remember);
    kvSet(KEY, JSON.stringify(next));
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(BUBBLE_COLORS_EVENT, { detail: sessionId }));
    return next;
}
