// Isolated browser fixture: real styles, no access to user chats/localStorage or paid APIs.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const root=path.resolve(__dirname,'..');
const playwright=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
async function main(){
 const css=['styles/components.css','styles/chat.css','styles/imessage26.css','styles/chat-settings.css'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n');
 const context={exports:{},require:name=>name==='react'?React:name==='react/jsx-runtime'?require(name):name==='react-dom'?require(name):{
   normalizeGroupTapbacks:r=>Array.isArray(r)?r:[],getTapbackGlyph:v=>v,getTapbackLabel:()=> '回应',
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'components/chat/imessage-tapback-badge.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 const reactions=['❤️','😂','🥹','👍'].map((emoji,i)=>({actorId:i===0?'self':`c${i}`,actorName:'成员'+i,emoji}));
 const reactionStyleForActor=id=>({'--im26-tapback-fill':id==='self'?'rgb(20, 120, 220)':'rgb(220, 120, 40)','--im26-tapback-glyph':'rgb(255, 255, 255)'});
 const badge=renderToStaticMarkup(React.createElement(context.exports.IMessageTapbackBadge,{reactions,reactionStyleForActor}));
 const single=renderToStaticMarkup(React.createElement(context.exports.IMessageTapbackBadge,{tapback:'😘',tapbackBy:'assistant',reactionStyleForActor}));
 const groupSingle=renderToStaticMarkup(React.createElement(context.exports.IMessageTapbackBadge,{reactions:reactions.slice(0,1)}));
 assert.match(badge,/--im26-tapback-fill:rgb\(20, 120, 220\)/,'user reaction uses user bubble color');
 assert.match(badge,/--im26-tapback-fill:rgb\(220, 120, 40\)/,'character reaction uses that actor bubble color');
 assert.match(single,/data-tapback-by="assistant"/,'private reaction records initiating side');
 const unreadContext={exports:{},require:name=>name==='react'?{...React,useState:()=>[12,()=>{}],useRef:()=>({current:null}),useEffect:()=>{},useId:()=> 'unread-test'}:name==='react/jsx-runtime'?require(name):name==='lucide-react'?require(name):{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'components/chat/chat-unread-pill.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,unreadContext);
 const unread=renderToStaticMarkup(React.createElement(unreadContext.exports.ChatUnreadPill,{sessionId:'fixture',onBack:()=>{}}));
 const browser=await playwright.chromium.launch({headless:true,...(process.env.CHAT_TEST_BROWSER ? {executablePath:process.env.CHAT_TEST_BROWSER} : {})});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 for(const glass of [false,true]) for(const dark of [false,true]){
  await page.emulateMedia({colorScheme:dark?'dark':'light'});
  await page.setContent(`<style>${css}</style><div class="chat-room-wrapper" data-imessage-private ${dark?'data-chat-dark':''} ${glass?'data-glass-bubbles data-has-bg-image':''}>
   ${unread}
   <div class="chat-plus-menu"><button class="chat-plus-menu-item"><span class="chat-plus-menu-label">礼物</span></button></div>
   <div class="imessage-context-index"><div class="imessage-context-actions"><button class="ctx-menu-btn">复制</button><button class="ctx-menu-btn ctx-menu-btn-danger">删除</button></div></div>
   <div class="chat-floating-ctx-menu" data-imessage-tapback-menu><div class="imessage-context-actions"><button class="ctx-menu-btn">转文字</button></div></div>
   <div class="chat-bubble-role-user" style="position:relative;width:200px;height:80px;margin:200px 40px">消息${badge}</div>
   <div class="chat-bubble-role-assistant single-test" style="position:relative;width:200px;height:80px">私聊${single}</div>
   <div class="chat-bubble-role-assistant group-single-test" style="position:relative;width:200px;height:80px">群聊单人${groupSingle}</div>
   <section class="group-tapback-detail"><header>回应</header></section>
   <div class="imessage-settings-page"><div class="page-shell"><header class="page-header"><button class="page-back-btn">返回</button></header><div class="page-body"><textarea class="ui-textarea">CSS</textarea><div class="modal-dialog">确认</div></div></div></div>
  </div>`);
  const colors=await page.evaluate(()=>Object.fromEntries(['.chat-plus-menu','.chat-plus-menu-label','.imessage-context-index .ctx-menu-btn','.chat-floating-ctx-menu .ctx-menu-btn','.group-tapback-detail','.imessage-settings-page','.ui-textarea','.modal-dialog','.page-header'].map(s=>{const c=getComputedStyle(document.querySelector(s));return [s,{color:c.color,bg:c.backgroundColor,filter:c.backdropFilter}]})));
  for(const selector of ['.chat-plus-menu-label','.imessage-context-index .ctx-menu-btn','.chat-floating-ctx-menu .ctx-menu-btn','.group-tapback-detail']){
   const channels=colors[selector].color.match(/\d+/g).slice(0,3).map(Number);
   const expectsLight=dark||(glass&&selector!=='.group-tapback-detail');
   assert.ok(expectsLight?channels.every(v=>v>200):channels.every(v=>v<80),`${selector} wrong ${glass?'glass':'flat'} ${dark?'night':'day'} text: ${colors[selector].color}`);
  }
  assert.equal(colors['.page-header'].bg,'rgba(0, 0, 0, 0)');
  assert.equal(colors['.page-header'].filter,'none');
  if(dark){assert.equal(colors['.imessage-settings-page'].bg,'rgb(0, 0, 0)');assert.equal(colors['.ui-textarea'].bg,'rgb(48, 48, 52)');assert.equal(colors['.modal-dialog'].bg,'rgb(28, 28, 30)');}
  assert.equal(await page.locator('.chat-unread-day, .chat-unread-night').count(),0);
  assert.equal(await page.locator('.chat-unread-pill mask').count(),1,'Both themes use knockout digits');
  assert.equal(await page.locator('.chat-unread-pill').evaluate(el=>getComputedStyle(el).color===getComputedStyle(el.closest('button')).color),true,'Badge follows the back arrow');
  const plusShadow=await page.locator('.chat-plus-menu').evaluate(el=>getComputedStyle(el).boxShadow);
  if(dark&&!glass) assert.ok(plusShadow.includes('0.12'),'Night menu highlight follows the subdued glass token');
  if(glass) assert.notEqual(plusShadow,'none','Glass menu keeps its dedicated surface depth');
  assert.equal(await page.locator('.group-tapback-layer').count(),4);
  assert.equal(await page.locator('.group-tapback-layer svg path').count(),2,'Only the front reaction carries the shared private tail');
  assert.equal(await page.locator('.group-tapback-layer svg path').first().getAttribute('d'),await page.locator('.single-test svg path').getAttribute('d'));
  for(const selector of ['.group-tapback-layer','.single-test .imessage-tapback-badge']){
   const size=await page.locator(selector).first().evaluate(el=>({w:parseFloat(getComputedStyle(el).width),h:parseFloat(getComputedStyle(el).height)}));
   assert.ok(Math.abs(size.w-28.6)<.02 && Math.abs(size.h-33.8)<.02);
  }
  const layout=await page.locator('.group-tapback-stack').first().evaluate(el=>{
   const layers=Array.from(el.querySelectorAll('.group-tapback-layer')).map(n=>n.getBoundingClientRect());
   const bubble=el.parentElement.getBoundingClientRect();
   const z=Array.from(el.querySelectorAll('.group-tapback-layer')).map(n=>Number(getComputedStyle(n).zIndex));
   return {overlap:layers.every((r,i)=>!i||(r.left>layers[i-1].left && r.left<layers[i-1].right)),frontOnTop:z[0]>z[1]&&z[1]>z[2],attached:layers[0].top<bubble.top&&layers[0].bottom>bubble.top};
  });
  assert.deepEqual(layout,{overlap:true,frontOnTop:true,attached:true});
  const singleGeometry=await page.locator('.single-test .imessage-tapback-badge,.group-single-test .imessage-tapback-badge').evaluateAll(els=>els.map(el=>{const s=getComputedStyle(el);return [s.width,s.height,s.top,s.right,el.querySelector('svg').innerHTML]}));
  assert.deepEqual(singleGeometry[0],singleGeometry[1],'Private and group single reactions must have identical geometry and silhouette');
  assert.equal(await page.locator('.group-tapback-overflow').textContent(),'+1');
  assert.equal(await page.locator('.group-tapback-stack').first().evaluate(el=>getComputedStyle(el).pointerEvents),'auto');
  assert.equal(await page.locator('.group-tapback-stack').first().getAttribute('aria-label'),'4 人回应，查看详情');
  await page.locator('.group-tapback-stack').first().evaluate(el=>{Object.assign(el.parentElement.style,{width:'30px',minWidth:'0',padding:'0',boxSizing:'border-box'});});
  const clipped=await page.locator('.group-tapback-stack').first().evaluate(el=>({width:el.getBoundingClientRect().width,clip:getComputedStyle(el.querySelector('.group-tapback-visuals')).overflow}));
  assert.ok(clipped.width<=30 && clipped.clip==='hidden',`Short bubbles cap the visible stack without dropping reaction data: ${JSON.stringify(clipped)}`);
 }
 console.log('PASS: flat day/night and glass menu text stay independent; reaction menus, settings subpages and four-person badge stack render.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
