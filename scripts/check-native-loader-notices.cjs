const fs=require('fs'),ts=require('typescript'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('lib/chat-engine.ts','utf8'),ast=ts.createSourceFile('engine.ts',source,ts.ScriptTarget.Latest,true);
const names=new Set(['stableToolHash','makeNativeToolName','nativeToolSourceKey','isNativeSingleTool','normalizeNativeExpandedToolSourceIds','touchNativeExpandedToolSource','parseNativeToolSchema','formatNativeUsageGuide','formatNativeToolDescription','expandNativeToolText','wrapNativeGroupToolParameters','buildNativeChatTools','formatNativeLoaderToolResult','formatNativeChatToolResult','generateNativeChatCompletion']);
const code=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name&&names.has(n.name.text)).map(n=>n.getText(ast)).join('\n');
const tool={source:'rest_package',sourceId:'phone',name:'phone',description:'phone actions',restTools:[{name:'readPhone',description:'read',parameterSchema:'{}'}]};
let round=0,persisted=[],notices=[],returned=[],secondMessages,loaderName,executions=0;
const box={exports:{},Date,Map,Set,console,MAX_NATIVE_EXPANDED_TOOL_PACKAGES:2,
 getEnabledTools:()=>[tool],mergeAppTags:()=>[],loadChatSessions:()=>[],toLlmRequestMessages:()=>[],getMaxToolRounds:()=>3,
 isSessionStreamingEnabled:()=>false,throwIfAborted:()=>{},stripPresetTexts:t=>t,parseActionTags:t=>({cleanText:t,actions:[]}),stripStateAndInnerForPrompt:t=>t,
 executeToolCalls:async()=>{executions++;return[]},persistNativeExpandedToolSourceIds:(_,ids)=>{persisted.push([...ids]);},createToolExecutionId:()=> 'exec',
 sendLLMToolRequest:async(_c,_p,messages,definitions)=>{
  if(round++===0){loaderName=definitions[0].name;return{content:'',toolCalls:Array.from({length:8},(_,i)=>({id:'call'+i,name:loaderName,args:{}}))};}
  if(round===2){assert.equal(definitions.length,1);return{content:'',toolCalls:[...Array.from({length:8},(_,i)=>({id:'stale'+i,name:loaderName,args:{}})),{id:'unknown',name:'load_composite_package_nonexistent',args:{}}]};}
  secondMessages=[...messages];assert.equal(definitions.length,1,'only actual action remains');assert.match(definitions[0].description,/read/);
  return{content:'done',toolCalls:[]};
 },
};
vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,box);
const before=box.exports.buildNativeChatTools([tool],[]),after=box.exports.buildNativeChatTools([tool],['rest_package:phone']);
assert.equal(before.loaderMap.size,1);assert.equal(after.loaderMap.size,0);assert.equal(after.realToolSourceMap.size,1);
box.generateNativeChatCompletion({session:{id:'session',contactId:'char'},llmMessages:[],character:{name:'Role'},config:{},preset:null,regexes:[],userIdentity:null,options:{},bailoutRef:{shortcutHandles:[]},callbacks:{onToolNotice:n=>notices.push(n),onNativeToolResult:r=>returned.push(r)}}).then(async result=>{
 assert.equal(notices.length,0,'loader notices stay internal');assert.equal(persisted.length,1);assert.equal(persisted[0].length,1);
 assert.equal(returned.length,17,'every native call ID gets a response');assert.equal(new Set(returned.map(r=>r.toolCallId)).size,17);
 assert.equal(secondMessages.filter(m=>m.role==='tool').length,17);assert.equal(result.parts[0].text,'done');assert.equal(executions,0,'stale/unknown loaders never execute actions');
 console.log('PASS: actual native loop expands duplicate loaders once, recognizes stale loaders after removal, rejects unknown names internally, preserves all 17 call/result IDs and resumes reply without notices.');
 const groupSource=fs.readFileSync('lib/group-chat-engine.ts','utf8'),groupAst=ts.createSourceFile('group.ts',groupSource,ts.ScriptTarget.Latest,true);
 const loop=groupAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='runNativeGroupToolLoop').getText(groupAst);
 Object.assign(box,{getNativeGroupActorName:()=> 'Role',appendNativeMediaContext:async()=>{},nativeGroupToolCallToTextCall:()=>{throw Error('no real action expected')}});
 vm.runInNewContext(ts.transpileModule(loop,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,box);
 round=0;persisted=[];notices=[];returned=[];executions=0;
 const groupResult=await box.runNativeGroupToolLoop({session:{id:'g',isGroup:true,groupName:'Group'},llmMessages:[],config:{},preset:null,regexes:[],nameToId:new Map([['Role','char']]),memberNames:['Role'],enabledTools:[tool],userName:'User',appTags:[],callbacks:{onToolNotice:n=>notices.push(n),onNativeToolResult:r=>returned.push(r)}});
 assert.equal(groupResult,'done');assert.equal(notices.length,0);assert.equal(returned.length,17);assert.equal(executions,0);assert.equal(persisted.length,1);
 console.log('PASS: actual group native loop has the same stale/unknown-loader guards. No model called.');
}).catch(e=>{console.error(e);process.exitCode=1;});
