const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");
const { core } = require('./album-core-test-helper.cjs')();

function loadTypeScriptModule(path, requireMap) {
  const sandbox = {
    exports: {},
    require: id => {
      if (Object.prototype.hasOwnProperty.call(requireMap, id)) return requireMap[id];
      throw new Error(`Unexpected require from ${path}: ${id}`);
    },
    console,
    window: undefined,
    Set,
    Map,
    Date,
    JSON,
  };
  const output = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(output, sandbox, { filename: path });
  return sandbox.exports;
}

let storedState = JSON.stringify({
  version: 1,
  favorites: ["chat:private:photo-1", "album:lab-1"],
  exclusions: ["chat:private:hidden"],
  albumAnnotations: { "chat:private:photo-1": [{ id: "album-mark", kind: "stroke", color: "#f00", points: [0, 0, 1, 1] }] },
  nativeAssets: [{ assetVersionId: "lab-1", mediaRef: "asset://lab", label: "实验室照片", photoKind: "photo", createdAt: "2026-09-19T10:00:00.000Z" }],
});
const deletedMediaRefs = [];
const deletedThemeAssetIds = [];

const sessions = [
  { id: "private", contactId: "char-1", alias: "小名", unreadCount: 0, updatedAt: "", isPinned: false },
  { id: "group", contactId: "group-1", isGroup: true, groupName: "周末群", participantIds: ["char-1", "char-2"], unreadCount: 0, updatedAt: "", isPinned: false },
];
const messages = {
  private: [
    { id: "photo-1", sessionId: "private", role: "user", content: "", status: "sent", createdAt: "2026-09-19T09:00:00.000Z", mediaType: "image", mediaUrl: "data:image/png;base64,a", mediaData: { label: "早餐", photoKind: "photo", photoAnnotations: [{ id: "base", kind: "stroke", color: "#00f", points: [0, 0, 1, 1] }] } },
    { id: "text-1", sessionId: "private", role: "assistant", content: "", status: "sent", createdAt: "2026-09-19T08:00:00.000Z", mediaType: "image", mediaData: { label: "想你", photoKind: "text_photo", imageGenerationStatus: "fallback" } },
    { id: "hidden", sessionId: "private", role: "assistant", content: "", status: "sent", createdAt: "2026-09-19T07:00:00.000Z", mediaType: "image", mediaUrl: "hidden.png", mediaData: { label: "隐藏" } },
    { id: "pending", sessionId: "private", role: "assistant", content: "", status: "sent", createdAt: "2026-09-19T06:00:00.000Z", mediaType: "image", mediaData: { label: "生成中", imageGenerationStatus: "pending" } },
    { id: "retracted", sessionId: "private", role: "assistant", content: "", status: "sent", createdAt: "2026-09-19T05:00:00.000Z", mediaType: "image", mediaUrl: "gone.png", isRetracted: true },
    { id: "sticker", sessionId: "private", role: "assistant", content: "", status: "sent", createdAt: "2026-09-19T04:00:00.000Z", mediaType: "sticker", mediaUrl: "sticker.png" },
  ],
  group: [
    { id: "group-photo", sessionId: "group", role: "assistant", content: "group.jpg", status: "sent", createdAt: "2026-09-19T09:30:00.000Z", mediaType: "media_file", mediaUrl: "media-store://group", senderName: "阿青", mediaData: { fileType: "image", label: "合照", photoKind: "photo" } },
    { id: "document", sessionId: "group", role: "user", content: "report.pdf", status: "sent", createdAt: "2026-09-19T03:00:00.000Z", mediaType: "media_file", mediaUrl: "file.pdf", mediaData: { fileType: "file" } },
  ],
};
const characters = [
  { id: "char-1", name: "角色一", avatar: "avatar-1" },
  { id: "char-2", name: "角色二", avatar: "avatar-2" },
];

const album = loadTypeScriptModule("lib/photo-album-storage.ts", {
  "./chat-asset-storage": { getChatImageFromIndexedDB: async id => `data:${id}` },
  "./chat-session-avatar": { withChatCharacterAvatar: (_session, character) => character },
  "./chat-storage": {
    CHAT_MESSAGES_DELETED_EVENT: "chat-messages-deleted",
    CHAT_MESSAGE_PUSHED_EVENT: "chat-message-pushed",
    CHAT_RESPONSE_BATCH_REPLACED_EVENT: "chat-response-batch-replaced",
    loadChatSessions: () => { throw new Error("Album must not scan every chat history"); }, getChatSessionMetadata: () => sessions,
    loadChatMessages: sessionId => messages[sessionId] || [],
  },
  "./character-storage": { loadInteractableCharacters: () => characters },
  "./photo-album-core": core,
  "./media-cache-storage": {
    deleteMediaRef: async ref => { deletedMediaRefs.push(ref); },
    isMediaStoreRef: ref => ref.startsWith("media-store://"),
    loadMediaObjectUrl: async ref => `blob:${ref}`,
  },
  "./kv-db": {
    kvGet: () => storedState,
    kvSet: (_key, value) => { storedState = value; },
    registerKvMigration: () => undefined,
  },
  "./theme-storage": { deleteThemeAsset: async id => { deletedThemeAssetIds.push(id); } },
});

const assets = album.collectPhotoAlbumAssets();
assert.deepEqual(Array.from(assets, asset => asset.id), [
  "album:lab-1",
  "chat:group:group-photo",
  "chat:private:photo-1",
  "chat:private:text-1",
]);
assert.equal(assets.find(asset => asset.id === "chat:private:photo-1").conversation.title, "小名");
assert.equal(assets.find(asset => asset.id === "chat:private:photo-1").favorite, true);
assert.equal(assets.find(asset => asset.id === "chat:private:photo-1").baseAnnotations.length, 1);
assert.equal(assets.find(asset => asset.id === "chat:private:photo-1").albumAnnotations.length, 1);
assert.equal(assets.find(asset => asset.id === "chat:private:text-1").mediaKind, "text_photo");
assert.equal(assets.find(asset => asset.id === "chat:group:group-photo").conversation.kind, "group");
assert.equal(assets.find(asset => asset.id === "chat:group:group-photo").senderLabel, "阿青");
assert.equal(assets.find(asset => asset.id === "album:lab-1").favorite, true);
assert.ok(!assets.some(asset => /pending|retracted|sticker|document|hidden/.test(asset.id)));

const withExcluded = album.collectPhotoAlbumAssets({ includeExcluded: true });
assert.ok(withExcluded.some(asset => asset.id === "chat:private:hidden"));

album.setPhotoAlbumFavorite("chat:private:text-1", true);
assert.ok(JSON.parse(storedState).favorites.includes("chat:private:text-1"));
album.excludeChatPhotosFromAlbum(["chat:private:text-1"]);
assert.ok(!album.collectPhotoAlbumAssets().some(asset => asset.id === "chat:private:text-1"));
album.restoreChatPhotosToAlbum(["chat:private:text-1"]);
assert.ok(album.collectPhotoAlbumAssets().some(asset => asset.id === "chat:private:text-1"));

(async () => {
  const stored = await album.resolvePhotoAlbumMedia("asset://lab");
  assert.equal(stored.url, "data:lab");
  assert.equal(stored.revoke, false);
  const remote = await album.resolvePhotoAlbumMedia("https://example.test/photo.jpg");
  assert.equal(remote.url, "https://example.test/photo.jpg");
  assert.equal(remote.revoke, false);
  album.upsertAlbumNativeAsset({
    assetVersionId: "lab-2",
    uploadAlbum: "我的专辑",
    mediaRef: "media-store://lab-2",
    label: "实验室照片二",
    photoKind: "photo",
    createdAt: "2026-09-19T11:00:00.000Z",
  });
  const removable = album.collectPhotoAlbumAssets({ includeExcluded: true }).filter(asset => [
    "chat:private:text-1",
    "album:lab-1",
    "album:lab-2",
  ].includes(asset.id));
  const removed = await album.removePhotoAlbumAssets(removable);
  assert.deepEqual(Array.from(removed.hiddenChatIds), ["chat:private:text-1"]);
  assert.deepEqual(Array.from(removed.deletedNativeIds).sort(), ["lab-1", "lab-2"]);
  assert.ok(!album.collectPhotoAlbumAssets().some(asset => asset.id === "chat:private:text-1"));
  assert.ok(!album.collectPhotoAlbumAssets({ includeExcluded: true }).some(asset => asset.source.kind === "album"));
  assert.deepEqual(deletedMediaRefs, ["media-store://lab-2"]);
  assert.deepEqual(deletedThemeAssetIds, ["lab"]);
  console.log("PASS: photo album projection, filtering, local state, and future album sources are consistent.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
