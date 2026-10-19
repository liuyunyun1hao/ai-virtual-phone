const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const compile=file=>ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const helpers={exports:{}};vm.runInNewContext(compile('lib/group-mentions.ts'),helpers);
const {mentionQuery,rebaseMentions}=helpers.exports;
assert.equal(mentionQuery('email@host.com',14),null);
assert.equal(mentionQuery('你好 @',4).query,'');
assert.equal(mentionQuery('你好@',3).query,'');
assert.equal(mentionQuery('@霍绍庭',4).query,'霍绍庭');
assert.equal(mentionQuery('@A\n其他',6),null);
const token={characterId:'a',name:'A',start:0,end:2};
assert.equal(rebaseMentions('@A hi','@B hi',[token]).length,0);
assert.equal(rebaseMentions('@A hi','前 @A hi',[token])[0].start,2);
assert.equal(rebaseMentions('@A hi','@A hi!',[token])[0].characterId,'a');
const readModule=(pkg,file)=>fs.readFileSync(path.join(path.dirname(require.resolve(pkg,{paths:[path.dirname(require.resolve('react-dom')),root]})),file),'utf8');
const modules={react:readModule('react','cjs/react.production.js'),'react/jsx-runtime':readModule('react','cjs/react-jsx-runtime.production.js'),
 'react-dom':readModule('react-dom','cjs/react-dom.production.js'),'react-dom/client':readModule('react-dom','cjs/react-dom-client.production.js'),scheduler:readModule('scheduler','cjs/scheduler.production.js'),
 '@/lib/group-mentions':compile('lib/group-mentions.ts'),hook:compile('components/chat/use-group-mentions.tsx'),avatar:compile('components/chat/mention-avatar.tsx')};
async function main(){
 const browser=await require(process.env.PLAYWRIGHT_MODULE||'playwright').chromium.launch({headless:true,executablePath:process.env.CHAT_TEST_BROWSER});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<style>*{box-sizing:border-box}body{margin:0}.chat-input-bar{position:absolute;bottom:30px;left:20px;right:20px}textarea{width:100%}.group-mention-avatar{width:40px;height:40px;background:#ccc}</style><div id="root"></div>');
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'styles/imessage26.css'),'utf8')});
  await page.addScriptTag({content:`const sources=${JSON.stringify(modules)},cache={};function require(id){if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;new Function('module','exports','require',sources[id])(module,module.exports,require);return module.exports;}const React=require('react'),{createRoot}=require('react-dom/client'),{useGroupMentions}=require('hook'),{MentionAvatar}=require('avatar');
  const members=[{id:'alice',name:'Alice'},{id:'bob',name:'Bob'},{id:'bob2',name:'Bob'}];window.sent=[];window.pokes=0;
  function View(){const [text,setText]=React.useState(''),[enabled,setEnabled]=React.useState(true);const ref=React.useRef(null);const m=useGroupMentions(text,setText,ref,members,enabled);window.lock=()=>setEnabled(false);window.unlock=()=>setEnabled(true);window.clear=()=>setText('');return React.createElement('div',{'data-imessage-private':'','data-imessage-group':'',className:'chat-room-wrapper'},
   React.createElement('div',{className:'chat-msg-wrapper','data-role':'assistant','data-group-last':''},React.createElement('div',{className:'chat-msg-avatar'},React.createElement(MentionAvatar,{name:'Alice',onMention:()=>m.insert(members[0],false),onPoke:()=>window.pokes++},'A')),React.createElement('div',{className:'chat-bubble-role-assistant',id:'bubble'},'yes')),
   React.createElement('div',{className:'chat-input-bar'},m.panel,React.createElement('textarea',{ref,value:text,disabled:!enabled,onChange:e=>{m.change(e.target.value,e.target.selectionStart);setText(e.target.value)},onSelect:e=>m.select(e.currentTarget.selectionStart),onCompositionStart:()=>m.composition(true),onCompositionEnd:()=>m.composition(false),onKeyDown:e=>{if(m.keyDown(e))return;if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();window.sent.push({text,mentions:m.identities(text)});setText('')}}})));}createRoot(document.getElementById('root')).render(React.createElement(View));`});
  const input=page.locator('textarea'),avatar=page.getByRole('button',{name:/长按提及/});
  await input.fill('@');assert.equal(await page.getByRole('option').count(),3);
  await input.press('b');assert.equal(await page.getByRole('option').count(),2);
  await input.press('ArrowDown');await input.press('Enter');assert.equal(await input.inputValue(),'@Bob ');
  assert.equal(await page.evaluate(()=>window.sent.length),0,'Selecting does not send');
  await input.press('End');await input.pressSequentially('hi');assert.equal(await page.getByRole('listbox').count(),0,'Typing after a completed mention must not reopen candidates');
  await input.press('Enter');assert.equal((await page.evaluate(()=>window.sent[0])).mentions[0].characterId,'bob2');
  await input.fill('@Alice hi');await input.press('Escape');await input.press('Enter');
  assert.equal((await page.evaluate(()=>window.sent.at(-1))).mentions.length,0,'Cleared token cannot leak into a manually typed next message');
  await input.fill('email@host.com');assert.equal(await page.getByRole('listbox').count(),0);
  await input.fill('@xyz');assert.equal(await page.getByRole('option').count(),0);await input.press('Enter');assert.equal(await input.inputValue(),'@xyz');
  await input.fill('hello ');await input.press('End');
  const box=await avatar.boundingBox();await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();await page.waitForTimeout(500);await page.mouse.up();
  assert.equal(await input.inputValue(),'hello @Alice ');assert.equal(await page.evaluate(()=>window.pokes),0);
  await input.press('Enter');assert.equal((await page.evaluate(()=>window.sent.at(-1))).mentions[0].characterId,'alice');
  await avatar.dblclick();assert.equal(await page.evaluate(()=>window.pokes),1,'Double click poke preserved');
  await input.fill('');await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();await page.mouse.move(box.x+20,box.y+45);await page.waitForTimeout(500);await page.mouse.up();
  assert.equal(await input.inputValue(),'','Scrolling cancels hold');
  await page.evaluate(()=>window.lock());await avatar.press('Enter');assert.equal(await input.inputValue(),'','Locked input cannot be mentioned');await page.evaluate(()=>window.unlock());
  await input.fill('@');await input.dispatchEvent('compositionstart');assert.equal(await page.getByRole('listbox').count(),0);await input.dispatchEvent('compositionend');
  for(const width of [320,390,768]){
   await page.setViewportSize({width,height:844});
   const bounds=await page.getByRole('listbox').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width);
  }
  for(const scale of [1,1.3]){
   await page.locator('.chat-room-wrapper').evaluate((el,scale)=>el.style.setProperty('--app-text-scale',scale),scale);
   const dimensions=await page.evaluate(()=>({a:document.querySelector('.group-mention-avatar').getBoundingClientRect().height,b:document.querySelector('#bubble').getBoundingClientRect().height}));
   assert.ok(Math.abs(dimensions.a-dimensions.b)<1,JSON.stringify(dimensions));
  }
  assert.deepEqual(errors,[]);
  if(process.env.MENTION_SCREENSHOT) {
   await page.setViewportSize({width:390,height:844});
   await page.locator('.chat-room-wrapper').evaluate(el=>el.style.setProperty('--app-text-scale','1'));
   await page.screenshot({path:process.env.MENTION_SCREENSHOT});
  }
  console.log('PASS: mention query/edit identity; actual React candidate filtering, duplicate names, keyboard choice/no-send, reset, long press vs poke/scroll, lock/IME and responsive avatar/bubble sizes.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
