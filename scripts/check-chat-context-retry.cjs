// Isolated preview only: no real user database or paid model requests.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const compile=f=>ts.transpileModule(fs.readFileSync(path.join(root,f),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const out={};vm.runInNewContext(compile('lib/chat-retry-guidance.ts'),{exports:out});
const history=[{id:'u',sessionId:'s',role:'user',content:'hello',createdAt:'2026-10-02',status:'sent'}];
assert.equal(out.withRetryGuidance(history,'s','  '),history);
const guided=out.withRetryGuidance(history,'s','更自然，不要替我说话');
assert.equal(history.length,1);assert.equal(guided.length,2);assert.equal(guided[1].role,'system');assert.equal(guided[1].mediaType,'system_instruction');assert.match(guided[1].content,/更自然，不要替我说话/);
assert.equal(out.withRetryGuidance(history,'s','x'.repeat(3000))[1].content.split('\n')[1].length,2000);

console.log("PASS: request-local retry guidance, unchanged original history, instruction length bound.");
