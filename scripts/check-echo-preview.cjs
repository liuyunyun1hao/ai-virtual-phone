const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
// Retained visual regression harness; production now uses the drag-to-send gesture.
const read=(pkg,file)=>fs.readFileSync(path.join(path.dirname(require.resolve(pkg,{paths:[path.dirname(require.resolve('react-dom')),root]})),file),'utf8');
const modules={react:read('react','cjs/react.production.js'),'react/jsx-runtime':read('react','cjs/react-jsx-runtime.production.js'),'react-dom':read('react-dom','cjs/react-dom.production.js'),'react-dom/client':read('react-dom','cjs/react-dom-client.production.js'),scheduler:read('scheduler','cjs/scheduler.production.js'),echo:ts.transpileModule(fs.readFileSync(path.join(root,'components/chat/echo-preview.tsx'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText};
modules['@/lib/chat-echo-layout']=ts.transpileModule(fs.readFileSync(path.join(root,'lib/chat-echo-layout.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
(async()=>{const browser=await require(process.env.PLAYWRIGHT_MODULE||'playwright').chromium.launch({headless:true,executablePath:process.env.CHAT_TEST_BROWSER});try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<style>*{box-sizing:border-box}body{margin:0}.chat-room-wrapper{position:relative;width:100vw;height:100dvh}</style><div id="root" class="chat-room-wrapper" data-imessage-private></div>');
 await page.addStyleTag({content:fs.readFileSync(path.join(root,'styles/imessage26.css'),'utf8')});
 await page.addScriptTag({content:`const sources=${JSON.stringify(modules)},cache={};function require(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;new Function('module','exports','require',sources[id])(m,m.exports,require);return m.exports;}const React=require('react'),app=require('react-dom/client').createRoot(document.getElementById('root'));window.echoCloseCount=0;window.echoSendCount=0;window.render=text=>app.render(React.createElement(require('echo').EchoPreview,{text,bubbleStyle:{'--bubble-surface-color':'#38acfc','--bubble-text-ink':'#ffffff','--bubble-surface-opacity':1},onSend:()=>window.echoSendCount++,onClose:()=>{window.echoCloseCount++;app.unmount();}}));window.render('I love this!');`});
 await page.getByRole('dialog').waitFor();assert.equal(await page.locator('.echo-copy').count(),144);
 await page.waitForFunction(()=>document.querySelector('.echo-copy').getAnimations().length>0);
 const anchor=await page.locator('.echo-original').evaluate(el=>{
   const r=el.getBoundingClientRect(),field=el.parentElement.querySelector('.echo-field').getBoundingClientRect();
   const frames=el.parentElement.querySelector('.echo-copy').getAnimations()[0].effect.getKeyframes();
   const xy=f=>f.transform.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/).slice(1).map(Number);
   return {x:r.left+r.width/2-field.left,y:r.top+r.height/2-field.top,height:field.height,width:field.width,start:xy(frames[0]),end:xy(frames.at(-1))};
 });
 assert.ok(anchor.y>anchor.height*.7 && anchor.x>anchor.width*.5,'preview source is lower right');
 for(const point of [anchor.start,anchor.end])assert.ok(Math.hypot(point[0]-anchor.x,point[1]-anchor.y)<.1,'burst and return use measured source bubble');
 const trajectory=await page.evaluate(()=>{
   const frames=require('echo').echoOrbitFrames(7,390,844,{x:320,y:75});
   const position=f=>f.transform.match(/translate3d\(([-\d.]+)px,([-\d.]+)px/).slice(1).map(Number);
   return {start:position(frames[0]),end:position(frames.at(-1)),travel:Math.max(...frames.map(f=>{const [x,y]=position(f);return Math.hypot(x-320,y-75)})),endOpacity:frames.at(-1).opacity,
     depth:new Set(frames.map(f=>f.zIndex)).size,readable:frames.every(f=>!f.transform.includes('rotate'))};
 });
 assert.deepEqual(trajectory.start,[320,75]);assert.deepEqual(trajectory.end,[320,75]);assert.equal(trajectory.endOpacity,0);
 assert.ok(trajectory.travel>100);assert.ok(trajectory.depth>20);assert.ok(trajectory.readable);
 await page.waitForTimeout(1500);assert.ok(await page.locator('.echo-copy').evaluateAll(nodes=>nodes.filter(n=>Number(getComputedStyle(n).opacity)>.5).length)>125);
 const sizes=await page.locator('.echo-copy').evaluateAll(nodes=>nodes.map(n=>new DOMMatrixReadOnly(getComputedStyle(n).transform).a));
 assert.ok(sizes.filter(s=>s<.45).length>=20,'many small background echoes');
 assert.ok(sizes.filter(s=>s>1.25).length>=6,'large foreground echoes');
 assert.ok(Math.max(...sizes)/Math.min(...sizes)>8,'visibly distinct size bands');
 if(process.env.ECHO_SCREENSHOT)await page.screenshot({path:process.env.ECHO_SCREENSHOT});
 assert.ok(await page.locator('.echo-dimmer').evaluate(el=>Number(getComputedStyle(el).opacity))>.3);
 await page.waitForTimeout(3800);assert.equal(await page.locator('.echo-copy').evaluateAll(nodes=>nodes.every(n=>Number(getComputedStyle(n).opacity)===0)),true);
 assert.equal(await page.locator('.echo-dimmer').evaluate(el=>Number(getComputedStyle(el).opacity)),0);
 assert.ok(await page.locator('.echo-original').isVisible());
 if(process.env.ECHO_SCREENSHOT){
   for(const time of [100,800,2300,3800,4500,4800]){
     await page.locator('.echo-field').evaluate((el,t)=>{el.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=t});const dim=el.parentElement.querySelector('.echo-dimmer');dim.getAnimations().forEach(a=>{a.pause();a.currentTime=t});},time);
     await page.screenshot({path:process.env.ECHO_SCREENSHOT.replace('.png',`-${time}.png`)});
   }
 }
 assert.equal(await page.getByRole('button').count(),1);assert.equal(await page.getByRole('button',{name:'发送',exact:true}).count(),1);
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.echo-copy').first().evaluate(el=>getComputedStyle(el).animationName),'none');
 assert.equal(await page.locator('.echo-field').evaluate(el=>el.getAnimations({subtree:true}).length),0);
 await page.getByRole('button',{name:'发送',exact:true}).click();assert.equal(await page.evaluate(()=>window.echoSendCount),1);assert.equal(await page.evaluate(()=>window.echoCloseCount),0);
 await page.mouse.click(200,350);assert.equal(await page.locator('[role=dialog]').count(),0);assert.equal(await page.evaluate(()=>window.echoCloseCount),1);assert.equal(await page.evaluate(()=>window.echoSendCount),1);assert.deepEqual(errors,[]);
 console.log('PASS: long/short/empty/move guards; measured origin, density/fade/reduced motion; single Send button and backdrop dismissal without an extra send.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
