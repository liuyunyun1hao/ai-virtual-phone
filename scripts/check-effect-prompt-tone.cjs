const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const path=require('node:path'),root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(read(file),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:name=>{assert.ok(name in mocks,name);return mocks[name]}});return exports;}
const echo=load('lib/chat-echo.ts'),love=load('lib/chat-love.ts',{'./chat-echo':echo}),fireworks=load('lib/chat-fireworks.ts',{'./chat-echo':echo});
for(const [name,module] of [['Echo',echo],['Love',love],['Fireworks',fireworks]]){
 const prompt=module['build'+name+'Prompt']();
 assert.match(prompt,/黑色幽默/);assert.match(prompt,/反话|反讽/);assert.match(prompt,/性格/);assert.match(prompt,/每轮.{0,6}最多/);
 assert.ok(prompt.includes('['+name+']'));assert.doesNotMatch(prompt,/只适合|搞怪或催促默认不用/);
 const history=module[name.toLowerCase()+'HistoryText']({content:'测试',mediaData:{screenEffect:name.toLowerCase()}},'测试');
 assert.match(history,/黑色幽默/);assert.match(history,/上下文/);
 assert.equal(module[name.toLowerCase()+'HistoryText']({content:'普通文字'},'普通文字'),'普通文字');
 for(const file of ['lib/chat-engine.ts','lib/group-chat-engine.ts'])assert.ok(read(file).includes('build'+name+'Prompt()'));
}
console.log('PASS: all three effect guides and history semantics support contextual irony/black humor; private/group injection and protocols preserved.');
