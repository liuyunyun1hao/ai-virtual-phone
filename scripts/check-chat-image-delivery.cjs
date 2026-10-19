const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");

function loadTypeScriptModule(path, requireMap = {}) {
  const sandbox = {
    exports: {},
    require: id => {
      if (Object.prototype.hasOwnProperty.call(requireMap, id)) return requireMap[id];
      throw new Error(`Unexpected require from ${path}: ${id}`);
    },
    console,
    Blob,
    DOMException,
    setTimeout,
    clearTimeout,
  };
  const source = fs.readFileSync(path, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(output, sandbox, { filename: path });
  return sandbox.exports;
}

const split = loadTypeScriptModule("lib/image-grid-split.ts");
const protocol = loadTypeScriptModule("lib/image-delivery-protocol.ts", {
  "./image-grid-split": split,
});

const parser = loadTypeScriptModule("lib/rich-message-parser.ts", {
  "./image-grid-split": split,
  "./photo-doodle": { parsePhotoDoodle: () => null },
  "./chat-echo": { canUseEcho: () => false },
  "./state-value-parser": {
    parseStateValues: text => ({ cleanText: text, stateValues: [] }),
    mergeStateValues: (previous, current) => [...previous, ...current],
  },
  "./action-parser": { stripActionShells: text => text },
  "./text-tool-protocol": { stripTextToolDirectives: text => text },
  "./custom-app-chat-directives": {
    formatCustomAppDirectiveSummary: () => "",
    getCustomAppDirectiveSyntaxHead: () => "",
    loadCustomAppChatDirectives: () => [],
    splitCustomAppDirectiveArgs: () => [],
  },
});

const multiPayload = {
  count: 6,
  visualIntent: "同一角色分享六个自然变化的周末瞬间",
  shots: ["窗边微笑", "街角回头", "咖啡店托腮", "公园大笑", "书店低头", "夜景挥手"],
  useReferenceImage: true,
  characterExpressionStyle: "expressive",
};
const parsedMulti = parser.parseAIResponse(`[多图]${JSON.stringify(multiPayload)}[/多图]`, []);
assert.equal(parsedMulti.parts.length, 6);
assert.equal(new Set(parsedMulti.parts.map(part => part.mediaData.photoGroupId)).size, 1);
assert.deepEqual(Array.from(parsedMulti.parts, part => part.mediaData.label), multiPayload.shots);
assert.deepEqual(Array.from(parsedMulti.parts, part => part.mediaData.photoGroupIndex), [0, 1, 2, 3, 4, 5]);
assert.ok(parsedMulti.parts.every(part => part.mediaData.multiImagePlan.displayImageCount === 6));

const parsedSingle = parser.parseAIResponse("[照片:不使用参考图:一张内部包含多个区域的完整海报]", []);
assert.equal(parsedSingle.parts.length, 1);
assert.equal(parsedSingle.parts[0].mediaData.photoGroupId, undefined);

const parsedLegacy = parser.parseAIResponse([
  "[照片:使用参考图:第一张]",
  "[照片:使用参考图:第二张]",
  "[照片:使用参考图:第三张]",
  "[照片:使用参考图:第四张]",
].join("\n"), []);
assert.equal(parsedLegacy.parts.length, 4);
assert.equal(new Set(parsedLegacy.parts.map(part => part.mediaData.photoGroupId)).size, 1);
assert.ok(parsedLegacy.parts.every(part => part.mediaData.multiImagePlan.displayImageCount === 4));

const unsupportedLegacy = parser.parseAIResponse([
  "[照片:不使用参考图:第一张]",
  "[照片:不使用参考图:第二张]",
  "[照片:不使用参考图:第三张]",
].join("\n"), []);
assert.ok(unsupportedLegacy.parts.every(part => part.mediaData.photoGroupId === undefined));
assert.match(protocol.buildImageDeliveryChatPrompt(), /最终应出现几个可独立浏览的媒体对象/);
assert.match(protocol.buildImageDeliveryChatPrompt(), /count 只能是 2、4、6、9/);
assert.equal(protocol.hasUsableImageGenerationConfig({ enabled: true, apiKey: "key", baseUrl: "https://example.test", model: "image" }), true);
assert.equal(protocol.hasUsableImageGenerationConfig({ enabled: false, apiKey: "key", baseUrl: "https://example.test", model: "image" }), false);
assert.equal(protocol.hasUsableImageGenerationConfig({ enabled: true, apiKey: "", baseUrl: "https://example.test", model: "image" }), false);
assert.equal(protocol.shouldHidePendingAssistantImage({ role: "assistant", mediaType: "image", imageGenerationStatus: "pending" }), true);
assert.equal(protocol.shouldHidePendingAssistantImage({ role: "assistant", mediaType: "image", imageGenerationStatus: "fallback" }), false);
assert.equal(protocol.shouldHidePendingAssistantImage({ role: "assistant", mediaType: "media_file", imageGenerationStatus: "generated" }), false);

let messages = [];
let generationCalls = 0;
function updateChatMessage(id, patch) {
  const index = messages.findIndex(message => message.id === id);
  if (index < 0) return null;
  messages[index] = { ...messages[index], ...patch };
  return messages[index];
}

const retry = loadTypeScriptModule("lib/generated-image-retry.ts", {
  "./chat-asset-storage": { saveChatImageToIndexedDB: async () => "unused" },
  "./chat-storage": {
    loadChatMessages: sessionId => messages.filter(message => message.sessionId === sessionId),
    syncChatGeneratedImagePromptText: () => undefined,
    updateChatMessage,
  },
  "./image-generation-service": {
    generatedImageFilename: description => `${description}.jpg`,
    generateImageFromConfiguredApi: async () => {
      generationCalls += 1;
      return null;
    },
  },
  "./image-delivery-protocol": protocol,
  "./image-grid-split": split,
  "./settings-storage": {
    loadImageGenerationSettings: () => ({
      enabled: false,
      requestMode: "direct",
      apiKey: "",
      baseUrl: "",
      model: "",
      size: "auto",
      quality: "",
      extraPrompt: "",
      characterReferences: {},
      imageHosting: {},
    }),
  },
  "./media-cache-storage": {
    deleteMediaRef: async () => undefined,
    storeMediaBlob: async () => "unused",
  },
  "./abort-utils": { isAbortError: () => false },
  "./moments-storage": { updateMomentPost: () => null },
});

function makeMessage(id, mediaData) {
  return {
    id,
    sessionId: "session-test",
    role: "assistant",
    content: "",
    status: "sent",
    createdAt: "2026-09-19T00:00:00.000Z",
    mediaType: "image",
    mediaData: { ...mediaData, imageGenerationStatus: "pending" },
  };
}

(async () => {
  messages = [makeMessage("single", { label: "一碗刚做好的面" })];
  generationCalls = 0;
  const singleFallback = await retry.generateAndApplyChatGeneratedImage(messages[0], "character-test");
  assert.equal(generationCalls, 1);
  assert.equal(singleFallback.mediaType, "image");
  assert.equal(singleFallback.mediaData.photoKind, "text_photo");
  assert.equal(singleFallback.mediaData.imageGenerationStatus, "fallback");

  const plan = {
    displayImageCount: 4,
    visualIntent: "四个不同的日常瞬间",
    shots: ["厨房做饭", "阳台浇花", "沙发看书", "门口换鞋"],
    characterExpressionStyle: "infer_from_context",
    useReferenceImage: true,
  };
  messages = plan.shots.map((label, index) => makeMessage(`group-${index}`, {
    label,
    photoKind: "text_photo",
    photoGroupId: "group-test",
    photoGroupIndex: index,
    photoGroupCount: 4,
    multiImagePlan: plan,
  }));
  generationCalls = 0;
  assert.equal(retry.isMultiImageGenerationExecutor(messages[0]), false);
  assert.equal(retry.isMultiImageGenerationExecutor(messages[3]), true);
  const groupFallback = await retry.generateAndApplyChatGeneratedImageGroup(messages[3], "character-test");
  assert.equal(generationCalls, 1);
  assert.equal(groupFallback.length, 4);
  assert.ok(groupFallback.every(message => message.mediaType === "image"));
  assert.ok(groupFallback.every(message => message.mediaData.photoKind === "text_photo"));
  assert.ok(groupFallback.every(message => message.mediaData.imageGenerationStatus === "fallback"));
  assert.deepEqual(Array.from(groupFallback, message => message.mediaData.label), plan.shots);

  console.log("PASS: chat image protocol parsing and no-API text-photo fallback are consistent.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
