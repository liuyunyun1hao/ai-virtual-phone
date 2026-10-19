const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
let stored = '{}'; const values = new Map();
const {core,data:coreData} = require('./album-core-test-helper.cjs')();
let permission = {characterIds:[],revision:'private',availableAt:0};
let assets = [{ id: 'chat:s:p', source: { kind: 'chat', sessionId: 's', messageId: 'p' }, mediaRef: 'photo-v1', label: '早餐', createdAt: '2026-09-19', baseAnnotations: [], albumAnnotations: [] }];
const modules = {
  './photo-album-core':core,
  './photo-album-permissions': {getAlbumPermission:()=>permission},
  './kv-db': { kvGet: k => k === 'ai_phone_album_discussions_v1' ? stored : values.get(k), kvSet: (k, v) => values.set(k,v), kvKeysWithPrefix: p => [...values.keys()].filter(k=>k.startsWith(p)), registerKvMigration() {}, registerDynamicPrefix() {}, migrateKvRecords: async()=>{}  },
  './chat-storage': { loadChatSessions: () => { throw new Error("Album must not scan every chat history"); }, getChatSessionMetadata: () => [{ id: 's', contactId: 'char' }], loadChatMessages: () => [{id: 'p', content: '早餐', role: 'user'}] },
  './photo-album-storage': { collectPhotoAlbumAssets: () => assets },
};
const sandbox = { exports: {}, require: k => modules[k], Date, Math, JSON, Set, setTimeout, console, window: undefined };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/photo-album-discussion.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
const d = sandbox.exports, asset = assets[0];
const cached = d.loadAlbumDiscussions();
assert.equal(d.loadAlbumDiscussions(), cached, 'Unchanged storage reuses parsed discussions');
stored = '{"external":{"assetId":"external"}}';
assert.equal(d.loadAlbumDiscussions().external.assetId, 'external', 'External storage writes invalidate cache');
stored = '{}';
d.queueAlbumReview(asset);
assert.ok(d.getAlbumDiscussion(asset).dueAt <= Date.now());
d.addUserAlbumComment(asset, ' 好好吃 ');
assert.equal(d.getAlbumDiscussion(asset).comments[0].text, '好好吃');
assert.ok(d.albumChatContext('char').includes('好好吃'));
assert.equal(d.albumChatContext('stranger'), '');
assert.equal(d.albumDiscussionMemory('char').length, 0, 'Unseen user comments must not enter character memory');
assert.equal(d.albumDiscussionMemory('stranger').length, 0);
const current = d.getAlbumDiscussion(asset);
d.saveAlbumDiscussion({ ...current, reviewed: { char: new Date(Date.now() + 100).toISOString() } });
assert.equal(d.albumDiscussionMemory('char').length, 1);
assert.equal(d.albumDiscussionMemory('stranger').length, 0, 'Other characters cannot access private discussion');
assert.equal(d.getAlbumDiscussion({...asset, mediaRef: 'photo-v2'}).comments.length, 0, 'Replaced images cannot inherit old discussion');
assets = [];
assert.equal(d.albumDiscussionMemory('char').length, 0, 'Removed source photos cannot leak into current album context');
console.log('PASS: discussion persistence, delayed review, access boundaries and replacement isolation');

(async () => {
 assets = [asset]; stored = '{}'; values.clear();
 d.addUserAlbumComment(asset, '测试新评论');
 d.saveAlbumDiscussion({...d.getAlbumDiscussion(asset), dueAt: 1});
 let calls = 0;
 const bindings = {
  './photo-album-core':core,
  './photo-album-actions':{executeAlbumAction:async()=>false},
  './photo-album-permissions': modules['./photo-album-permissions'],
  './photo-album-discussion': d,
  './photo-album-storage': {collectPhotoAlbumAssets:()=>assets},
  './character-storage': {loadInteractableCharacters:()=>[{id:'char',name:'角色',persona:'测试'}]},
  './settings-storage': {loadApiConfigs:()=>[{id:'api'}],loadBindingConfig:()=>({}),resolveBinding:()=>({apiConfigId:'api'}),loadPresets:()=>[],loadRegexes:()=>[],loadWorldBooks:()=>[],resolveUserIdentity:()=>({name:'用户'})},
  './llm-prompt-assembler': {assemblePromptPayload:()=>[]},
  './chat-engine': {sendLLMRequest:async()=>{calls++;return JSON.stringify({thought:'今天的早餐不错。',reply:'留了一份给你。'});}},
  './short-term-assembler': {prepareShortTermContext:()=>({recentBlocks:[],wbActivationContext:'',unifiedRecentItems:[]})},
  './memory-storage': {incrementEventCounter(){},loadMemoryConfig:()=>({})},
  './memory-service': {retrieveCoreMemoriesForPrompt:async()=>[],retrieveMemoriesForPrompt:async()=>[]},
  './memory-injector': {formatCoreMemories:()=>'',formatLongTermMemories:()=>''},
  './bg-timer': {bgSetInterval:()=>()=>{}},
 };
 const engine = {exports:{},require:k=>bindings[k],Date,Math,JSON,Set,AbortController};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/photo-album-review.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,engine);
 await engine.exports.reviewNextAlbumPhoto();
 assert.equal(calls,1);
 assert.equal(d.getAlbumDiscussion(asset).comments.length,3);
 assert.equal(d.getAlbumDiscussion(asset).comments.filter(c=>c.kind==='thought').length,1);
 await engine.exports.reviewNextAlbumPhoto();
 assert.equal(calls,1,'Completed reviews do not repeatedly invoke the model');
 assert.equal(d.albumDiscussionMemory('char').length,3);
 assert.equal(d.unreadAlbumReplies(asset),1);
 d.markAlbumRepliesRead(asset);
 assert.equal(d.unreadAlbumReplies(asset),0);
 // No user comment or detail-page visit is needed for the initial thought.
 stored='{}'; values.clear();
 await engine.exports.reviewNextAlbumPhoto();
 assert.equal(d.getAlbumDiscussion(asset).comments.length,1);
 assert.equal(d.getAlbumDiscussion(asset).comments[0].kind,'thought');
 const thoughtId=d.getAlbumDiscussion(asset).comments[0].id;
 const sibling={...asset,id:'chat:s:second-photo',label:'照片组第二张'};
 d.saveAlbumDiscussion({...d.getAlbumDiscussion(sibling),comments:[{id:'sibling-thought',authorId:'char',authorName:'角色',kind:'thought',text:'第二张自己的心语',createdAt:new Date().toISOString()}]});
 d.editAlbumThought(asset,thoughtId,'手写心语');
 assert.equal(d.getAlbumDiscussion(asset).comments[0].text,'手写心语');
 d.rerollAlbumThought(asset,'char');
 bindings['./chat-engine'].sendLLMRequest=async()=>JSON.stringify({thought:'重新想了一句',reply:'不该回复',delayMinutes:0});
 await engine.exports.reviewNextAlbumPhoto();
 assert.equal(d.getAlbumDiscussion(asset).comments.length,1);
 assert.equal(d.getAlbumDiscussion(asset).comments[0].text,'重新想了一句');
 assert.equal(d.getAlbumDiscussion(sibling).comments[0].text,'第二张自己的心语','Reroll must not affect another photo in the group');
 d.rerollAlbumThought(asset,'char');
 bindings['./chat-engine'].sendLLMRequest=async()=>{d.editAlbumThought(asset,thoughtId,'用户抢先改好');return JSON.stringify({thought:'过期重写',reply:null});};
 await engine.exports.reviewNextAlbumPhoto();
 assert.equal(d.getAlbumDiscussion(asset).comments[0].text,'用户抢先改好');
 for (const minutes of [1,5]) {
   d.addUserAlbumComment(asset,'稍后回我');
   bindings['./chat-engine'].sendLLMRequest=async()=>{calls++;return JSON.stringify({thought:null,reply:'不能提前发布',delayMinutes:minutes});};
   await engine.exports.reviewNextAlbumPhoto();
   let thread=d.getAlbumDiscussion(asset);
   assert.ok(thread.deferred.char.dueAt >= Date.now()+minutes*60000-1000);
   assert.ok(!thread.comments.some(c=>c.text==='不能提前发布'));
   const before=calls;
   await engine.exports.reviewNextAlbumPhoto();
   assert.equal(calls,before);
   d.saveAlbumDiscussion({...thread,dueAt:1,deferred:{char:{...thread.deferred.char,dueAt:1}}});
   bindings['./chat-engine'].sendLLMRequest=async()=>{calls++;return JSON.stringify({thought:null,reply:'现在看到啦',delayMinutes:5});};
   await engine.exports.reviewNextAlbumPhoto();
   assert.equal(d.getAlbumDiscussion(asset).dueAt,0);
   assert.equal(d.getAlbumDiscussion(asset).comments.at(-1).text,'现在看到啦');
 }
 d.addUserAlbumComment(asset,'第一条');
 d.notifyAlbumAnnotationChange({...asset,albumAnnotations:[{id:'mark',type:'text',text:'测试涂鸦'}]});
 assert.equal(d.getAlbumDiscussion(asset).comments.at(-1).kind,'annotation');
 assert.ok(d.albumChatContext('char').includes('测试涂鸦'));
 assert.equal(d.albumChatContext('stranger'),'');
 bindings['./chat-engine'].sendLLMRequest=async()=>{
   d.addUserAlbumComment(asset,'请求途中又留言');
   return JSON.stringify({thought:null,reply:null,delayMinutes:5});
 };
 await engine.exports.reviewNextAlbumPhoto();
 assert.ok(d.getAlbumDiscussion(asset).dueAt <= Date.now(),'Concurrent new comments must remain immediately pending');
 assert.equal(Object.keys(d.getAlbumDiscussion(asset).deferred).length,0,'Old review cannot delay a newer comment');
 d.saveAlbumDiscussion({...d.getAlbumDiscussion(asset), reviewed:{},dueAt:1});
 bindings['./chat-engine'].sendLLMRequest=async()=>{ assets = []; return '{"thought":"过期结果","reply":"过期结果"}'; };
 await engine.exports.reviewNextAlbumPhoto();
 assert.ok(!d.loadAlbumDiscussions()[asset.id].comments.some(c=>c.text==='过期结果'),'Removed photos must reject in-flight replies');
 console.log('PASS: mocked character review, thought/reply persistence, idempotence and stale result protection');
 assets=[{...asset,conversation:{kind:'group'}}];stored='{}'; values.clear();
 modules['./chat-storage'].getChatSessionMetadata=()=>[{id:'s',isGroup:true,participantIds:['char','other']}];
 bindings['./character-storage'].loadInteractableCharacters=()=>[{id:'char',name:'角色'},{id:'other',name:'另一个角色'}];
 bindings['./chat-engine'].sendLLMRequest=async()=>JSON.stringify({thought:'看到了照片',reply:'看到你画的了',delayMinutes:0});
 d.notifyAlbumAnnotationChange({...assets[0],albumAnnotations:[{id:'a',text:'群聊标记'}]});
 await engine.exports.reviewNextAlbumPhoto();
 assert.equal(d.getAlbumDiscussion(assets[0]).comments.filter(c=>c.kind==='comment').length,2);
 assert.ok(d.albumDiscussionMemory('other').some(c=>c.content.includes('群聊标记')));
 assert.equal(d.albumDiscussionMemory('stranger').length,0);
 console.log('PASS: group annotation notifications, replies and participant-scoped memory');
 stored='{}'; values.clear();coreData.clear();
 const uploaded={...asset,id:'album:upload',source:{kind:'album',assetVersionId:'upload'},uploadAlbum:'灵感'};
 assets=[uploaded];
 const beforeNative=calls;
 await engine.exports.reviewNextAlbumPhoto();
 assert.equal(calls,beforeNative);
 assert.equal(d.albumChatContext('char'),'');
 permission={characterIds:['char'],revision:'shared-v1',availableAt:Date.now()+60000};
 d.queueAlbumReview(uploaded);
 assert.equal(d.getAlbumDiscussion(uploaded).dueAt,0,'Sharing must not immediately expose photos');
 permission.availableAt=0;
 d.queueAlbumReview(uploaded);
 assert.ok(d.getAlbumDiscussion(uploaded).dueAt>Date.now(),'First review is delayed');
 d.saveAlbumDiscussion({...d.getAlbumDiscussion(uploaded),dueAt:1});
 bindings['./chat-engine'].sendLLMRequest=async()=>{calls++;return JSON.stringify({thought:'不得生成心语',reply:'这张很有趣',delayMinutes:0});};
 await engine.exports.reviewNextAlbumPhoto();
 assert.equal(d.getAlbumDiscussion(uploaded).comments.length,1);
 assert.equal(d.getAlbumDiscussion(uploaded).comments[0].kind,'comment');
 assert.ok(d.albumChatContext('char').includes('这张很有趣'));
 assert.equal(d.albumChatContext('other'),'');
 const afterNative=calls;
 await engine.exports.reviewNextAlbumPhoto();
 assert.equal(calls,afterNative,'No repeated review calls on unchanged photos');
 d.notifyAlbumAnnotationChange({...uploaded,albumAnnotations:[{id:'native-mark',text:'胡子'}]});
 await engine.exports.reviewNextAlbumPhoto();
 assert.equal(calls,afterNative+1,'Shared upload annotations trigger review');
 d.addUserAlbumComment(uploaded,'再次看看');
 bindings['./chat-engine'].sendLLMRequest=async()=>{permission={characterIds:[],revision:'revoked',availableAt:0};return JSON.stringify({thought:null,reply:'撤回后不可发布'});};
 await engine.exports.reviewNextAlbumPhoto();
 assert.ok(!d.getAlbumDiscussion(uploaded).comments.some(c=>c.text==='撤回后不可发布'));
 assert.ok(d.albumChatContext('char').includes('权限已撤回'));
 assert.equal(d.albumDiscussionMemory('char').length,1,'Revocation retains only previously seen historical snapshot');
 console.log('PASS: private/upload access, delayed sharing, comment-only autonomous review, annotation and in-flight revocation');
 permission={characterIds:['char'],revision:'again',availableAt:0};
 assets=[{...uploaded,contentVersion:'v1',variantVersion:'v1:marks1',mediaKind:'photo'}];
 let liveAsset=assets[0];
 d.addUserAlbumComment(liveAsset,'看这张');
 bindings['./chat-engine'].sendLLMRequest=async()=>{assets=[{...liveAsset,variantVersion:'v1:marks2',albumAnnotations:[{id:'new',text:'新标记'}]}];return JSON.stringify({thought:null,reply:'旧涂鸦回复'});};
 await engine.exports.reviewNextAlbumPhoto();
 assert.ok(!d.getAlbumDiscussion(assets[0]).comments.some(c=>c.text==='旧涂鸦回复'));
 liveAsset=assets[0];d.addUserAlbumComment(liveAsset,'刚修改背景');
 bindings['./chat-engine'].sendLLMRequest=async()=>{core.savePhotoDefinition(liveAsset,{text:'更正背景',confirmed:true,characterIds:['char']});return JSON.stringify({thought:null,reply:'旧背景回复'});};
 await engine.exports.reviewNextAlbumPhoto();
 assert.ok(!d.getAlbumDiscussion(liveAsset).comments.some(c=>c.text==='旧背景回复'));
 bindings['./chat-engine'].sendLLMRequest=async()=>JSON.stringify({thought:null,reply:'未看到原图',visual:'不应该保存的虚构视觉'});
 await engine.exports.reviewNextAlbumPhoto();
 assert.equal(core.getPhotoSeen(liveAsset,'char').visual,undefined,'Visual output without attached image is ignored');
 console.log('PASS: stale doodle/definition results rejected and no-image visual hallucinations ignored');
})().catch(e=>{console.error(e);process.exitCode=1});
