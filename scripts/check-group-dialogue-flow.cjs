const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),ts=require('typescript');
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const api={};for(const file of ['lib/group-dialogue-flow.ts','lib/chat-text-layout.ts'])vm.runInNewContext(compile(fs.readFileSync(file,'utf8')),{exports:api});
const n=api.normalizeChatTextLayout;
assert.equal(n('Though the artist certainly has charm.\n😏'),'Though the artist certainly has charm.\u00a0😏');
assert.equal(n('charm. 😏'),'charm.\u00a0😏');assert.equal(n('很好 👩‍🎨'),'很好\u00a0👩‍🎨');
for(const text of ['line  \n😏','one\n\n😏','```\n😏\n```','短诗\n两行\n😏'])assert.equal(n(text),text);
assert.match(api.buildGroupDialogueFlowInstruction(),/角色可以在本轮再次出现/);
(async()=>{
const browser=await require(process.env.PLAYWRIGHT_MODULE||'playwright').chromium.launch({headless:true,executablePath:process.env.CHAT_TEST_BROWSER});
try { const page=await browser.newPage();
for(const width of [320,390,430]) {
await page.setViewportSize({width,height:700});
await page.setContent('<style>body{margin:0;font:14px Arial}.bubble{box-sizing:border-box;max-width:80%;padding:8px 12px;background:#f1f2f7;border-radius:22px;overflow-wrap:anywhere}</style><div class="bubble" id="bubble"></div>');
await page.locator('#bubble').evaluate((el,text)=>el.textContent=text,n('Though the artist certainly has charm. 😏'));
const result=await page.evaluate(()=>{const el=document.querySelector('#bubble'),text=el.firstChild,s=text.textContent;const r=document.createRange();r.setStart(text,s.indexOf('charm.'));r.setEnd(text,s.indexOf('charm.')+6);const a=r.getBoundingClientRect();r.setStart(text,s.indexOf('😏'));r.setEnd(text,s.length);return {difference:Math.abs(a.top-r.getBoundingClientRect().top),overflow:el.scrollWidth>el.clientWidth}});
assert.ok(result.difference<6,`emoji orphan at ${width}`);assert.equal(result.overflow,false);
}
console.log('PASS group instruction, protected formatting, trailing emoji/browser widths 320/390/430. No APIs/storage calls.');
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
