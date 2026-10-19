const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const css=fs.readFileSync(path.join(root,'styles/imessage26.css'),'utf8');
assert.match(css,/\.echo-live-field\s*\{[^}]*z-index:\s*2;/,"Echo swarm field must render above the fixed source clone");
assert.match(css,/\.echo-live-original\s*\{[^}]*z-index:\s*1;/,"Echo source clone must stay below the orbiting copies");
const compile=file=>ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function load(file,mocks={}){const exports={};vm.runInNewContext(compile(file),{exports,require:id=>{if(!(id in mocks))throw Error(id);return mocks[id]}});return exports;}
const echo=load('lib/chat-echo.ts');
const love=load('lib/chat-love.ts',{'./chat-echo':echo});
const {echoLayout}=load('lib/chat-echo-layout.ts');
const {echoOrbitFrames}=load('components/chat/echo-preview.tsx',{'react':{},'react/jsx-runtime':{},'@/lib/chat-echo-layout':{echoLayout}});
const endings=Array.from({length:144},(_,i)=>echoOrbitFrames(i,390,844,{x:320,y:730}).at(-1));
// Compare the unchanged pre-dissolve orbit against the archived layout, not a new approximation.
const baselineSource=require('node:child_process').execFileSync('git',['show','9fb7602:components/chat/echo-preview.tsx'],{cwd:root,encoding:'utf8'});
const baseline={};vm.runInNewContext(ts.transpileModule(baselineSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports:baseline,require:id=>id==='@/lib/chat-echo-layout'?{echoLayout}:{}});
for(let i=0;i<144;i++){
 const actual=echoOrbitFrames(i,390,844,{x:320,y:730}),old=baseline.echoOrbitFrames(i,390,844,{x:320,y:730});
 assert.equal(actual.length,121);
 for(let step=0;step<=84;step++){assert.equal(actual[step].transform,old[step].transform);assert.equal(actual[step].zIndex,old[step].zIndex);}
 assert.equal(actual[60].opacity,1,'mid-flight copies are opaque regardless of depth');
}
assert.ok(endings.every(f=>f.opacity===0),'every Echo copy fully dissolves');
assert.ok(endings.filter(f=>{const xy=f.transform.match(/translate3d\(([-\d.]+)px,([-\d.]+)px/);return Math.hypot(Number(xy[1])-320,Number(xy[2])-730)>100}).length>100,'copies fade across the screen instead of gathering at the source');
assert.equal(echoLayout('短句❤️',150,40).count,144);assert.equal(echoLayout('短句❤️',150,40).scale,1);
const longLayout=echoLayout('这是很长的一段话。'.repeat(25),270,220);
assert.ok(longLayout.count<80 && longLayout.count>=28);assert.ok(longLayout.scale<.7);
const parser=load('lib/rich-message-parser.ts',{'./chat-echo':echo,'./chat-love':love,'./state-value-parser':load('lib/state-value-parser.ts'),'./image-grid-split':{isImageGridCount:n=>n>=2&&n<=20},'./photo-doodle':{parsePhotoDoodle:()=>null},'./action-parser':{stripActionShells:t=>t},'./text-tool-protocol':{stripTextToolDirectives:t=>t},'./custom-app-chat-directives':{loadCustomAppChatDirectives:()=>[],formatCustomAppDirectiveSummary:()=>'',getCustomAppDirectiveSyntaxHead:()=>'',splitCustomAppDirectiveArgs:()=>[]}});
const parts=t=>parser.parseAIResponse(t,[]).parts;
assert.equal(echo.hasEcho(parts('[Echo]求你了🥺！')[0]),true);
assert.equal(parts('[Echo]求你了🥺！')[0].content,'求你了🥺！');
assert.equal(echo.hasEcho(parts('[Echo][引用:别跑]等等我❤️')[0]),true);
assert.equal(echo.hasEcho(parts('[Echo]我喜欢你\n\n普通消息')[1]),false);
const repeated=parts('[Echo]想你❤️\n\n[Echo]抱抱\n\n[Echo]亲亲');
assert.equal(repeated.filter(echo.hasEcho).length,1);
assert.equal(repeated.map(p=>p.content).join('|'),'想你❤️|抱抱|亲亲');
assert.match(echo.buildEchoPrompt(),/暧昧、甜蜜/);
assert.match(echo.buildEchoPrompt(),/每轮回复最多一条/);
assert.match(echo.buildEchoPrompt(),/不连续多轮使用/);
for(const marker of ['[表情包:开心]','[照片:天空]','[语音条:你好]','[音乐:歌]','[Tapback:❤️]','<div>HTML</div>','```html\n<div>HTML</div>\n```'])assert.ok(parts('[Echo]'+marker).every(p=>!echo.hasEcho(p)),marker);
assert.ok(parts('[Echo][表情包:开心]随后文字').every(p=>!echo.hasEcho(p)));
assert.equal(parts('[Echo]').length,0);
assert.equal(echo.canUseEcho({content:'❤️🥺👨‍👩‍👧‍👦'}),true);
assert.equal(echo.hasEcho({content:'hi',isRetracted:true,mediaData:{screenEffect:'echo'}}),false);
assert.match(echo.echoHistoryText({content:'你好',mediaData:{screenEffect:'echo'}},'你好'),/求饶/);
assert.equal(echo.echoHistoryText({content:'hi',mediaType:'sticker',mediaData:{screenEffect:'echo'}},'hi'),'hi');
const stream=load('lib/stream-preview.ts',{'./text-tool-protocol':{stripTextToolDirectives:t=>t}});
assert.equal(stream.cleanStreamText('[Echo]爱你❤️'),'爱你❤️');assert.equal(stream.cleanStreamText('[Ech'),'');

// Execute the actual user send implementation, including quote/mention metadata and dice guard.
const room=ts.createSourceFile('room.tsx',fs.readFileSync(path.join(root,'components/chat/chat-room.tsx'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let handler;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(room)==='handleSendText')handler=n.initializer.getText(room);ts.forEachChild(n,visit)}visit(room);
let saved=[],rendered=[];
const context={...echo,...love,exports:{},ensureGroupSpeakPermission:()=>true,isGenerating:false,showChatToast(){},cancelFollowUp(){},session:{id:'s',isGroup:true,participantIds:['a']},quotingMessage:{id:'old',content:'quote'},loadChatMessages:()=>[{id:'old',content:'quote',role:'assistant'}],getQuotePreview:()=> 'quote',setQuotingMessage(){},isDiceOnlyMessage:t=>t==='🎲',rollChatDiceFace:()=>3,formatChatDiceResultMessage:()=> '3',pushChatMessage:m=>{const result={...m,id:'m'+saved.length,createdAt:new Date().toISOString()};saved.push(result);return result;},setMessages:fn=>{rendered=fn(rendered)},setPendingGenerate(){},triggerAIResponse(){},getChatPluginHookBus:()=>({hasHandlers:()=>false}),runChatPluginTransform(){}};
let publications=0;context.echo={published:()=>publications++};
vm.runInNewContext(ts.transpileModule('exports.send='+handler,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
assert.equal(context.exports.send('@A ❤️',{screenEffect:'echo',mentions:[{characterId:'a',name:'A'}]}),true);
assert.equal(saved[0].mediaData.screenEffect,'echo');assert.equal(saved[0].mediaData.quoteMessageId,'old');assert.equal(saved[0].mediaData.mentions[0].characterId,'a');
context.quotingMessage=null;context.exports.send('🎲',{screenEffect:'echo'});assert.equal(saved.at(-1).mediaType,undefined);assert.equal(saved.at(-1).mediaData.screenEffect,'echo');
context.isGenerating=true;assert.equal(context.exports.send('blocked',{screenEffect:'echo'}),false);assert.equal(publications,2);
let confirm;function findConfirm(n){if(ts.isVariableDeclaration(n)&&n.name.getText(room)==='sendEffectDraft')confirm=n.initializer.getText(room);ts.forEachChild(n,findConfirm)}findConfirm(room);assert.ok(confirm);
let confirms=0,clears=0;const confirmContext={exports:{},...echo,...love,inputLocked:false,isGenerating:false,inputText:'抱抱🥺',onSendText:(text,options)=>{assert.equal(text,'抱抱🥺');assert.equal(options.screenEffect,'echo');confirms++;return true;},setShowSendEffectPicker(){},setInputText:()=>clears++,resetTextareaHeight(){},onClosePanels(){}};
confirmContext.textareaRef={current:{blur(){}}};
vm.runInNewContext(ts.transpileModule('exports.confirm='+confirm,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,confirmContext);
confirmContext.inputLocked=true;confirmContext.exports.confirm('echo');assert.equal(confirms,0);
confirmContext.inputLocked=false;confirmContext.exports.confirm('echo');assert.equal(confirms,1);assert.equal(clears,1);
const groupSource=fs.readFileSync(path.join(root,'lib/group-chat-engine.ts'),'utf8');
const groupContext={exports:{},stripGroupFinancialActionsForMetadataRepair:t=>t};
vm.runInNewContext(ts.transpileModule(groupSource.match(/export function parseGroupChatResponse\([\s\S]*?\n\}/)[0],{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,groupContext);
const sections=groupContext.exports.parseGroupChatResponse('[甲]: [Echo]别跑🥺\n\n[乙]: 普通消息\n\n[乙]: [Echo]回来！',new Map([['甲','a'],['乙','b']]));
const effectActors=sections.flatMap(s=>parts(s.responseText).filter(echo.hasEcho).map(()=>s.characterId));assert.equal(effectActors.join(','),'a,b');

const read=(pkg,file)=>fs.readFileSync(path.join(path.dirname(require.resolve(pkg,{paths:[path.dirname(require.resolve('react-dom')),root]})),file),'utf8');
const modules={react:read('react','cjs/react.production.js'),'react/jsx-runtime':read('react','cjs/react-jsx-runtime.production.js'),'react-dom':read('react-dom','cjs/react-dom.production.js'),'react-dom/client':read('react-dom','cjs/react-dom-client.production.js'),scheduler:read('scheduler','cjs/scheduler.production.js'),'./echo-preview':compile('components/chat/echo-preview.tsx'),'./echo-playback':compile('components/chat/echo-playback.tsx'),'./love-playback':compile('components/chat/love-playback.tsx'),'./chat-echo':compile('lib/chat-echo.ts'),'@/lib/chat-echo':compile('lib/chat-echo.ts'),'@/lib/chat-love':compile('lib/chat-love.ts'),hook:compile('components/chat/use-chat-echo.tsx')};
modules['@/lib/chat-echo-layout']=compile('lib/chat-echo-layout.ts');
(async()=>{const browser=await require(process.env.PLAYWRIGHT_MODULE||'playwright').chromium.launch({headless:true,executablePath:process.env.CHAT_TEST_BROWSER});try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<style>*{box-sizing:border-box}body{margin:0}.chat-room-wrapper{position:relative;width:390px;height:844px;background:white}.chat-msg-wrapper{position:absolute;left:20px;top:350px}.chat-msg-wrapper[data-role=user]{left:auto;right:20px;top:660px}[data-msg-id]{padding:10px 14px;border-radius:20px;width:150px;color:white;background:var(--bubble-surface-color)}</style><div id="root"></div>');
 await page.addStyleTag({content:fs.readFileSync(path.join(root,'styles/imessage26.css'),'utf8')});
 await page.addScriptTag({content:`const sources=${JSON.stringify(modules)},cache={};function require(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;new Function('module','exports','require',sources[id])(m,m.exports,require);return m.exports;}
 const R=require('react'),app=require('react-dom/client').createRoot(document.getElementById('root'));window.msgs=[{id:'old',sessionId:'s',role:'user',content:'old',createdAt:'2020-01-01',mediaData:{screenEffect:'echo'}}];
 function Harness(){const root=R.useRef(null),[msgs,setMsgs]=R.useState(window.msgs),[enabled,setEnabled]=R.useState(true),[preview,setPreview]=R.useState(false);window.preview=setPreview;window.update=setMsgs;window.enable=setEnabled;const e=require('hook').useChatEcho(msgs,'s',root,enabled);window.replay=e.replay;window.publish=e.published;return R.createElement('div',{ref:root,className:'chat-room-wrapper','data-imessage-private':''},...msgs.map(m=>R.createElement('div',{key:m.id,className:'chat-msg-wrapper','data-role':m.role,'data-imessage-tail':''},R.createElement('div',{'data-msg-id':m.id,'data-media-type':'text',className:'chat-bubble-role-'+m.role,style:{'--bubble-surface-color':m.role==='user'?'#38acfc':'#a34883','--bubble-text-ink':'white','--bubble-surface-opacity':1}},R.createElement('span',{className:'imessage-bubble-surface'}),m.content))),preview?R.createElement('div',{className:'echo-preview'},'preview'):null,e.overlay)}app.render(R.createElement(Harness));`});
 await page.locator('[data-msg-id=old]').waitFor();assert.equal(await page.locator('.echo-live').count(),0);
 await page.evaluate(()=>{window.msgs.push({id:'new',sessionId:'s',role:'assistant',content:'别走🥺',createdAt:new Date().toISOString(),mediaData:{screenEffect:'echo'}});window.update([...window.msgs]);});
 await page.locator('.echo-live').waitFor();await page.waitForFunction(()=>document.querySelectorAll('.echo-live .echo-copy').length===144);
 const geometry=await page.locator('.echo-live-original').evaluate(el=>{const r=el.getBoundingClientRect(),source=document.querySelector('[data-msg-id=new]').getBoundingClientRect();return {dx:Math.abs(r.left-source.left),dy:Math.abs(r.top-source.top),color:getComputedStyle(el.querySelector('.imessage-bubble-surface')).backgroundColor,text:el.textContent};});
 assert.ok(geometry.dx<1&&geometry.dy<1);assert.equal(geometry.color,await page.locator('[data-msg-id=new] .imessage-bubble-surface').evaluate(el=>getComputedStyle(el).backgroundColor));assert.equal(geometry.text,'别走🥺');
 assert.equal(await page.locator('.echo-live [data-msg-id]').count(),0);
 await page.waitForTimeout(1200);
 const solid=await page.locator('.echo-copy .imessage-bubble-surface').first().evaluate(el=>{const normal=getComputedStyle(el).backgroundColor;document.querySelector('.chat-room-wrapper').setAttribute('data-glass-bubbles','');const glass=getComputedStyle(el).backgroundColor;const opacity=getComputedStyle(el).opacity;document.querySelector('.chat-room-wrapper').removeAttribute('data-glass-bubbles');return {normal,glass,opacity};});
 assert.ok(!solid.normal.includes('rgba')&&!solid.glass.includes(' / '),'normal and glass Echo surfaces have no background alpha');assert.equal(solid.opacity,'1');
 if(process.env.ECHO_LIVE_SCREENSHOT)await page.screenshot({path:process.env.ECHO_LIVE_SCREENSHOT});
 await page.evaluate(()=>{window.msgs.push({id:'next',sessionId:'s',role:'user',content:'爱你❤️',createdAt:new Date().toISOString(),mediaData:{screenEffect:'echo'}});window.update([...window.msgs]);});
 // Replacing the active source DOM and adding another Echo must not cut off/restart this one.
 const beforeTime=await page.locator('.echo-live .echo-copy').first().evaluate(el=>el.getAnimations()[0].currentTime);
 await page.evaluate(()=>{window.msgs=window.msgs.filter(m=>m.id!=='new');window.update([...window.msgs]);});
 await page.waitForTimeout(600);assert.equal(await page.locator('.echo-live-original').textContent(),'别走🥺');
 const afterTime=await page.locator('.echo-live .echo-copy').first().evaluate(el=>el.getAnimations()[0].currentTime);assert.ok(afterTime>beforeTime+400,'timeline continues without resetting');
 await page.waitForFunction(()=>document.querySelector('.echo-live-original')?.textContent==='爱你❤️',{},{timeout:7000});
 await page.getByRole('button',{name:'跳过特效'}).click();await page.locator('.echo-live').waitFor({state:'detached'});
 await page.evaluate(()=>window.update([...window.msgs]));assert.equal(await page.locator('.echo-live').count(),0);
 // Explicit publication survives a separate preview-unmount/message-render commit.
 await page.evaluate(()=>window.preview(true));await page.locator('.echo-preview').waitFor();
 await page.evaluate(()=>{window.sent={id:'confirmed',sessionId:'s',role:'user',content:'确认发送❤️',createdAt:'2020-01-01',mediaData:{screenEffect:'echo'}};window.publish(window.sent);});
 await page.waitForTimeout(100);assert.equal(await page.locator('.echo-live').count(),0);
 await page.evaluate(()=>{window.msgs.push(window.sent);window.update([...window.msgs]);});
 await page.locator('[data-msg-id=confirmed]').waitFor();assert.equal(await page.locator('.echo-live').count(),0);
 await page.evaluate(()=>window.preview(false));await page.locator('.echo-live').waitFor();
 assert.equal(await page.locator('.echo-live-original').textContent(),'确认发送❤️');
 await page.getByRole('button',{name:'跳过特效'}).click();await page.locator('.echo-live').waitFor({state:'detached'});
 await page.evaluate(()=>{const m={id:'long',sessionId:'s',role:'assistant',content:'这是很长的一段话。'.repeat(25),createdAt:new Date().toISOString(),mediaData:{screenEffect:'echo'}};window.msgs.push(m);window.update([...window.msgs]);});
 await page.locator('.echo-live').waitFor();await page.waitForTimeout(100);
 const longCount=await page.locator('.echo-live .echo-copy').count();assert.ok(longCount>=28&&longCount<80);
 if(process.env.ECHO_LONG_SCREENSHOT){await page.waitForTimeout(1200);await page.screenshot({path:process.env.ECHO_LONG_SCREENSHOT});}
 await page.getByRole('button',{name:'跳过特效'}).click();await page.locator('.echo-live').waitFor({state:'detached'});
 // A display-projected message can acquire its effect after its first render.
 await page.evaluate(()=>{window.msgs.push({id:'display-1',echoPlaybackKey:'batch-slot',sessionId:'s',role:'assistant',content:'第二句',createdAt:new Date().toISOString()});window.update([...window.msgs]);});
 await page.locator('[data-msg-id=display-1]').waitFor();
 await page.evaluate(()=>{window.msgs.at(-1).mediaData={screenEffect:'echo'};window.update([...window.msgs]);});
 await page.locator('.echo-live').waitFor();
 // Later replies still enter the underlying chat while this effect is running.
 await page.evaluate(()=>{window.msgs.push({id:'third',sessionId:'s',role:'assistant',content:'第三句继续输出',createdAt:new Date().toISOString()});window.update([...window.msgs]);});
 await page.locator('[data-msg-id=third]').waitFor();assert.equal(await page.locator('.echo-live').count(),1);
 await page.getByRole('button',{name:'跳过特效'}).click();await page.locator('.echo-live').waitFor({state:'detached'});
 // Resolving a synthetic display ID to a stored ID must not replay the same slot.
 await page.evaluate(()=>{window.msgs.find(m=>m.echoPlaybackKey==='batch-slot').id='stored-id';window.update([...window.msgs]);});
 await page.locator('[data-msg-id=stored-id]').waitFor();assert.equal(await page.locator('.echo-live').count(),0);
 await page.evaluate(()=>window.replay('old'));await page.locator('.echo-live').waitFor();await page.getByRole('button',{name:'跳过特效'}).click();
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.replay('old'));await page.waitForTimeout(150);assert.equal(await page.locator('.echo-live').count(),0);
 await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>window.replay('old'));await page.locator('.echo-live').waitFor();await page.evaluate(()=>window.enable(false));await page.locator('.echo-live').waitFor({state:'detached'});
 assert.deepEqual(errors,[]);console.log('PASS: Echo parser/emoji/attachments/quotes/history/stream; actual user send; measured assistant bubble styling; queue, replay, no history autoplay, reduced motion, navigation cleanup.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
