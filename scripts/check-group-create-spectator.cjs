const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const compile=f=>ts.transpileModule(read(f),{fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const pkg=(p,f)=>fs.readFileSync(path.join(path.dirname(require.resolve(p)),f),'utf8');
const sources={react:pkg('react','cjs/react.production.js'),'react/jsx-runtime':pkg('react','cjs/react-jsx-runtime.production.js'),'react-dom':pkg('react-dom','cjs/react-dom.production.js'),'react-dom/client':pkg('react-dom','cjs/react-dom-client.production.js'),scheduler:pkg('scheduler','cjs/scheduler.production.js'),modal:compile('components/chat/group-create-modal.tsx'),'@/components/ui/form':compile('components/ui/form.tsx'),
 '@/lib/chat-storage':`exports.loadChatContacts=()=>[{characterId:'a'},{characterId:'b'}];`,
 '@/lib/character-storage':`exports.loadCharacters=()=>[{id:'a',name:'Alpha'},{id:'b',name:'Beta'},{id:'npc',name:'Nonfriend'}];`,
 '@/lib/settings-storage':`exports.resolveUserIdentity=()=>({name:'Observer'});`,
 './chat-fallback-avatar':`exports.ChatFallbackAvatar=()=>null;`, './group-avatar':`exports.GroupAvatarPicker=()=>null;`};
(async()=>{const browser=await require(process.env.PLAYWRIGHT_MODULE||'playwright').chromium.launch({headless:true,executablePath:process.env.CHAT_TEST_BROWSER});try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<style>*{box-sizing:border-box}body{margin:0;font-family:Arial;--c-text:#171717;--c-icon:#777;--c-input:#eee;--c-success:#31885f}.w-full{width:100%}.flex{display:flex}.flex-col{flex-direction:column}.gap-2{gap:8px}</style><div class="imessage-list-page" id="root"></div>');
 for(const f of ['styles/components.css','styles/chat.css','styles/imessage26.css'])await page.addStyleTag({content:read(f)});
 await page.addScriptTag({content:`const sources=${JSON.stringify(sources)},cache={};function require(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;new Function('module','exports','require',sources[id])(m,m.exports,require);return m.exports}const React=require('react'),{createRoot}=require('react-dom/client'),{GroupCreateModal}=require('modal');window.created=[];createRoot(document.getElementById('root')).render(React.createElement(GroupCreateModal,{onClose:()=>{},onCreate:(...args)=>window.created.push(args)}));`});
 await page.getByText('Alpha',{exact:true}).waitFor();assert.equal(await page.getByText('Nonfriend',{exact:true}).count(),0);
 await page.getByRole('checkbox').check();await page.getByText(/^Nonfriend/).waitFor();
 await page.getByText('Alpha',{exact:true}).click();await page.getByText(/^Nonfriend/).click();await page.getByRole('button',{name:'下一步 (2 人)',exact:true}).click();
 await page.getByRole('textbox',{name:'群说明（仅 AI 可见）'}).fill('让他们自然聊到旅行计划');
 await page.screenshot({path:path.join(root,'tmp/group-create-spectator.png')});
 await page.getByRole('button',{name:'创建',exact:true}).click();const args=await page.evaluate(()=>window.created[0]);
 assert.equal(args[2],true);assert.deepEqual(args[1],['a','npc']);assert.equal(args[4],'让他们自然聊到旅行计划');
 // Switching back must remove nonfriends and prevent an invalid normal group.
 await page.getByRole('checkbox').uncheck();assert.equal(await page.getByRole('button',{name:'创建',exact:true}).isDisabled(),true);
 for(const width of [320,390,430]){await page.setViewportSize({width,height:844});const rect=await page.locator('textarea').boundingBox();assert(rect.x>=0&&rect.x+rect.width<=width);}
 assert.deepEqual(errors,[]);console.log('PASS: ordinary friends-only, spectator selects nonfriend, notes reach create callback, mode-switch prunes nonfriends, responsive textarea 320/390/430. Isolated React/data; no storage writes/API.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
