const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const readModule=(pkg,file)=>fs.readFileSync(path.join(path.dirname(require.resolve(pkg,{paths:[path.dirname(require.resolve('react-dom')),root]})),file),'utf8');
const modules={
 react:readModule('react','cjs/react.production.js'),
 'react-dom':readModule('react-dom','cjs/react-dom.production.js'),
 'react-dom/client':readModule('react-dom','cjs/react-dom-client.production.js'),
 scheduler:readModule('scheduler','cjs/scheduler.production.js'),
 '@/lib/character-storage':`exports.CHARACTERS_UPDATED_EVENT='chat-characters-updated';exports.loadCharacters=()=>window.characters;`,
 hook:ts.transpileModule(fs.readFileSync(path.join(root,'components/chat/use-chat-character.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
};
async function main(){
 const browser=await require(process.env.PLAYWRIGHT_MODULE||'playwright').chromium.launch({headless:true,executablePath:process.env.CHAT_TEST_BROWSER});
 try{
  const page=await browser.newPage();await page.setContent('<div id="root"></div>');
  await page.addScriptTag({content:`const sources=${JSON.stringify(modules)},cache={};function require(id){if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;new Function('module','exports','require',sources[id])(module,module.exports,require);return module.exports;}window.characters=[{id:'a',avatar:'old'},{id:'b',avatar:'other'}];const React=require('react'),{createRoot}=require('react-dom/client'),{useChatCharacter}=require('hook');function View({id}){const c=useChatCharacter(id);return React.createElement('img',{id:'avatar',src:c?.avatar||'empty'});}const app=createRoot(document.getElementById('root'));window.render=id=>app.render(React.createElement(View,{id}));window.update=avatar=>{window.characters=window.characters.map(c=>c.id==='a'?{...c,avatar}:c);dispatchEvent(new Event('chat-characters-updated'));};window.render('a');`});
  await page.waitForFunction(()=>document.querySelector('#avatar')?.getAttribute('src')==='old');
  for(const avatar of ['new','newer']){
   await page.evaluate(avatar=>window.update(avatar),avatar);
   await page.waitForFunction(avatar=>document.querySelector('#avatar')?.getAttribute('src')===avatar,avatar);
  }
  await page.evaluate(()=>window.render('b'));
  await page.waitForFunction(()=>document.querySelector('#avatar')?.getAttribute('src')==='other');
  await page.evaluate(()=>{window.update('latest');window.render('a');});
  await page.waitForFunction(()=>document.querySelector('#avatar')?.getAttribute('src')==='latest');
  assert.equal(await page.locator('#avatar').getAttribute('src'),'latest');
  console.log('PASS: actual React hook updates mounted avatar twice without navigation; character switch and return read latest stored avatar.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
