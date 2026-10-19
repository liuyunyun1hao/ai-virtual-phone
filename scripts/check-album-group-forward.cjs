const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const source=fs.readFileSync('lib/follow-up-service.ts','utf8');
const fn=source.slice(source.indexOf('export async function requestBackgroundChatReply('),source.indexOf('/** Cancel any pending follow-up'));
let group=true, groupCalls=0,privateCalls=0;
const saved=[],errors=[];
const box={exports:{},require:()=>({generateGroupChatCompletion:async()=>{groupCalls++;return [{characterId:'a',characterName:'A',responseText:'第一条'},{characterId:'b',characterName:'B',responseText:'第二条'}];}}),
 backgroundReplyFiringSet:new Set(),backgroundGeneratingSessions:new Set(),cancelledBackgroundSessions:new Set(),
 loadChatSessions:()=>[{id:'s',isGroup:group}],loadChatMessages:()=>[],window:{dispatchEvent(){}},CustomEvent:class{},
 isBackgroundGenerationCancelled:()=>false,saveBackgroundCompletionRounds:async(...args)=>{saved.push(args);return {hasVisible:false,stateValues:[]};},
 generateBackgroundCompletionRounds:async()=>{privateCalls++;return [];},scheduleFollowUp(){},pushChatMessage:m=>errors.push(m),console};
vm.runInNewContext(ts.transpileModule(fn,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,box);
(async()=>{assert.equal((await box.exports.requestBackgroundChatReply('s')).ok,true);assert.equal(groupCalls,1);assert.equal(privateCalls,0);assert.equal(saved[0][5].senderCharacterId,'a');assert.equal(saved[1][5].senderCharacterId,'b');group=false;await box.exports.requestBackgroundChatReply('s');assert.equal(privateCalls,1);assert.equal(errors.length,0);assert.equal(box.backgroundReplyFiringSet.size,0);console.log('PASS: background forwarded group uses group engine, preserves each sender; private flow unchanged');})().catch(e=>{console.error(e);process.exitCode=1});
