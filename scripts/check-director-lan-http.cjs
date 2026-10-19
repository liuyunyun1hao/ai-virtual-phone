const fs=require('fs'),assert=require('node:assert/strict'),ts=require('typescript');
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
(async()=>{
const browser=await require(process.env.PLAYWRIGHT_MODULE||'playwright').chromium.launch({headless:true,executablePath:process.env.CHAT_TEST_BROWSER});
try {
 const context=await browser.newContext(),page=await context.newPage();
 // Intercept only this isolated fixture: real insecure LAN origin, no user data/API.
 await page.route('http://127.0.0.1:3001/director-http-check',route=>route.fulfill({contentType:'text/html',body:'<html><body>director HTTP fixture</body></html>'}));
 await page.goto('http://127.0.0.1:3001/director-http-check');
 const storage=fs.readFileSync('lib/chat-storage.ts','utf8'),ids=storage.slice(storage.indexOf('export function createResponseRoundId()'),storage.indexOf('export function createToolExecutionId()'));
 await page.addScriptTag({content:`const exports={};${compile(ids)}const makeId=exports.createResponseRoundId;let records=[{id:'s',isGroup:true,isSpectator:true}];const require=()=>({createResponseRoundId:makeId,loadChatSessions:()=>structuredClone(records),saveChatSessions:s=>{records=s}});${compile(fs.readFileSync('lib/group-director-note.ts','utf8'))}window.director=exports;`});
 const result=await page.evaluate(()=>{const api=window.director;api.queueGroupDirectorNote('s','test');const first=api.getGroupDirectorNote('s');api.queueGroupDirectorNote('s','second');api.consumeGroupDirectorNote('s',first.id);return {secure:isSecureContext,uuid:typeof crypto.randomUUID,note:api.getGroupDirectorNote('s').text}});
 assert.equal(result.secure,false);assert.equal(result.uuid,'undefined');assert.equal(result.note,'second');
 console.log('PASS production director queue/save/ID-safe consumption in actual insecure LAN HTTP origin with randomUUID unavailable. Isolated storage; no models.');
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
