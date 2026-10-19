const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const read=f=>fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n'),compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const cadence={};vm.runInNewContext(compile(read('lib/chat-cadence.ts')),{exports:cadence});
const instruction=cadence.ONLINE_CHAT_CADENCE_INSTRUCTION;
for(const phrase of ['边界处不要留下逗号','句内逗号正常使用','角色人设明确','告白','一个较长气泡','英文等其他语言','原文|对应中文译文'])assert.ok(instruction.includes(phrase));
const single=read('lib/chat-engine.ts'),at=single.indexOf('    if (resolvedAppId === "chat" && !session.isGroup && !isOfflineMode && !promptProfile) {\n');
assert.ok(at>=0);const fragment=single.slice(at,single.indexOf('    appendEmptyGenerateGuardMessage(llmMessages, config, historyForPrompt);',at));
for(const [app,group,offline,profile,expected] of [['chat',false,false,null,1],['chat',false,true,null,0],['custom',false,false,null,0],['chat',false,false,{},0],['chat',true,false,null,0]]) {
 const llmMessages=[];vm.runInNewContext(compile(fragment),{llmMessages,resolvedAppId:app,session:{isGroup:group},isOfflineMode:offline,promptProfile:profile,ONLINE_CHAT_CADENCE_INSTRUCTION:instruction});assert.equal(llmMessages.length,expected);if(expected)assert.equal(llmMessages[0].role,'system');
}
const notes={};vm.runInNewContext(compile(read('lib/group-director-note.ts')),{exports:notes,require:()=>({})});const content=notes.buildGroupTurnDirectionContext('邀请已有角色');
for(const phrase of ['[A邀请B加入了群聊]','群主/管理员','真实存在','可不是用户好友','新人下一轮','不能借此把不在场的user拉入群','不是user发言'])assert.ok(content.includes(phrase));
const settings=read('components/chat/chat-settings-panel.tsx'),start=settings.indexOf('                            {!session.isSpectator && <label');assert.ok(start>=0);
const end=settings.indexOf('                            </label>}',start)+'                            </label>}'.length;
const jsx=settings.slice(start,end),fixture={};vm.runInNewContext(compile(`exports.View=({session})=><div>${jsx}</div>;`),{exports:fixture,React,userIdentity:{name:'Observer'},groupVideoBgs:{self:'saved-image'},ChevronRight:()=>null,handleGroupVideoBgUpload:()=>{},setGroupVideoBgs:()=>{},updateSession:()=>{}});
const spectator=renderToStaticMarkup(React.createElement(fixture.View,{session:{isSpectator:true}})),ordinary=renderToStaticMarkup(React.createElement(fixture.View,{session:{isSpectator:false}}));
assert.ok(!spectator.includes('Observer'));assert.ok(ordinary.includes('Observer'));assert.ok(ordinary.includes('已设置'));
console.log('PASS runtime single-chat cadence scope, director legal invite boundaries, production JSX spectator hides self/ordinary preserves saved background. No model/storage calls.');
