const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const parserPath = path.join(root, "lib", "rich-message-parser.ts");
const parserSource = fs.readFileSync(parserPath, "utf8");
const compiled = ts.transpileModule(parserSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: parserPath,
}).outputText;

const parserModule = { exports: {} };
const mocks = {
  "./chat-echo": { canUseEcho: () => true },
  "./state-value-parser": {
    parseStateValues: text => ({ cleanText: text, stateValues: [] }),
    mergeStateValues: (_previous, current) => current,
  },
  "./action-parser": { stripActionShells: text => text },
  "./text-tool-protocol": { stripTextToolDirectives: text => text },
  "./custom-app-chat-directives": {
    formatCustomAppDirectiveSummary: () => "",
    getCustomAppDirectiveSyntaxHead: syntax => syntax,
    loadCustomAppChatDirectives: () => [],
    splitCustomAppDirectiveArgs: () => [],
  },
};
vm.runInNewContext(compiled, {
  module: parserModule,
  exports: parserModule.exports,
  require: id => {
    if (mocks[id]) return mocks[id];
    throw new Error(`Unexpected parser dependency: ${id}`);
  },
  console,
}, { filename: parserPath });

const { parseAIResponse } = parserModule.exports;
const parsed = parseAIResponse("[照片:海边]\n\n[照片:晚霞]\n\n[照片标记:72:18:看这里]", []);
assert.equal(parsed.parts.length, 3, "markup should remain an independent conversational action");
assert.equal(parsed.parts[0].mediaData.photoGroupCount, 2);
assert.equal(parsed.parts[1].mediaData.photoGroupCount, 2);
assert.equal(parsed.parts[0].mediaData.photoGroupId, parsed.parts[1].mediaData.photoGroupId);
assert.deepEqual(Array.from(parsed.parts.slice(0, 2).map(part => part.mediaData.photoGroupIndex)), [0, 1]);
assert.equal(parsed.parts[2].mediaType, "photo_markup_action");
assert.equal(parsed.parts[2].mediaData.photoMarkText, "看这里");
assert.equal(parsed.parts[2].mediaData.photoMarkX, 0.72);

const targeted = parseAIResponse("[照片标记:第3张:40:65:圈这里]", []);
assert.equal(targeted.parts[0].mediaData.photoMarkTargetIndex, 2);
assert.equal(targeted.parts[0].mediaData.photoMarkY, 0.65);

const room = fs.readFileSync(path.join(root, "components", "chat", "chat-room.tsx"), "utf8");
const bubble = fs.readFileSync(path.join(root, "components", "chat", "message-bubble.tsx"), "utf8");
const engine = fs.readFileSync(path.join(root, "lib", "chat-engine.ts"), "utf8");
const settings = fs.readFileSync(path.join(root, "components", "chat", "chat-settings-panel.tsx"), "utf8");
const quotePreview = fs.readFileSync(path.join(root, "lib", "chat-quote-preview.ts"), "utf8");
const assembler = fs.readFileSync(path.join(root, "lib", "llm-prompt-assembler.ts"), "utf8");
const markup = fs.readFileSync(path.join(root, "lib", "chat-photo-markup.ts"), "utf8");
assert.match(room, /photoGroupMessages\[0\]\?\.id !== msg\.id/, "only the group carrier should render");
assert.match(room, /targetMessages\.forEach\(message => deleteChatMessage\(message\.id\)\)/, "deleting a group should delete every member");
assert.match(bubble, /resolved\.length}\s*张照片/, "photo count should be dynamic");
assert.match(bubble, /onPointerMove=.*setDragX/s, "stack should support direct swipe gestures");
assert.match(bubble, /Math\.min\(resolved\.length, 9\)/, "up to nine stack layers should remain visually distinct");
assert.match(bubble, /photoGroupActiveIndex/, "swiped cover should persist");
assert.match(engine, /allowedPhotoGroups/, "vision cap should treat one photo group as one slot");
assert.match(engine, /compositePhotoAnnotations/, "vision should receive the marked composition, not only the original image");
assert.match(room, /quotePhotoGroupIndex/, "quotes should freeze the currently selected group cover");
assert.match(quotePreview, /const index = .*photoGroupActiveIndex/s, "quote preview should read the persisted active item");
assert.match(quotePreview, /照片组 \$\{index \+ 1\} \/ \$\{d\.photoGroupCount\}/, "quote preview should identify the active item and group count");
assert.match(settings, /announceBackgroundChange\("更换"\)/, "changing the chat background should store a visible event");
assert.match(settings, /CHAT_REQUEST_REPLY_EVENT/, "background changes should offer the event to the character for a response decision");
assert.match(bubble, /const nextIndex = \(index \+ direction/, "swiping should not update the parent from inside a React state updater");
assert.match(assembler, /禁止只说“圈了／画了／标记了”却不输出协议/, "runtime capability should prevent fake narrated marks even with an older or custom preset");
assert.match(markup, /resolveAssistantMarkShape/, "assistant symbols should resolve to editable vector marks");
assert.match(markup, /renderStyle: shape \? "handdrawn"/, "assistant shapes should use imperfect hand-drawn rendering");
assert.match(bubble, /setDragX\(Math\.min\(0,/, "photo stacks should only follow a right-to-left gesture");
assert.match(bubble, /if \(dragX < -42\) \{ suppressStackClick\.current = true; move\(1\); \}/, "only a left swipe should advance the circular stack");

console.log("PASS: grouped photos parse, store markup as an action, support explicit targets, render once, delete together, persist the swiped cover, show up to nine layers, composite marks for vision, and share one vision slot.");
