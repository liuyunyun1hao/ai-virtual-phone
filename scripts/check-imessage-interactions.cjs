const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(source, mocks = {}) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', source), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    exports, Intl,
    require(name) {
      if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`);
      return mocks[name];
    },
  }, { filename: source });
  return exports;
}

const { shouldSendChatInputOnEnter: enter } = load('lib/chat-input-keyboard.ts');
assert.equal(enter({ key: 'Enter' }, true), true);
assert.equal(enter({ key: 'Enter' }, false), false);
assert.equal(enter({ key: 'Enter', shiftKey: true }, true), false);
assert.equal(enter({ key: 'Enter', altKey: true }, true), false);
assert.equal(enter({ key: 'Enter', ctrlKey: true }, false), true);
assert.equal(enter({ key: 'Enter', metaKey: true }, false), true);
assert.equal(enter({ key: 'Enter', nativeEvent: { isComposing: true } }, true), false);
assert.equal(enter({ key: 'a' }, true), false);

let messages = [];
let writes = 0;
const tapback = load('lib/chat-tapback.ts', {
  './kv-db': { kvGet: () => null, kvSet() {}, registerKvMigration() {} },
  './chat-storage': {
    getChatMessagePreview: m => m.content,
    loadChatMessages: () => messages,
    updateMessageMediaData(id, mediaData) {
      writes++;
      messages = messages.map(m => m.id === id ? { ...m, mediaData } : m);
    },
  },
});
for (const emoji of ['🥹', '🫶🏽', '👨‍👩‍👧‍👦', '🇨🇳', '1️⃣', '❤️', '‼️']) {
  assert.equal(tapback.isNativeTapbackEmoji(emoji), true, emoji);
}
for (const invalid of ['', 'hello', '❤️😂', '1', '[Tapback:❤️]']) {
  assert.equal(tapback.isNativeTapbackEmoji(invalid), false, invalid);
}
messages = [
  { id: 'u1', role: 'user', content: '谢谢你一直陪着我', mediaData: { label: 'kept' } },
  { id: 'a1', role: 'assistant', content: '我在' },
  { id: 'u2', role: 'user', content: '撤回', isRetracted: true },
  { id: 'call', role: 'user', content: '', mediaType: 'voice_call' },
];
assert.equal(tapback.applyAssistantTapback('session', undefined), null);
assert.equal(writes, 0, 'No requested action must not create a tapback');
assert.equal(tapback.applyAssistantTapback('session', 'not emoji'), null);
const applied = tapback.applyAssistantTapback('session', '🥹');
assert.equal(applied.id, 'u1');
assert.equal(applied.mediaData.tapback, '🥹', 'Emoji outside six candidates must work');
assert.equal(applied.mediaData.label, 'kept');
assert.equal(applied.mediaData.tapbackBy, 'assistant');
tapback.applyAssistantTapback('session', '🫶🏽');
assert.equal(messages[0].mediaData.tapback, '🫶🏽', 'A new reaction replaces the old one');
messages = [{ id: 'a2', role: 'assistant', content: '你好' }];
messages = [
  { id: 'old', role: 'user', content: '亲亲', mediaData: { tapback: '❤️', tapbackBy: 'assistant', label: 'kept' } },
  { id: 'new', role: 'user', content: '把刚才的爱心换成亲吻' },
];
assert.equal(tapback.applyAssistantTapback('session', '😘|replace').id, 'old');
assert.equal(messages[0].mediaData.tapback, '😘');
assert.equal(messages[0].mediaData.label, 'kept');
assert.equal(messages[1].mediaData, undefined);
assert.equal(tapback.applyAssistantTapback('session', '🥹|old').id, 'old');
assert.equal(tapback.applyAssistantTapback('session', '🥹|missing'), null);
assert.equal(tapback.applyAssistantTapback('session', '😂').id, 'new');
messages = [{ id: 'a2', role: 'assistant', content: '你好' }];
assert.equal(tapback.applyAssistantTapback('session', '😘|replace'), null);
assert.equal(tapback.applyAssistantTapback('session', '😂'), null);
console.log('PASS: Enter/IME/newline behavior; native emoji validation; optional tapback, target selection and replacement.');
messages = [{ id: 'group-user', role: 'user', content: '今晚一起吃饭' }];
const alice = { actorId: 'alice', actorName: '角色甲' };
const bob = { actorId: 'bob', actorName: '角色乙' };
tapback.applyGroupAssistantTapback('group', '❤️', alice);
tapback.applyGroupAssistantTapback('group', '😂', bob);
assert.equal(messages[0].mediaData.tapbacks.length, 2);
messages.push({ id: 'request', role: 'user', content: '换一个' });
tapback.applyGroupAssistantTapback('group', '🥹|replace', alice);
assert.equal(messages[0].mediaData.tapbacks.find(r => r.actorId === 'alice').emoji, '🥹');
assert.equal(messages[0].mediaData.tapbacks.find(r => r.actorId === 'bob').emoji, '😂');
tapback.setGroupTapback('group', 'group-user', { actorId: 'self', actorName: '你' }, '👍', true);
tapback.setGroupTapback('group', 'group-user', { actorId: 'self', actorName: '你' }, '👍', true);
assert.equal(messages[0].mediaData.tapbacks.length, 2);
assert.equal(tapback.applyGroupAssistantTapback('group', 'hello', alice), null);
console.log('PASS: independent group actors, replacement and user-only removal.');

// Old/malformed records and duplicate actors cannot crash rendering or overwrite other actors.
assert.equal(tapback.normalizeGroupTapbacks({length:2}).length,0);
assert.equal(tapback.normalizeGroupTapbacks([null,{actorId:'a',emoji:'❤️'},{actorId:'a',emoji:'😂'},{actorId:'b',emoji:'👍'}]).length,2);
assert.equal(tapback.normalizeGroupTapbacks([{actorId:'a',emoji:'heart'}])[0].emoji,'❤️');

// Execute the actual streamed group save loop: Tapback must never become a stored action bubble.
const room = fs.readFileSync(path.join(__dirname,'../components/chat/chat-room.tsx'),'utf8');
const loopStart = room.indexOf('const parts = stripInvalidStickerParts(rawParts, senderInfo.characterId);');
const loopEnd = room.indexOf('if (!savedAnyPart',loopStart);
const loop = ts.transpileModule(room.slice(loopStart,loopEnd),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
messages=[{id:'target',role:'user',content:'早安'}];
for(const actor of [alice,bob]) {
  vm.runInNewContext(loop,{
    rawParts:[{content:'',mediaType:'tapback_action',mediaData:{tapback:actor===alice?'❤️':'😂'}}],
    stripInvalidStickerParts:p=>p,senderInfo:{characterId:actor.actorId,characterName:actor.actorName},
    session:{id:'group',participantIds:['alice','bob']},generationGuard:{},throwIfGenerationStopped:()=>{},
    isGroupMuted:()=>false,applyGroupAssistantTapback:tapback.applyGroupAssistantTapback,syncMessagesFromStorage:()=>{},
    buildAssistantMessageDraft:()=>{throw new Error('Tap action must not be saved as a message');},
  });
}
assert.equal(messages[0].mediaData.tapbacks.length,2);
const projectionStart=room.indexOf('const projectedMediaData =');
const projectionEnd=room.indexOf('projected.push(',projectionStart);
const projectionContext={part:{content:'displayed'},base:messages[0]};
vm.runInNewContext(ts.transpileModule(room.slice(projectionStart,projectionEnd)+'\nglobalThis.result=mediaData;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,projectionContext);
assert.equal(projectionContext.result.tapbacks.length,2);
console.log('PASS: actual streamed group save loop executes multiple actors; display projection retains reactions; malformed records are safe.');

// Screenshot regression: repeated speaker sections, including a standalone Tapback section.
const groupSource=fs.readFileSync(path.join(__dirname,'../lib/group-chat-engine.ts'),'utf8');
const groupFunction=groupSource.match(/export function parseGroupChatResponse\([\s\S]*?\n\}/)[0];
const groupContext={exports:{},stripGroupFinancialActionsForMetadataRepair:text=>text};
vm.runInNewContext(ts.transpileModule(groupFunction,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,groupContext);
const parser=load('lib/rich-message-parser.ts',{
 './chat-echo':load('lib/chat-echo.ts'),
 './state-value-parser':load('lib/state-value-parser.ts'),
 './action-parser':{stripActionShells:text=>text},
 './text-tool-protocol':{stripTextToolDirectives:text=>text},
 './custom-app-chat-directives':{loadCustomAppChatDirectives:()=>[]},
});
const sections=groupContext.exports.parseGroupChatResponse('[Oneone]: 我来，第一个是我\n\n[Oneone]: [Tapback:😘]\n\n[Twoo]: 你插什么队\n\n[Twoo]: [Tapback:🥹]',new Map([['Oneone','one'],['Twoo','two']]));
messages=[{id:'screenshot-user',role:'user',content:'大家早安'}];
for(const section of sections){
 for(const part of parser.parseAIResponse(section.responseText,[]).parts){
  if(part.mediaType==='tapback_action') tapback.applyGroupAssistantTapback('group',part.mediaData.tapback,{actorId:section.characterId,actorName:section.characterName});
 }
}
assert.equal(messages[0].mediaData.tapbacks.length,2);
assert.equal(messages[0].mediaData.tapbacks.find(r=>r.actorId==='one').emoji,'😘');
console.log('PASS: screenshot-style standalone per-character Tapback sections parse and persist two distinct reactions.');

messages=[
 {id:'user',role:'user',content:'你们聊'},
 {id:'alice-text',role:'assistant',senderCharacterId:'alice',senderName:'角色甲',content:'我先来'},
 {id:'bob-text',role:'assistant',senderCharacterId:'bob',senderName:'角色乙',content:'收到'},
 {id:'removed',role:'assistant',senderCharacterId:'bob',senderName:'角色乙',content:'撤回',isRetracted:true},
 {id:'hidden',role:'assistant',senderCharacterId:'bob',senderName:'角色乙',content:'动作',mediaType:'avatar_action'},
 {id:'system',role:'system',content:'通知'},
];
assert.equal(tapback.applyGroupAssistantTapback('group','❤️|alice-text',bob).id,'alice-text');
assert.equal(tapback.applyGroupAssistantTapback('group','😂|@角色乙',alice).id,'bob-text');
assert.equal(tapback.applyGroupAssistantTapback('group','🥹|actor:alice',bob).id,'alice-text');
assert.equal(tapback.applyGroupAssistantTapback('group','😘|replace',alice).id,'bob-text');
for(const target of ['alice-text','actor:alice','@角色甲','removed','hidden','system','missing']) {
 assert.equal(tapback.applyGroupAssistantTapback('group',`❤️|${target}`,alice),null,target);
}
assert.equal(tapback.applyGroupAssistantTapback('group','👍',alice).id,'user','Legacy implicit target stays user');
messages.push({id:'duplicate-name',role:'assistant',senderCharacterId:'carol',senderName:'角色乙',content:'我同名'});
assert.equal(tapback.applyGroupAssistantTapback('group','❤️|@角色乙',alice),null,'Ambiguous names cannot pick arbitrarily');
assert.equal(tapback.applyGroupAssistantTapback('group','❤️|actor:bob',alice).id,'bob-text');
const tapPrompt=tapback.buildGroupTapbackPrompt(messages);
assert.match(tapPrompt,/其他 char/);assert.match(tapPrompt,/actor:bob/);assert.match(tapPrompt,/alice-text/);
assert.doesNotMatch(tapPrompt,/removed \||hidden \||system \|/);
// A just-emitted char message is a target for B's streamed action in the same round.
messages=[{id:'fresh-alice',role:'assistant',senderCharacterId:'alice',senderName:'角色甲',content:'刚说完'}];
vm.runInNewContext(loop,{
 rawParts:[{content:'',mediaType:'tapback_action',mediaData:{tapback:'😂|@角色甲'}}],
 stripInvalidStickerParts:p=>p,senderInfo:{characterId:'bob',characterName:'角色乙'},
 session:{id:'group',participantIds:['alice','bob']},generationGuard:{},throwIfGenerationStopped:()=>{},
 isGroupMuted:()=>false,applyGroupAssistantTapback:tapback.applyGroupAssistantTapback,syncMessagesFromStorage:()=>{},
 buildAssistantMessageDraft:()=>{throw new Error('No separate Tapback action bubble');},
});
assert.equal(messages[0].mediaData.tapbacks[0].actorId,'bob');
tapback.applyGroupAssistantTapback('group','👍|fresh-alice',{actorId:'carol',actorName:'角色丙'});
assert.equal(messages[0].mediaData.tapbacks.length,2,'Reactions on chars also stack independently');
for(const action of ['😂|@角色甲','❤️|actor:alice','👍|alice-text']) {
 assert.equal(parser.parseAIResponse(`[Tapback:${action}]`,[]).parts[0].mediaData.tapback,action);
}
assert.equal(parser.parseAIResponse('[Avatar:history:previous]',[]).parts[0].mediaData.avatarImageId,'history:previous');
assert.equal(parser.parseAIResponse('[Avatar:p1|白色小猫]',[]).parts[0].mediaData.avatarImageId,'p1|白色小猫');
console.log('PASS: char-to-char Tapback by message/name/actor ID, replacement, exclusions, ambiguous names and same-round streamed reactions.');
