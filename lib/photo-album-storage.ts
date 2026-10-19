import { getChatImageFromIndexedDB } from "./chat-asset-storage";
import { withChatCharacterAvatar } from "./chat-session-avatar";
import {
  CHAT_MESSAGES_DELETED_EVENT,
  CHAT_MESSAGE_PUSHED_EVENT,
  CHAT_RESPONSE_BATCH_REPLACED_EVENT,
  loadChatMessages,
  getChatSessionMetadata,
  type ChatMessage,
  type ChatPhotoAnnotation,
  type ChatSession,
} from "./chat-storage";
import { loadInteractableCharacters as loadCharacters } from "./character-storage";
import { deleteMediaRef, isMediaStoreRef, loadMediaObjectUrl } from "./media-cache-storage";
import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import { deleteThemeAsset } from "./theme-storage";
import { attachPhotoVersions, relocatePhotoMedia } from "./photo-album-core";

const PHOTO_ALBUM_STORAGE_KEY = "ai_phone_photo_album_v1";
let favoriteRaw: string | null | undefined;
let favoriteIds = new Set<string>();
/** Metadata only: never walk chat histories to protect a favorite. */
export function isFavoriteChatPhoto(sessionId: string, messageId: string): boolean {
  const raw = kvGet(PHOTO_ALBUM_STORAGE_KEY);
  if (raw !== favoriteRaw) {
    try { favoriteIds = new Set(JSON.parse(raw || "{}").favorites || []); }
    catch { return true; } // Corrupt metadata must not authorize media deletion.
    favoriteRaw = raw;
  }
  return favoriteIds.has(`chat:${sessionId}:${messageId}`);
}
export const PHOTO_ALBUM_UPDATED_EVENT = "photo-album-updated";
export const getPhotoAlbumSourceUpdatedEvents = () => [
  CHAT_MESSAGE_PUSHED_EVENT,
  CHAT_MESSAGES_DELETED_EVENT,
  CHAT_RESPONSE_BATCH_REPLACED_EVENT,
  "chat-messages-updated",
  "chat-session-avatars-updated",
] as const;

registerKvMigration(PHOTO_ALBUM_STORAGE_KEY);

export type PhotoAlbumSource =
  | { kind: "chat"; sessionId: string; messageId: string }
  | { kind: "album"; assetVersionId: string };

export type PhotoAlbumMediaKind = "photo" | "text_photo";

export type AlbumNativeAssetRecord = {
  contentVersion?: string;
  uploadAlbum?: string;
  assetVersionId: string;
  mediaRef?: string;
  label: string;
  photoKind: PhotoAlbumMediaKind;
  createdAt: string;
};

export type PhotoAlbumState = {
  version: 1;
  favorites: string[];
  exclusions: string[];
  albumAnnotations: Record<string, ChatPhotoAnnotation[]>;
  nativeAssets: AlbumNativeAssetRecord[];
};

export type PhotoAlbumConversation = {
  id: string;
  kind: "private" | "group";
  title: string;
  avatar?: string;
  memberAvatars: string[];
};

export type PhotoAlbumAsset = {
  canonicalPhotoId?: string;
  contentVersion?: string;
  variantVersion?: string;
  uploadAlbum?: string;
  id: string;
  source: PhotoAlbumSource;
  mediaRef?: string;
  mediaKind: PhotoAlbumMediaKind;
  label: string;
  createdAt: string;
  conversation?: PhotoAlbumConversation;
  senderLabel: string;
  baseAnnotations: ChatPhotoAnnotation[];
  albumAnnotations: ChatPhotoAnnotation[];
  favorite: boolean;
};

const EMPTY_STATE: PhotoAlbumState = {
  version: 1,
  favorites: [],
  exclusions: [],
  albumAnnotations: {},
  nativeAssets: [],
};

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))];
}

function normalizeAnnotations(value: unknown): Record<string, ChatPhotoAnnotation[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, ChatPhotoAnnotation[]> = {};
  for (const [key, marks] of Object.entries(value)) {
    if (!key || !Array.isArray(marks)) continue;
    result[key] = marks.filter((mark): mark is ChatPhotoAnnotation => Boolean(mark && typeof mark === "object" && typeof mark.id === "string"));
  }
  return result;
}

function normalizeNativeAssets(value: unknown): AlbumNativeAssetRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): AlbumNativeAssetRecord[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Partial<AlbumNativeAssetRecord>;
    if (!item.assetVersionId || !item.createdAt || !item.label) return [];
    return [{
      assetVersionId: item.assetVersionId,
      contentVersion: item.contentVersion,
      mediaRef: item.mediaRef,
      label: item.label,
      photoKind: item.photoKind === "text_photo" ? "text_photo" : "photo",
      createdAt: item.createdAt,
      uploadAlbum: typeof item.uploadAlbum === "string" ? item.uploadAlbum : undefined,
    }];
  });
}

export function loadPhotoAlbumState(): PhotoAlbumState {
  try {
    const raw = kvGet(PHOTO_ALBUM_STORAGE_KEY);
    if (!raw) return { ...EMPTY_STATE, albumAnnotations: {}, nativeAssets: [] };
    const parsed = JSON.parse(raw) as Partial<PhotoAlbumState>;
    return {
      version: 1,
      favorites: uniqueStrings(parsed.favorites),
      exclusions: uniqueStrings(parsed.exclusions),
      albumAnnotations: normalizeAnnotations(parsed.albumAnnotations),
      nativeAssets: normalizeNativeAssets(parsed.nativeAssets),
    };
  } catch {
    return { ...EMPTY_STATE, albumAnnotations: {}, nativeAssets: [] };
  }
}

function savePhotoAlbumState(state: PhotoAlbumState): void {
  kvSet(PHOTO_ALBUM_STORAGE_KEY, JSON.stringify(state));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PHOTO_ALBUM_UPDATED_EVENT, { detail: state }));
  }
}

function patchPhotoAlbumState(patch: (state: PhotoAlbumState) => PhotoAlbumState): PhotoAlbumState {
  const next = patch(loadPhotoAlbumState());
  savePhotoAlbumState(next);
  return next;
}

export function photoAlbumSourceId(source: PhotoAlbumSource): string {
  return source.kind === "chat"
    ? `chat:${source.sessionId}:${source.messageId}`
    : `album:${source.assetVersionId}`;
}

export function setPhotoAlbumFavorite(assetId: string, favorite: boolean): PhotoAlbumState {
  return patchPhotoAlbumState((state) => ({
    ...state,
    favorites: favorite
      ? [...new Set([...state.favorites, assetId])]
      : state.favorites.filter((id) => id !== assetId),
  }));
}

export function setPhotoAlbumFavorites(assetIds: string[], favorite: boolean): PhotoAlbumState {
  const targets = new Set(assetIds);
  return patchPhotoAlbumState((state) => ({
    ...state,
    favorites: favorite
      ? [...new Set([...state.favorites, ...assetIds])]
      : state.favorites.filter((id) => !targets.has(id)),
  }));
}

export function excludeChatPhotosFromAlbum(assetIds: string[]): PhotoAlbumState {
  return patchPhotoAlbumState((state) => ({
    ...state,
    exclusions: [...new Set([...state.exclusions, ...assetIds])],
  }));
}

export function restoreChatPhotosToAlbum(assetIds: string[]): PhotoAlbumState {
  const targets = new Set(assetIds);
  return patchPhotoAlbumState((state) => ({
    ...state,
    exclusions: state.exclusions.filter((id) => !targets.has(id)),
  }));
}

export function savePhotoAlbumAnnotations(assetId: string, annotations: ChatPhotoAnnotation[]): PhotoAlbumState {
  return patchPhotoAlbumState((state) => ({
    ...state,
    albumAnnotations: { ...state.albumAnnotations, [assetId]: annotations },
  }));
}

export function upsertAlbumNativeAsset(record: AlbumNativeAssetRecord): PhotoAlbumState {
  return patchPhotoAlbumState((state) => ({
    ...state,
    nativeAssets: [record, ...state.nativeAssets.filter((item) => item.assetVersionId !== record.assetVersionId)],
  }));
}

/** Hosting/compression must explicitly declare relocation instead of replacing the photo. */
export function relocateAlbumNativeMedia(assetVersionId: string, previousRef: string, nextRef: string): boolean {
  const asset = collectPhotoAlbumAssets({ includeExcluded: true }).find(a => a.source.kind === "album" && a.source.assetVersionId === assetVersionId);
  if (!asset || asset.mediaRef !== previousRef || !nextRef) return false;
  relocatePhotoMedia(asset.id, previousRef, nextRef);
  patchPhotoAlbumState(state => ({ ...state, nativeAssets: state.nativeAssets.map(a => a.assetVersionId === assetVersionId && a.mediaRef === previousRef ? { ...a, mediaRef: nextRef } : a) }));
  return true;
}

export function renameUploadAlbum(previous: string, next: string): void {
  patchPhotoAlbumState(state => {
    if (!next.trim() || next.length > 60) throw new Error("请输入 1–60 字的专辑名字。");
    if (previous !== next && state.nativeAssets.some(a => a.uploadAlbum === next)) throw new Error("这个专辑名字已经存在。");
    return { ...state, nativeAssets: state.nativeAssets.map(a => a.uploadAlbum === previous ? { ...a, uploadAlbum: next } : a) };
  });
}

export async function removePhotoAlbumAssets(assets: Array<Pick<PhotoAlbumAsset, "id" | "source" | "mediaRef">>): Promise<{ hiddenChatIds: string[]; deletedNativeIds: string[] }> {
  const chatIds = assets.filter((asset) => asset.source.kind === "chat").map((asset) => asset.id);
  const nativeAssets = assets.filter((asset): asset is Pick<PhotoAlbumAsset, "id" | "mediaRef"> & { source: Extract<PhotoAlbumSource, { kind: "album" }> } => asset.source.kind === "album");
  const nativeIds = new Set(nativeAssets.map((asset) => asset.source.assetVersionId));
  const removedIds = new Set([...chatIds, ...nativeAssets.map((asset) => asset.id)]);
  patchPhotoAlbumState((state) => {
    const albumAnnotations = { ...state.albumAnnotations };
    nativeAssets.forEach((asset) => { delete albumAnnotations[asset.id]; });
    return {
      ...state,
      exclusions: [...new Set([...state.exclusions, ...chatIds])],
      favorites: state.favorites.filter((id) => !removedIds.has(id)),
      albumAnnotations,
      nativeAssets: state.nativeAssets.filter((record) => !nativeIds.has(record.assetVersionId)),
    };
  });
  await Promise.all(nativeAssets.map(async (asset) => {
    if (!asset.mediaRef) return;
    if (collectPhotoAlbumAssets({ includeExcluded: true }).some(a => a.mediaRef === asset.mediaRef)) return;
    if (isMediaStoreRef(asset.mediaRef)) await deleteMediaRef(asset.mediaRef).catch(() => undefined);
    else if (asset.mediaRef.startsWith("asset://")) await deleteThemeAsset(asset.mediaRef.slice("asset://".length)).catch(() => undefined);
  }));
  return { hiddenChatIds: chatIds, deletedNativeIds: [...nativeIds] };
}

function isAlbumPhotoMessage(message: ChatMessage): boolean {
  if (message.isRetracted || message.mediaData?.imageGenerationStatus === "pending") return false;
  if (message.mediaType === "image") {
    return Boolean(message.mediaUrl || message.mediaData?.imageGenerationMediaRef || message.mediaData?.photoKind === "text_photo");
  }
  if (message.mediaType === "media_file" && message.mediaData?.fileType === "image") {
    return Boolean(message.mediaUrl || message.mediaData?.imageGenerationMediaRef || message.mediaData?.photoKind === "text_photo");
  }
  return false;
}

function conversationForSession(session: ChatSession): PhotoAlbumConversation {
  const characters = loadCharacters();
  if (!session.isGroup) {
    const storedCharacter = characters.find((character) => character.id === session.contactId);
    const character = storedCharacter ? withChatCharacterAvatar(session, storedCharacter) : null;
    return {
      id: session.id,
      kind: "private",
      title: session.alias || character?.name || "未命名对话",
      avatar: character?.avatar || undefined,
      memberAvatars: character?.avatar ? [character.avatar] : [],
    };
  }
  const memberAvatars = (session.participantIds || []).flatMap((id) => {
    const character = characters.find((item) => item.id === id);
    if (!character) return [];
    const avatar = withChatCharacterAvatar(session, character).avatar;
    return avatar ? [avatar] : [];
  }).slice(0, 4);
  return {
    id: session.id,
    kind: "group",
    title: session.groupName || "群聊",
    avatar: session.groupAvatar,
    memberAvatars,
  };
}

function senderLabelForMessage(message: ChatMessage, conversation: PhotoAlbumConversation): string {
  if (message.role === "user") return "你";
  if (message.senderName?.trim()) return message.senderName.trim();
  if (conversation.kind === "private") return conversation.title;
  if (message.senderCharacterId) {
    return loadCharacters().find((character) => character.id === message.senderCharacterId)?.name || conversation.title;
  }
  return conversation.title;
}

export function collectPhotoAlbumAssets(options?: { includeExcluded?: boolean }): PhotoAlbumAsset[] {
  const state = loadPhotoAlbumState();
  const favorites = new Set(state.favorites);
  const exclusions = new Set(state.exclusions);
  const chatAssets = getChatSessionMetadata().flatMap((session) => {
    const conversation = conversationForSession(session);
    return loadChatMessages(session.id)
      .filter(isAlbumPhotoMessage)
      .flatMap((message): PhotoAlbumAsset[] => {
        const source: PhotoAlbumSource = { kind: "chat", sessionId: session.id, messageId: message.id };
        const id = photoAlbumSourceId(source);
        if (!options?.includeExcluded && exclusions.has(id)) return [];
        const photoKind = message.mediaData?.photoKind === "text_photo" || (!message.mediaUrl && !message.mediaData?.imageGenerationMediaRef)
          ? "text_photo"
          : "photo";
        return [{
          id,
          canonicalPhotoId: message.mediaData?.albumPhotoId,
          contentVersion: message.mediaData?.albumContentVersion,
          source,
          mediaRef: message.mediaUrl || message.mediaData?.imageGenerationMediaRef,
          mediaKind: photoKind,
          label: message.mediaData?.label || message.content || (photoKind === "text_photo" ? "文字图片" : "照片"),
          createdAt: message.createdAt,
          conversation,
          senderLabel: senderLabelForMessage(message, conversation),
          baseAnnotations: message.mediaData?.photoAnnotations || [],
          albumAnnotations: state.albumAnnotations[id] || [],
          favorite: favorites.has(id),
        }];
      });
  });
  const nativeAssets = state.nativeAssets.flatMap((record): PhotoAlbumAsset[] => {
    const source: PhotoAlbumSource = { kind: "album", assetVersionId: record.assetVersionId };
    const id = photoAlbumSourceId(source);
    if (!options?.includeExcluded && exclusions.has(id)) return [];
    return [{
      id,
      contentVersion: record.contentVersion,
      source,
      mediaRef: record.mediaRef,
      uploadAlbum: record.uploadAlbum,
      mediaKind: record.photoKind,
      label: record.label,
      createdAt: record.createdAt,
      senderLabel: "你",
      baseAnnotations: [],
      albumAnnotations: state.albumAnnotations[id] || [],
      favorite: favorites.has(id),
    }];
  });
  return attachPhotoVersions([...chatAssets, ...nativeAssets]).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function resolvePhotoAlbumMedia(mediaRef?: string): Promise<{ url: string; revoke: boolean } | null> {
  if (!mediaRef) return null;
  if (isMediaStoreRef(mediaRef)) {
    const url = await loadMediaObjectUrl(mediaRef);
    return url ? { url, revoke: true } : null;
  }
  if (mediaRef.startsWith("asset://")) {
    const url = await getChatImageFromIndexedDB(mediaRef.slice("asset://".length));
    return url ? { url, revoke: false } : null;
  }
  return { url: mediaRef, revoke: false };
}
