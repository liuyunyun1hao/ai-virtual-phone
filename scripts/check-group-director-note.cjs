const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),ts=require('typescript');
const read=f=>fs.readFileSync(f,'utf8'),compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let sessions=[{id:'s',isGroup:true,isSpectator:true},{id:'ordinary',isGroup:true}],writes=0,next=0;
const storageIds={};const storageSource=read('lib/chat-storage.ts');vm.runInNewContext(compile(storageSource.slice(storageSource.indexOf('export function createResponseRoundId()'),storageSource.indexOf('export function createToolExecutionId()'))),{exports:storageIds});
const api={};vm.runInNewContext(compile(read('lib/group-director-note.ts')),{exports:api,require:()=>({createResponseRoundId:storageIds.createResponseRoundId,loadChatSessions:()=>structuredClone(sessions),saveChatSessions:s=>{sessions=s;writes++}})});
assert.equal(api.queueGroupDirectorNote('ordinary','hello'),false);assert.equal(writes,0);
assert.equal(api.queueGroupDirectorNote('s','  我说：让他们讨论旅行  '),true);
const first=api.getGroupDirectorNote('s');assert.equal(first.text,'我说：让他们讨论旅行');
assert.match(first.id,/^director_/);assert.equal(new Set(Array.from({length:500},()=>{api.queueGroupDirectorNote('s','test');return api.getGroupDirectorNote('s').id})).size,500);
api.queueGroupDirectorNote('s',first.text);first.id=api.getGroupDirectorNote('s').id;
assert.equal(api.queueGroupDirectorNote('s',''),true);assert.equal(api.getGroupDirectorNote('s').id,first.id);
assert.equal(api.queueGroupDirectorNote('s','x'.repeat(4001)),false);
assert.match(api.buildGroupTurnDirectionContext(first.text),/不是user发言/);
api.queueGroupDirectorNote('s','new');api.consumeGroupDirectorNote('s',first.id);assert.equal(api.getGroupDirectorNote('s').text,'new');
api.consumeGroupDirectorNote('s',api.getGroupDirectorNote('s').id);assert.equal(api.getGroupDirectorNote('s'),undefined);
const source=read('components/chat/chat-room.tsx'),handler=source.slice(source.indexOf('    const handleSubmit = () => {'),source.indexOf('\n    const sendEffectDraft ='));
for(const text of ['导演指引','']) {
 const calls=[],ex={};vm.runInNewContext(compile(handler+'\nexports.submit=handleSubmit'),{exports:ex,isGenerating:false,isSpectator:true,isGroup:true,inputLocked:true,inputText:text,onSendDirectorNote:t=>{calls.push(['director',t]);return true},setInputText:()=>{},resetTextareaHeight:()=>{},onClosePanels:()=>{},sendDraft:()=>{throw Error('user path')},onTriggerAIResponse:()=>{throw Error('legacy path')}});ex.submit();assert.deepEqual(calls,[['director',text]]);
}
const offline=source.slice(source.indexOf('    const handleOfflineSend ='),source.indexOf('    const handleOfflineSend =')+8000);
assert.match(offline,/currentText = directorMode \? "" : draftText/);assert.match(offline,/userContent: currentText/);assert.match(offline,/consumeGroupDirectorNote/);
console.log('PASS director storage isolation, normal group rejected, empty retry retention, oversized draft rejection, ID-safe consumption, production input dispatch and offline empty user history. No API calls.');
