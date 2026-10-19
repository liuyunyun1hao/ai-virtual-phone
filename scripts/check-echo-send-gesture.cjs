const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const read=(pkg,file)=>fs.readFileSync(path.join(path.dirname(require.resolve(pkg,{paths:[path.dirname(require.resolve('react-dom')),root]})),file),'utf8');
const modules={react:read('react','cjs/react.production.js'),'react/jsx-runtime':read('react','cjs/react-jsx-runtime.production.js'),'react-dom':read('react-dom','cjs/react-dom.production.js'),'react-dom/client':read('react-dom','cjs/react-dom-client.production.js'),scheduler:read('scheduler','cjs/scheduler.production.js'),gesture:ts.transpileModule(fs.readFileSync(path.join(root,'components/chat/use-echo-send-gesture.tsx'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText};
(async()=>{const browser=await require(process.env.PLAYWRIGHT_MODULE||'playwright').chromium.launch({headless:true,executablePath:process.env.CHAT_TEST_BROWSER});try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<style>body{margin:0}.chat-room-wrapper{position:relative;width:100vw;height:100vh}#send{position:absolute;bottom:50px;right:25px;width:48px;height:48px}</style><div id="root"></div>');
 await page.addStyleTag({content:fs.readFileSync(path.join(root,'styles/imessage26.css'),'utf8')});
 await page.addScriptTag({content:`const sources=${JSON.stringify(modules)},cache={};function require(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;new Function('module','exports','require',sources[id])(m,m.exports,require);return m.exports;}const R=require('react');window.sent=0;window.normal=0;function Harness(){const [ok,setOk]=R.useState(true);window.setOk=setOk;const g=require('gesture').useEchoSendGesture(ok,()=>window.sent++,()=>window.normal++);return R.createElement('div',{className:'chat-room-wrapper'},R.createElement('button',{id:'send',...g.handlers},'↑'),g.popup)}require('react-dom/client').createRoot(document.getElementById('root')).render(R.createElement(Harness));`});
 const send=page.locator('#send');await send.waitFor();
 const center=async locator=>{const b=await locator.boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};};
 const down=async()=>{const c=await center(send);await page.mouse.move(c.x,c.y);await page.mouse.down();return c;};
 const counts=async()=>page.evaluate(()=>[window.sent,window.normal]);
 await send.click();assert.deepEqual(await counts(),[0,1]);
 await down();await page.waitForTimeout(1800);assert.deepEqual(await counts(),[0,1]);
 await page.mouse.up();assert.deepEqual(await counts(),[0,2]);
 await down();await page.waitForTimeout(2150);assert.deepEqual(await counts(),[1,2]); // Sends before release.
 await page.waitForTimeout(2100);assert.deepEqual(await counts(),[1,2]); // No repeat while held.
 await page.mouse.up();assert.deepEqual(await counts(),[1,2]);
 assert.equal(await page.locator('.echo-send-target,.echo-preview').count(),0);
 for(const cancel of ['move','escape','pointercancel','ineligible','blur']){
   const c=await down();await page.waitForTimeout(100);
   if(cancel==='move')await page.mouse.move(c.x-26,c.y);
   if(cancel==='escape')await page.keyboard.press('Escape');
   if(cancel==='pointercancel')await send.dispatchEvent('pointercancel');
   if(cancel==='ineligible')await page.evaluate(()=>window.setOk(false));
   if(cancel==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
   await page.waitForTimeout(2050);await page.mouse.up();
   assert.deepEqual(await counts(),[1,2],cancel);
   await page.evaluate(()=>window.setOk(true));
 }
 await page.evaluate(()=>window.setOk(false));await down();await page.waitForTimeout(2100);assert.equal((await counts())[0],1);await page.mouse.up();
 await page.evaluate(()=>window.setOk(true));
 await send.click();assert.equal((await counts())[1],4);
 // Production clears the draft after sending: the subsequent click must stay consumed.
 await down();await page.waitForTimeout(2150);await page.evaluate(()=>window.setOk(false));await page.mouse.up();
 assert.deepEqual(await counts(),[2,4]);
 assert.deepEqual(errors,[]);console.log('PASS: 2-second hold sends immediately once; release does not resend; short press normal; move/Escape/cancel/blur/ineligible cancel; no icon or preview.');

}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
