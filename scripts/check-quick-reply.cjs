const fs=require('fs'),ts=require('typescript'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('components/chat/quick-reply-window.tsx','utf8');
const ast=ts.createSourceFile('quick.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let body;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='sync')body=n.initializer.getText(ast);ts.forEachChild(n,visit)}visit(ast);
function fixture(overrides={}) {
 const states=[],errors=[];
 const ctx={alive:true,owner:{current:'A'},sessionId:'s',getCurrentIdentityId:()=> 'A',loadChatSessions:()=>[{id:'s',contactId:'c'}],canCurrentIdentityInteract:()=>true,setSession:s=>states.push(s),setError:e=>errors.push(e),...overrides};
 vm.runInNewContext(ts.transpileModule('var run='+body,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);ctx.run();return{states,errors};
}
assert.equal(fixture().states[0].id,'s');
for(const o of [{getCurrentIdentityId:()=> 'B'},{canCurrentIdentityInteract:()=>false},{loadChatSessions:()=>[]},{loadChatSessions:()=>[{id:'s',isGroup:true,participantIds:[]}]}])assert.equal(fixture(o).states[0],null);
assert.equal(fixture({alive:false}).states.length,0);
assert.ok(source.includes('<ChatRoom session={session}'));
assert.ok(source.includes('<SessionCustomCSS css={chatCSS} scope=".chat-app"'));
assert.ok(!source.includes('pushChatMessage'),'sending must use ChatRoom');
const shell=fs.readFileSync('components/desktop-shell.tsx','utf8');
assert.ok(shell.includes('{!quickReply && <PhoneChatApp'),'hidden mini app must not duplicate chat reply listeners');
console.log('PASS: real session gate identity/access/deletion/unmount; shared ChatRoom/CSS and single mini-chat owner. No model calls.');
