const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const compile=f=>ts.transpileModule(read(f),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function load(file,mocks={}){const exports={};vm.runInNewContext(compile(file),{exports,require:id=>{if(!(id in mocks))throw Error(file+': '+id);return mocks[id]}});return exports;}
const echo=load('lib/chat-echo.ts'),love=load('lib/chat-love.ts',{'./chat-echo':echo}),fireworks=load('lib/chat-fireworks.ts',{'./chat-echo':echo});
const parser=load('lib/rich-message-parser.ts',{
 './chat-echo':echo,'./chat-love':love,
 './state-value-parser':load('lib/state-value-parser.ts'),'./image-grid-split':{isImageGridCount:n=>n>=2&&n<=20},
 './photo-doodle':{parsePhotoDoodle:()=>null},'./action-parser':{stripActionShells:t=>t},'./text-tool-protocol':{stripTextToolDirectives:t=>t},
 './custom-app-chat-directives':{loadCustomAppChatDirectives:()=>[],formatCustomAppDirectiveSummary:()=>'',getCustomAppDirectiveSyntaxHead:()=>'',splitCustomAppDirectiveArgs:()=>[]},
});
const parts=t=>parser.parseAIResponse(t,[]).parts;
for(const name of ['Echo','Love','Fireworks']){
 assert.equal(parts(`[${name}]喜欢此刻`)[0].mediaData.screenEffect,name.toLowerCase());
 for(const media of ['[照片:天空]','[语音条:你好]','<div>HTML</div>'])assert.ok(parts(`[${name}]${media}`).every(p=>!p.mediaData?.screenEffect));
}
assert.equal(parts('[Fireworks]庆祝\n\n[Love]爱你\n\n[Echo]哈哈哈').filter(p=>p.mediaData?.screenEffect).length,1);
assert.match(fireworks.fireworksHistoryText({content:'庆祝',mediaData:{screenEffect:'fireworks'}},'庆祝'),/烟花全屏/);
const stream=load('lib/stream-preview.ts',{'./text-tool-protocol':{stripTextToolDirectives:t=>t}});
for(const name of ['Echo','Love','Fireworks']){assert.equal(stream.cleanStreamText(`[${name}]文字`),'文字');for(let i=1;i<=name.length;i++)assert.equal(stream.cleanStreamText('['+name.slice(0,i)),'');}
for(const file of ['lib/chat-engine.ts','lib/group-chat-engine.ts'])assert.match(read(file),/buildFireworksPrompt\(\)/);
assert.match(read('lib/chat-engine.ts'),/readLatestEffectScene\(session.id\)/);
const room=read('components/chat/chat-room.tsx'),picker=room.slice(room.indexOf('aria-label="选择发送特效"'),room.indexOf('aria-label="选择发送特效"')+700);
assert.match(picker,/\['fireworks', '烟花'\]/);assert.doesNotMatch(picker,/<svg|IconGlyph|send-effect-symbol/);
const pkg=(p,file)=>fs.readFileSync(path.join(path.dirname(require.resolve(p,{paths:[path.dirname(require.resolve('react-dom')),root]})),file),'utf8');
const modules={react:pkg('react','cjs/react.production.js'),'react/jsx-runtime':pkg('react','cjs/react-jsx-runtime.production.js'),'react-dom':pkg('react-dom','cjs/react-dom.production.js'),'react-dom/client':pkg('react-dom','cjs/react-dom-client.production.js'),scheduler:pkg('scheduler','cjs/scheduler.production.js')};
for(const name of ['capture','scene-memory','echo-renderer','love-renderer','fireworks-renderer'])modules['@/lib/message-effects/'+name]=compile('lib/message-effects/'+name+(name.endsWith('renderer')?'.js':'.ts'));
for(const name of ['echo','love','fireworks'])modules['@/lib/chat-'+name]=compile('lib/chat-'+name+'.ts');
modules['./chat-echo']=modules['@/lib/chat-echo'];modules['./message-effect-playback']=compile('components/chat/message-effect-playback.tsx');modules.hook=compile('components/chat/use-chat-echo.tsx');
modules['../chat-storage']='exports.loadChatMessages=id=>window.records.filter(m=>m.sessionId===id);exports.updateMessageMediaData=(id,data)=>{window.records.find(m=>m.id===id).mediaData=data;window.saved.push(data.screenEffectScene)}';
modules['../chat-asset-storage']='exports.saveChatImageToIndexedDB=async blob=>{const url=await new Promise(r=>{const reader=new FileReader();reader.onload=()=>r(reader.result);reader.readAsDataURL(blob)});window.assets.push(url);return String(window.assets.length-1)};exports.getChatImageFromIndexedDB=async id=>window.assets[+id]';
function exportedFunction(file,name,globals){
 const source=read(file),ast=ts.createSourceFile(file,source,ts.ScriptTarget.ES2022,true);
 const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(node);
 const exports={};vm.runInNewContext(ts.transpileModule(node.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,...globals});return exports[name];
}
(async()=>{
 let sceneReads=0;
 const append=exportedFunction('lib/chat-engine.ts','appendCurrentChatBackgroundContext',{
  CHAT_BACKGROUND_SNAPSHOT_KEY:'test',kvGet:()=>null,kvSet:()=>{},isMediaStoreRef:()=>false,getChatImageFromIndexedDB:async()=>null,resolveCompressedImageDataUrl:async x=>x,
  readLatestEffectScene:async()=>{sceneReads++;return {messageId:'scene-message',url:'data:image/jpeg;base64,TEST',scene:{effect:'fireworks',phase:5500,capturedAt:'2026-09-28',partial:true}}},
 });
 let prompt=[];await append(prompt,{id:'s',backgroundImage:'data:image/png;base64,BACKGROUND'},false);assert.equal(sceneReads,0);assert.ok(prompt.every(m=>typeof m.content==='string'),'vision disabled does not attach image content');
 prompt=[];await append(prompt,{id:'s',backgroundImage:'data:image/png;base64,BACKGROUND'},true);assert.equal(sceneReads,1);assert.equal(prompt.filter(m=>Array.isArray(m.content)).length,2,'scene and current wallpaper remain distinct');assert.match(prompt[0].content[0].text,/缺失部分不要猜测/);assert.match(prompt[0].content[0].text,/并非逐像素截图/);
 const groupParse=exportedFunction('lib/group-chat-engine.ts','parseGroupChatResponse',{}),group=groupParse('[甲]: [Love]爱你\n[乙]: [Fireworks]庆祝',new Map([['甲','a'],['乙','b']]));
 assert.equal(parts(group[0].responseText)[0].mediaData.screenEffect,'love');assert.equal(parts(group[1].responseText)[0].mediaData.screenEffect,'fireworks');
 const browser=await require(process.env.PLAYWRIGHT_MODULE||'playwright').chromium.launch({headless:true,executablePath:process.env.CHAT_TEST_BROWSER});try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<style>*{box-sizing:border-box}body{margin:0}.chat-room-wrapper{position:relative;width:390px;height:844px;overflow:hidden;background:#153953}.chat-msg-wrapper{position:absolute;left:20px;right:20px}[data-msg-id]{padding:10px 14px;border-radius:20px;width:max-content;max-width:290px;font:18px sans-serif;color:white;background:#3a596d}.page-header{position:absolute;top:30px;left:20px;right:20px;display:flex;justify-content:space-between}.imessage-header-button{width:44px;height:44px;border:0;border-radius:50%;color:white;background:#127adc}.imessage-contact-name{color:white;padding:12px}</style><div id="root"></div>');
 await page.addStyleTag({content:read('styles/imessage26.css')});
 await page.addScriptTag({content:`const sources=${JSON.stringify(modules)},cache={};function require(id){if(cache[id])return cache[id].exports;if(!sources[id])throw Error('Missing '+id);const m={exports:{}};cache[id]=m;new Function('module','exports','require',sources[id])(m,m.exports,require);return m.exports;}window.records=[];window.saved=[];window.assets=[];const R=require('react'),app=require('react-dom/client').createRoot(document.getElementById('root'));function Harness(){const root=R.useRef(null),[msgs,setMsgs]=R.useState([]),[enabled,setEnabled]=R.useState(true);window.update=m=>{window.records=m;setMsgs(m)};window.toggle=setEnabled;const fx=require('hook').useChatEcho(msgs,'s',root,enabled);window.replay=fx.replay;return R.createElement('div',{ref:root,className:'chat-room-wrapper','data-imessage-private':''},R.createElement('header',{className:'page-header'},R.createElement('button',{className:'imessage-header-button'},'‹'),R.createElement('span',{className:'imessage-contact-name'},'一起看烟花'),R.createElement('button',{className:'imessage-header-button'},'▣')),...msgs.map((m,i)=>R.createElement('div',{key:m.id,className:'chat-msg-wrapper','data-role':m.role,style:{top:(400+i*65)+'px',textAlign:m.role==='user'?'right':'left'}},R.createElement('div',{'data-msg-id':m.id,style:{marginLeft:m.role==='user'?'auto':0}},m.content))),fx.overlay)}app.render(R.createElement(Harness));`});
 await page.waitForFunction(()=>window.update);
 const sceneCheck=await page.evaluate(async()=>{
  const room=document.querySelector('.chat-room-wrapper');
  room.style.backgroundImage='url("data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844"><path fill="#123456" d="M0 0h390v844H0z"/><circle cx="190" cy="250" r="10" fill="#ffffff"/></svg>')+'")';
  const capture=await require('@/lib/message-effects/capture').captureEffectRoom(room),ctx=capture.scene.getContext('2d'),pixel=Array.from(ctx.getImageData(10,10,1,1).data);
  return {pixel,partial:capture.partial};
 });
 assert.deepEqual(sceneCheck.pixel,[18,52,86,255],'the scene includes the actual wallpaper, not a blank particle background');assert.equal(sceneCheck.partial,false);
 await page.evaluate(()=>window.update([{id:'old',sessionId:'s',role:'assistant',content:'以前的烟花',createdAt:'2020-01-01',mediaData:{screenEffect:'fireworks'}}]));await page.waitForTimeout(200);assert.equal(await page.locator('.message-effect-live').count(),0,'history does not autoplay');
 await page.evaluate(()=>window.update(['echo','love','fireworks'].map((kind,i)=>({id:kind,sessionId:'s',role:i===1?'assistant':'user',content:i===0?'今天也要一起去看漫天绽放的烟花':'喜欢此刻',createdAt:new Date().toISOString(),mediaData:{screenEffect:kind}}))));
 for(const kind of ['echo','love','fireworks']){
  await page.locator('[data-effect='+kind+']').waitFor();await page.waitForFunction(k=>window.saved.some(s=>s?.effect===k),kind,{timeout:20000});
  assert.equal(await page.locator('.message-effect-live').count(),1);
  const nonempty=await page.locator('.message-effect-live canvas').evaluate(c=>c.width>300&&c.height>600);assert.ok(nonempty);
  await page.waitForTimeout(kind==='fireworks'?5400:1200);
  if(process.env.EFFECT_QA_DIR){fs.mkdirSync(process.env.EFFECT_QA_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.EFFECT_QA_DIR,kind+'.png')});}
  if(kind==='fireworks')await page.locator('[data-effect=fireworks]').waitFor({state:'detached',timeout:12000});else await page.getByRole('button',{name:'跳过特效'}).click();
 }
 assert.equal(await page.evaluate(()=>window.saved.length),3,'each effect persists one composite scene');
 assert.ok(await page.evaluate(()=>window.assets.every(a=>a.startsWith('data:image/jpeg'))));
 assert.equal(await page.evaluate(async()=>{const saved=await require('@/lib/message-effects/scene-memory').readLatestEffectScene('s');return saved?.scene.effect}),'fireworks');
 assert.equal(await page.evaluate(async()=>await require('@/lib/message-effects/scene-memory').readLatestEffectScene('other')),null,'snapshots never cross sessions');
 await page.evaluate(()=>window.replay('love'));await page.locator('[data-effect=love]').waitFor();await page.evaluate(()=>window.toggle(false));await page.locator('.message-effect-live').waitFor({state:'detached'});
 await page.evaluate(()=>window.toggle(true));await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.replay('echo'));await page.waitForTimeout(300);assert.equal(await page.locator('.message-effect-live').count(),0);
 await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:320,height:740});
 await page.evaluate(()=>{document.querySelector('.chat-room-wrapper').style.width='320px';window.replay('fireworks')});await page.locator('[data-effect=fireworks]').waitFor();
 assert.equal(await page.locator('.message-effect-live').evaluate(e=>e.getBoundingClientRect().width),320);await page.getByRole('button',{name:'跳过特效'}).click();
 assert.equal(await page.evaluate(()=>window.saved.length),3,'replay does not duplicate stored scenes');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,protocols:3,queue:true,sceneSnapshots:3,actualWallpaper:true,sessionIsolation:true,history:true,reducedMotion:true,narrowScreen:true,browserErrors:errors}));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
