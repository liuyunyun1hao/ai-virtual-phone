// Production bridge/viewport/plugin modules; synthetic, same-origin realms, no account/model calls.
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict'),ts=require('typescript');
const {chromium,webkit}=require('playwright');
const names=['phone-session-protocol','phone-session-viewport','pwa-display-mode','chat-plugin-runtime'];
const sources=Object.fromEntries(names.map(name=>[name,ts.transpileModule(fs.readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText]));
async function main(){
 const server=http.createServer((_request,response)=>response.end('<!doctype html><html><head></head><body></body></html>'));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await(process.env.IDENTITY_TEST_BROWSER==='webkit'?webkit.launch({headless:true}):chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}));
 try{
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(()=>{
   const style=document.createElement('style');style.id='device-insets';style.textContent='body>div[style*="safe-area"]{padding:44px 0px 34px!important}';document.head.appendChild(style);
   const native=window.matchMedia.bind(window);window.matchMedia=query=>query==='(display-mode: standalone)'?{matches:true}:native(query);
   const frame=document.createElement('iframe');frame.dataset.phoneSession='fixture';frame.src='/inner';document.body.appendChild(frame);
  });
  const frame=await(await page.locator('iframe[data-phone-session]').elementHandle()).contentFrame();await frame.waitForLoadState();
  await frame.evaluate(sources=>{
   const modules={};window.mod=name=>{name=name.split('/').pop();if(modules[name])return modules[name];const exports=modules[name]={};new Function('exports','require',sources[name])(exports,window.mod);return exports};
   const style=document.createElement('style');style.textContent='#sample{padding-top:calc(env(safe-area-inset-top,0px) + 8px)!important;padding-bottom:env(safe-area-inset-bottom)}';document.head.appendChild(style);
   const sample=document.createElement('div');sample.id='sample';document.body.appendChild(sample);
   if(mod('pwa-display-mode').getRuntimePwaDisplayMode()!=='standalone')throw Error('PWA mode not inherited');
   window.cleanViewport=mod('phone-session-viewport').installPhoneSessionViewport();
  },sources);
  assert.equal(await frame.locator('#sample').evaluate(el=>getComputedStyle(el).paddingTop),'52px');
  assert.equal(await frame.locator('#sample').evaluate(el=>getComputedStyle(el).paddingBottom),'34px');
  await frame.evaluate(()=>{const s=document.createElement('style');s.textContent='@media(min-width:1px){#sample{margin-bottom:env(safe-area-inset-bottom,0px)}}';document.head.appendChild(s)});
  await frame.waitForFunction(()=>getComputedStyle(document.querySelector('#sample')).marginBottom==='34px');
  await page.evaluate(()=>{document.querySelector('#device-insets').textContent='body>div[style*="safe-area"]{padding:20px 0px 22px!important}';window.dispatchEvent(new Event('resize'))});
  assert.equal(await frame.locator('#sample').evaluate(el=>getComputedStyle(el).paddingTop),'28px');
  assert.equal(await frame.locator('#sample').evaluate(el=>getComputedStyle(el).marginBottom),'22px');
  await frame.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));window.cleanViewport()});
  assert.equal(await page.locator('body>div[style*="safe-area"]').count(),0,'Device probe leaked');
  // Late plugin setup must clean up after silence and never finish the retired startup.
  await page.evaluate(async source=>{
   let finishSetup,setupStarted=false,cleanups=0,removed=0;
   const kv=new Map(),stub={hydrateKvDb:async()=>{},hydrateChatStorage:async()=>{},hasActiveIdentity:()=>true,
    kvGet:key=>kv.get(key),kvSet:(key,value)=>kv.set(key,value),kvRemove:key=>kv.delete(key),
    loadChatPlugins:()=>[{enabled:true,manifest:{id:'fixture-plugin'},settings:{}}],CHAT_PLUGIN_API_VERSION:'1.0',
    recordChatPluginLog:()=>{},getChatPluginHookBus:()=>({removePlugin:()=>removed++,emitEvent:()=>{}}),
    loadChatPluginModule:async()=>({module:{manifest:{id:'fixture-plugin'},setup:async()=>{setupStarted=true;return new Promise(resolve=>finishSetup=()=>resolve(()=>cleanups++))}}})};
   const exports={};new Function('exports','require',source)(exports,()=>stub);
   const runtime=exports.getChatPluginRuntime(),start=runtime.ensureStarted();
   while(!setupStarted)await new Promise(resolve=>setTimeout(resolve,0));
   runtime.silence();finishSetup();await start;
   if(cleanups!==1||removed!==1||runtime.activePluginIds().length||runtime.isStarted())throw Error('Retired plugin startup survived');
  },sources['chat-plugin-runtime']);
  console.log('PASS: production phone-frame bridge inherits outer PWA mode; 44/34px and changed safe areas preserve calc/important/media/dynamic styles; cleanup removes probe; late plugin setup disposes without restarting.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(error=>{console.error(error);process.exitCode=1});
