const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const compile = file => ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: file,
}).outputText;

const parserPath = path.join(root, "lib", "rich-message-parser.ts");
const parserModule = { exports: {} };
const parserMocks = {
  "./chat-echo": { canUseEcho: () => true },
  "./state-value-parser": { parseStateValues: text => ({ cleanText: text, stateValues: [] }), mergeStateValues: (_a, b) => b },
  "./action-parser": { stripActionShells: text => text },
  "./text-tool-protocol": { stripTextToolDirectives: text => text },
  "./custom-app-chat-directives": {
    formatCustomAppDirectiveSummary: () => "", getCustomAppDirectiveSyntaxHead: syntax => syntax,
    loadCustomAppChatDirectives: () => [], splitCustomAppDirectiveArgs: () => [],
  },
};
vm.runInNewContext(compile(parserPath), {
  module: parserModule, exports: parserModule.exports,
  require: id => { if (parserMocks[id]) return parserMocks[id]; throw new Error(`Unexpected parser dependency: ${id}`); },
  console,
}, { filename: parserPath });

const privateParsed = parserModule.exports.parseAIResponse("好。\n\n[修改备注:小祖宗专属]", []);
assert.equal(privateParsed.parts[1].mediaType, "private_alias_action");
assert.equal(privateParsed.parts[1].mediaData.chatRenameValue, "小祖宗专属");
const groupParsed = parserModule.exports.parseAIResponse("[修改群名：今晚不许加班]", []);
assert.equal(groupParsed.parts[0].mediaType, "group_name_action");
assert.equal(groupParsed.parts[0].mediaData.chatRenameValue, "今晚不许加班");

let sessions = [
  { id: "private", contactId: "a", alias: "原备注", unreadCount: 0, updatedAt: "old", isPinned: false },
  { id: "group", contactId: "group", isGroup: true, groupName: "旧群名", participantIds: ["a", "b"], unreadCount: 0, updatedAt: "old", isPinned: false },
];
const events = [];
const storageMock = {
  loadChatSessions: () => sessions.map(item => ({ ...item, participantIds: item.participantIds ? [...item.participantIds] : undefined })),
  saveChatSessions: next => { sessions = next; },
  pushChatMessage: input => { const event = { ...input, id: `event_${events.length}` }; events.push(event); return event; },
};
const actionPath = path.join(root, "lib", "chat-rename-action.ts");
const actionModule = { exports: {} };
vm.runInNewContext(compile(actionPath), {
  module: actionModule, exports: actionModule.exports,
  require: id => { if (id === "./chat-storage") return storageMock; throw new Error(`Unexpected action dependency: ${id}`); },
  console,
}, { filename: actionPath });

const privateLive = { ...sessions[0] };
const privateResult = actionModule.exports.applyAssistantChatRenameAction({
  sessionId: "private", actorId: "a", actorName: "A", liveSession: privateLive,
  actionData: { chatRenameKind: "private_alias", chatRenameValue: "  新\n备注  " },
});
assert.equal(privateResult.session.alias, "新 备注");
assert.equal(privateLive.alias, "新 备注");
assert.equal(privateResult.event.mediaType, "private_alias_action");

const groupResult = actionModule.exports.applyAssistantChatRenameAction({
  sessionId: "group", actorId: "b", actorName: "B",
  actionData: { chatRenameKind: "group_name", chatRenameValue: "新群名" },
});
assert.equal(groupResult.session.groupName, "新群名");
assert.equal(groupResult.event.content, "B将群聊名称改为“新群名”");

assert.equal(actionModule.exports.applyAssistantChatRenameAction({
  sessionId: "private", actorId: "b", actorName: "B",
  actionData: { chatRenameKind: "private_alias", chatRenameValue: "越权" },
}), null, "another character cannot rename a private chat");
assert.equal(actionModule.exports.applyAssistantChatRenameAction({
  sessionId: "group", actorId: "outsider", actorName: "X",
  actionData: { chatRenameKind: "group_name", chatRenameValue: "越权" },
}), null, "a non-member cannot rename a group");

const room = fs.readFileSync(path.join(root, "components", "chat", "chat-room.tsx"), "utf8");
const followup = fs.readFileSync(path.join(root, "lib", "follow-up-service.ts"), "utf8");
const privateEngine = fs.readFileSync(path.join(root, "lib", "chat-engine.ts"), "utf8");
const groupEngine = fs.readFileSync(path.join(root, "lib", "group-chat-engine.ts"), "utf8");
assert.match(room, /applyAssistantChatRenameAction/, "foreground private/group replies should execute rename actions");
assert.match(followup, /applyAssistantChatRenameAction/, "follow-up replies should execute rename actions");
assert.match(privateEngine, /当前用户手机里给你的私聊备注/, "private prompt should expose the current remark and action");
assert.match(groupEngine, /当前群聊名称是/, "group prompt should expose the current group name and action");

console.log("PASS: private remarks and group names parse, persist, render as actions, reject cross-chat actors, and are available in foreground/stream/follow-up prompts.");
