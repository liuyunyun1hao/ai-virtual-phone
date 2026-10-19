const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");

const room = fs.readFileSync("components/chat/chat-room.tsx", "utf8");
const css = fs.readFileSync("styles/imessage26.css", "utf8");
assert.match(room, /const plusMenuItems = \[\s*\{ icon: imessageMenuIcon\("offline-mode\.jpg"\), label: "线下模式"/);
assert.doesNotMatch(room, /!isGroup \? \[\{ icon: imessageMenuIcon\("offline-mode\.jpg"\)/);
assert.match(room, /data-ui="input" data-offline-input=""/);
assert.match(css, /\.chat-input-bar\[data-offline-input\] \.chat-input-actions \{[\s\S]*?display: flex;[\s\S]*?flex-direction: row;/);
assert.match(css, /\.chat-input-bar:not\(\[data-offline-input\]\) \.chat-input-actions/);

const tapbackSource = ts.transpileModule(fs.readFileSync("lib/chat-tapback.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sandbox = {
    exports: {}, Map, Set,
    require: id => id === "./chat-storage"
        ? { getChatMessagePreview: () => "", loadChatMessages: () => [], updateMessageMediaData: () => null }
        : { kvGet: () => null, kvSet: () => {}, registerKvMigration: () => {} },
};
vm.runInNewContext(tapbackSource, sandbox);
const normal = sandbox.exports.buildPokeUsagePrompt([]);
const recent = sandbox.exports.buildPokeUsagePrompt([{ id: "p", role: "assistant", content: "", mediaType: "poke" }]);
assert.match(normal, /不是强提醒、催回复按钮/);
assert.match(normal, /偶尔选择/);
assert.match(recent, /本轮默认不要再拍/);

console.log("PASS: group offline entry is visible, offline controls stay horizontal, poke is optional and cools down after recent use.");
