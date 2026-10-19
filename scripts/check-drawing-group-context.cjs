const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:id=>{if(!(id in mocks))throw Error(id);return mocks[id]},AbortController,DOMException,setTimeout,clearTimeout});return exports;}
const core=load('lib/chat-drawing.ts');
const group={id:'g',contactId:'g',isGroup:true,participantIds:['a','b','c']};
let identity='u',live=group,builds=0,calls=0,received,delta=[];
const engine={buildChatPromptMessages:async()=>{throw Error('private builder must not run')},sendLLMStreamRequest:async(...args)=>{calls++;received=args;for(const value of delta)await args[6].onDelta(JSON.stringify(value));}};
const privateModel=load('lib/chat-drawing-model.ts',{'./chat-drawing':core,'./chat-engine':engine});
const model=load('lib/chat-drawing-group.ts',{'./chat-drawing':core,'./chat-engine':engine,'./identity-runtime':{getCurrentIdentityId:()=>identity},'./chat-storage':{loadChatSessions:()=>[live]},'./group-chat-engine':{buildGroupChatPromptMessages:async(session,history,options)=>{builds++;assert.equal(session.isGroup,true);assert.equal(history[0].senderCharacterId,'b');assert.equal(options.disableTools,true);return {config:{enableImageRecognition:true},preset:null,llmMessages:[{role:'system',content:'group attribution'}],nameToId:new Map([['甲','a'],['乙','b'],['丙','c']]),userName:'用户'};}}});
const stroke=authorId=>({type:'stroke',authorId,brush:'pen',color:'#428e70',width:4,opacity:1,points:[[200,200,.5],[230,210,.6]]});
const comment=authorId=>({type:'comment',authorId,text:'看到了'});
const args=()=>({session:group,painterIds:['a','b'],history:[{senderCharacterId:'b',content:'乙的发言'}],image:'data:image/png;base64,TEST',strokes:[],comments:[],signal:new AbortController().signal,onStroke:async()=>{},onComment:async()=>{}});
(async()=>{
 assert.throws(()=>privateModel.requestDrawingTurn({...args(),characterId:'a',mode:'solo'}),/群聊/);
 const ink=[],voices=[];
 delta=[stroke('b'),stroke('c'),comment('c'),comment('outsider'),stroke('a'),stroke('b'),stroke('a'),comment('c'),comment('c')];
 await model.requestGroupDrawingRound({...args(),onStroke:async s=>ink.push(s.author),onComment:async(id,name,text)=>voices.push([id,name,text])});
 assert.deepEqual(ink,['a','b']);assert.deepEqual(voices.map(x=>x[0]),['c','c']);assert.equal(voices[0][1],'丙');assert.equal(builds,1);assert.equal(calls,1);assert.equal(received[2][0].content,'group attribution');assert.equal(received[2].at(-1).content[1].type,'image_url');
 const soloInk=[];delta=[stroke('a'),comment('b')];await model.requestGroupDrawingRound({...args(),painterIds:[],onStroke:async s=>soloInk.push(s)});assert.equal(soloInk.length,0);
 delta=[{type:'done'}];await model.requestGroupDrawingRound({...args(),painterIds:[]});
 const budget=[];delta=[...Array.from({length:8},()=>stroke('a')),stroke('b')];await model.requestGroupDrawingRound({...args(),onStroke:async s=>budget.push(s.author)});assert.equal(budget.filter(x=>x==='a').length,6);assert.equal(budget.at(-1),'b');
 const skip=[];delta=[{type:'skip',authorId:'a'},stroke('a'),stroke('b')];await model.requestGroupDrawingRound({...args(),onStroke:async s=>skip.push(s.author)});assert.deepEqual(skip,['b']);
 const controller=new AbortController(),cancelInk=[];delta=[stroke('a'),stroke('b')];await assert.rejects(model.requestGroupDrawingRound({...args(),signal:controller.signal,onStroke:async s=>{cancelInk.push(s.author);controller.abort(new Error('closed'));}}),/closed/);assert.deepEqual(cancelInk,['a']);
 delta=[comment('a'),stroke('a')];await assert.rejects(model.requestGroupDrawingRound({...args(),onComment:async()=>{identity='changed';}}),/身份或群成员/);identity='u';
 await assert.rejects(model.requestGroupDrawingRound({...args(),onComment:async()=>{live={...group,participantIds:['a']};}}),/身份或群成员/);live=group;
 console.log('PASS: group context, one request, author ownership, ordered painters, solo/silence, limits, skip, cancellation, identity/membership. No real model called.');
})().catch(e=>{console.error(e);process.exitCode=1});
