// Execute the production prompt builder with isolated data/services; no browser storage or API.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const read=f=>fs.readFileSync(f,'utf8'),compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const helper={};vm.runInNewContext(compile(read('lib/group-spectator-context.ts')),{exports:helper});
const {buildGroupSpectatorContext,buildGroupDirectionContext}=helper;
const source=read('lib/group-chat-engine.ts');
const chunk=source.slice(source.indexOf('async function buildGroupChatPromptMessages('),source.indexOf('\nfunction nativeGroupToolCallToTextCall'));
const chars=[{id:'a',name:'Alpha'},{id:'b',name:'Beta'}];let captured,guardCalls=0;
const directorApi={};vm.runInNewContext(compile(read('lib/group-director-note.ts')),{exports:directorApi,require:()=>({})});
let pendingDirector;
const flowApi={};vm.runInNewContext(compile(read('lib/group-dialogue-flow.ts')),{exports:flowApi});
const cadenceApi={};vm.runInNewContext(compile(read('lib/chat-cadence.ts')),{exports:cadenceApi});
const mocks={ONLINE_CHAT_CADENCE_INSTRUCTION:cadenceApi.ONLINE_CHAT_CADENCE_INSTRUCTION,buildGroupDialogueFlowInstruction:flowApi.buildGroupDialogueFlowInstruction,buildGroupSpectatorContext,buildGroupDirectionContext,getGroupDirectorNote:()=>pendingDirector,buildGroupTurnDirectionContext:directorApi.buildGroupTurnDirectionContext,
 loadCharacters:()=>chars,loadBindingConfig:()=>({}),resolveBinding:()=>({apiConfigId:'test',presetId:'custom',worldBookIds:[],regexIds:[]}),
 loadApiConfigs:()=>[{id:'test',preventEmptyGenerateRambling:true}],loadPresets:()=>[{id:'custom',name:'Custom without spectator entry',prompts:[]}],loadRegexes:()=>[],
 resolveUserIdentity:()=>({name:'Observer',bio:'Background relation'}),loadMemoryConfig:()=>({}),loadWorldBooks:()=>[],
 buildCharacterTimeContext:()=>({}),buildCalendarScheduleMarker:()=>'',getCurrentCalendarScheduleForPrompt:()=>'',getWeekStartIso:()=>'',
 prepareShortTermContext:()=>({wbActivationContext:''}),retrieveCoreMemoriesForPrompt:async()=>[],retrieveMemoriesForPrompt:async()=>[],formatCoreMemories:()=>'',formatLongTermMemories:()=>'',getLatestCharacterStateValues:()=>[],
 buildGroupTimeContext:()=>({}),getPromptTimestampOptionsForTimeContext:()=>({}),getEnabledTools:()=>[],nativeToolProtocolForConfig:()=>false,annotateGroupHistory:h=>h,
 prepareGroupShortTermContext:(_,h)=>({truncatedHistory:h,wbActivationContext:'',unifiedRecentItems:[]}),applyVisionImagePromptLimit:h=>h,getAvatarVisionPromptLimit:()=>0,
 buildGroupAvatarContext:()=>'',buildAvatarActionPrompt:()=>'',loadCustomStickers:()=>[],getCustomStickerExample:()=>'',buildMusicLocalMacro:async()=>'',buildMusicCloudMacro:async()=>'',
 isNeteaseConfigured:()=>false,runChatPluginTransform:async()=>({hint:''}),buildChatPluginPromptFragments:()=>'',formatCustomAppChatDirectivesForPrompt:()=>'',buildScreenEffectPromptHint:()=>'',formatToolsForPrompt:()=>'',formatGroupToolsForPrompt:()=>'',
 getStatusRegionConfig:()=>({}),buildChatBilingualInstruction:()=>'',buildOfflineBilingualInstruction:()=>'',buildGroupRosterMacro:()=>'<group_roster>Alpha、Beta</group_roster>',loadChatAppSettings:()=>({timeAware:false}),
 resolveStatusRegionSection:()=>'',resolveStatusRegionExampleLine:()=>'',resolveStatusRegionComposition:()=>'',resolveStatusRegionFullExample:()=>'',
 assembleGroupPromptPayload:input=>{captured=input;return [{role:'system',content:'custom preset output'}]},
 appendCurrentAvatarContext:async()=>{},buildCurrentAvatarSnapshot:()=>({}),appendCurrentChatBackgroundContext:async()=>{},groupAlbumContext:()=>'',
 buildGroupTapbackPrompt:()=>'',buildPokeUsagePrompt:()=>'',buildEchoPrompt:()=>'',buildLovePrompt:()=>'',buildFireworksPrompt:()=>'',buildImageDeliveryChatPrompt:()=>'',
 appendEmptyGenerateGuardMessage:messages=>{guardCalls++;messages.push({role:'user',content:'legacy continuation'})},
 ChatEngineError:Error,
};
const built={};vm.runInNewContext(compile(chunk+'\nexports.build=buildGroupChatPromptMessages;'),{exports:built,...mocks});
(async()=>{
 for(const offline of [false,true])for(const opening of [true,false]){
  const history=opening?[{role:'system',content:'Alpha、Beta加入了群聊'}]:[{role:'assistant',content:'接着讨论'}];
  const result=await built.build({id:'isolated',isGroup:true,isSpectator:true,participantIds:['a','b']},history,{appTags:offline?['group_chat','offline']:undefined});
  assert.match(captured.spectatorContext,/实际在场成员仅为：Alpha、Beta/);assert.match(captured.spectatorContext,/Observer不是群成员/);
  assert.match(captured.spectatorContext,/有幕后群说明时/);assert.match(captured.spectatorContext,opening?/本次开场/:/本次推进/);
  assert.match(captured.spectatorContext,offline?/第三人称镜头/:/线上呈现/);
  assert.equal(result.llmMessages.at(-1).content,captured.spectatorContext);assert.equal(result.llmMessages.at(-1).role,'system');
  assert.equal(result.llmMessages.filter(m=>m.role==='user').length,0);assert.equal(guardCalls,0);
  assert.equal(result.llmMessages.some(m=>m.content.includes('<group_dialogue_flow>')),!offline);
  assert.equal(result.llmMessages.some(m=>m.role==='system'&&m.content.includes('<online_chat_cadence>')),!offline);
 }
 await built.build({id:'normal',isGroup:true,participantIds:['a','b']},[{role:'system'}]);
 assert.equal(captured.spectatorContext,'');assert.equal(guardCalls,1);
 const flowNormal=await built.build({id:'normal-flow',isGroup:true,participantIds:['a','b']},[]);
 assert.ok(flowNormal.llmMessages.some(m=>m.role==='system'&&m.content.includes('<group_dialogue_flow>')));guardCalls=1;
 await built.build({id:'custom-app',isGroup:true,isSpectator:true,participantIds:['a','b']},[],{appTags:['custom_app']});
 assert.equal(captured.spectatorContext,'');assert.equal(guardCalls,2);
 const directed=await built.build({id:'directed',isGroup:true,isSpectator:true,groupDescription:'聊一聊最近的旅行计划',participantIds:['a','b']},[]);
 assert.equal(directed.llmMessages.at(-1).role,'system');assert.match(directed.llmMessages.at(-1).content,/聊一聊最近的旅行计划/);
 assert.match(directed.llmMessages.at(-1).content,/不是群公告、群内发言/);assert.equal(guardCalls,2);
 assert.equal(buildGroupDirectionContext('  '),'');
 pendingDirector={id:'turn',text:'我说：让他们自然聊到旅行'};
 for(const offline of [false,true]) {
  const result=await built.build({id:'isolated',isGroup:true,isSpectator:true,participantIds:['a','b']},[],{appTags:offline?['group_chat','offline']:undefined});
  assert.equal(result.llmMessages.at(-1).role,'system');assert.match(result.llmMessages.at(-1).content,/我说：让他们自然聊到旅行/);assert.match(result.llmMessages.at(-1).content,/不是user发言/);
  assert.equal(result.llmMessages.filter(m=>m.role==='user').length,0);
 }
 const ordinary=await built.build({id:'ordinary',isGroup:true,participantIds:['a','b']},[]);
 assert.ok(!ordinary.llmMessages.some(m=>m.content.includes('group_turn_director_instruction')));
 pendingDirector=undefined;
 const storage=read('lib/chat-storage.ts'),creation=storage.slice(storage.indexOf('export function createGroupSession('),storage.indexOf('\nexport function deleteChatSession('));
 const createModule={};let saved;
 vm.runInNewContext(compile(creation),{exports:createModule,loadChatSessions:()=>[],saveChatSessions:s=>saved=s,DEFAULT_VISION_IMAGE_PROMPT_LIMIT:7});
 const created=createModule.createGroupSession('Their circle',['a','npc'],{isSpectator:true,groupDescription:'  background note  '});
 assert.equal(created.groupDescription,'background note');assert.equal(created.groupOwnerId,'a');assert.equal(created.isSpectator,true);assert.equal(saved[0],created);
 // Execute the production persona-injection fragment; ordinary persona stays byte-identical.
 const assembler=read('lib/llm-prompt-assembler.ts');
 const fragment=assembler.slice(assembler.indexOf('    // 1. User persona block before members'),assembler.indexOf('    // 1.5 跨成员世界书'));
 const persona=ctx=>{const blocks=[];vm.runInNewContext(compile('let orderIdx=0;'+fragment),{input:{spectatorContext:ctx},blocks,beforeHistoryDepth:2,resolvedUserName:'Observer',userIdentity:{name:'Observer'},buildUserPersonaText:()=>"The user's name is Observer.",wrapXml:(tag,s)=>`<${tag}>${s}</${tag}>`});return blocks};
 const facts=buildGroupSpectatorContext({isSpectator:true,userName:'Observer',memberNames:['Alpha','Beta'],offline:false,history:[]});
 assert.equal(persona(facts)[0].text,facts);assert.match(persona(facts)[1].text,/未在场人物/);
 assert.equal(persona('')[0].text,"<personaDescription>The user's name is Observer.</personaDescription>");
 console.log('PASS: production group builder, custom preset without spectator entry, opening/continuation × online/offline, final session facts, no fake user guard, offstage persona, unchanged normal group/custom-app scope. No API calls.');
})().catch(e=>{console.error(e);process.exitCode=1});
