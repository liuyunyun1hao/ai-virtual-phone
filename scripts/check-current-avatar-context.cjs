const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");

const source = ts.transpileModule(fs.readFileSync("lib/chat-current-avatar-context.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const store = new Map();
let characters = [
    { id: "a", name: "A", avatar: "data:image/png;base64,A1" },
    { id: "b", name: "B", avatar: "data:image/png;base64,B1" },
    { id: "c", name: "Unrelated", avatar: "data:image/png;base64,C1" },
];
const world = { relations: [{ fromCharacterId: "a", toCharacterId: "b" }] };
const sessions = [{ id: "private", contactId: "a" }, { id: "group", isGroup: true, participantIds: ["a", "c"] }];
const sandbox = {
    exports: {}, Set, Map, JSON,
    require: id => {
        if (id === "./character-storage") return { loadCharacters: () => characters };
        if (id === "./chat-storage") return { loadChatSessions: () => sessions };
        if (id === "./chat-session-avatar") return { getChatCharacterAvatar: (session, character) => Object.prototype.hasOwnProperty.call(session?.characterAvatars || {}, character.id) ? session.characterAvatars[character.id] : character.avatar };
        if (id === "./character-world-storage") return { getCharacterWorldGroup: id => id === "a" ? world : null };
        if (id === "./kv-db") return {
            kvGet: key => store.get(key) || null,
            kvSet: (key, value) => store.set(key, value),
            registerDynamicPrefix: () => {},
        };
        return {};
    },
};
vm.runInNewContext(source, sandbox);
const { buildCurrentAvatarSnapshot, formatCurrentAvatarTruth } = sandbox.exports;
const identity = { id: "u", name: "User", avatarUrl: "data:image/png;base64,U1" };

let snapshot = buildCurrentAvatarSnapshot({ sessionId: "private", viewerCharacterId: "a", userIdentity: identity });
assert.equal(snapshot.map(item => item.name).join("|"), "User|A|B");
assert.equal(snapshot.some(item => item.name === "Unrelated"), false);
assert.equal(snapshot.every(item => item.changed === false), true);
assert.match(formatCurrentAvatarTruth(snapshot, new Set(["user:u"])), /User：当前使用自定义头像；本条后附的是当前头像图片/);
assert.match(formatCurrentAvatarTruth(snapshot, new Set(["user:u"])), /A：当前使用自定义头像；本轮未提供视觉图片，不得猜测画面内容/);

characters = characters.map(item => item.id === "a" ? { ...item, avatar: "data:image/png;base64,A2" } : item);
snapshot = buildCurrentAvatarSnapshot({ sessionId: "private", viewerCharacterId: "a", userIdentity: { ...identity, avatarUrl: "data:image/png;base64,U2" } });
assert.equal(snapshot.find(item => item.name === "User").changed, true);
assert.equal(snapshot.find(item => item.name === "A").changed, true);
assert.equal(snapshot.find(item => item.name === "B").changed, false);
assert.match(formatCurrentAvatarTruth(snapshot), /User：当前使用自定义头像；自上次本会话请求后已更换；本轮未提供视觉图片，不得猜测画面内容/);

snapshot = buildCurrentAvatarSnapshot({ sessionId: "group", participantIds: ["a", "c"], userIdentity: identity });
assert.equal(snapshot.map(item => item.name).join("|"), "User|A|Unrelated");
assert.equal(snapshot.some(item => item.name === "B"), false);

sessions[0].characterAvatars = { a: "data:image/png;base64,CHAT_A" };
snapshot = buildCurrentAvatarSnapshot({ sessionId: "private", viewerCharacterId: "a", userIdentity: identity });
assert.equal(snapshot.find(item => item.name === "A").avatarUrl, "data:image/png;base64,CHAT_A");

console.log("PASS: current user/character/group avatar truth, change detection, visual/no-visual wording, direct-relation scope.");
