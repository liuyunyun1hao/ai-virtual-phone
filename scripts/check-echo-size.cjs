// Isolated real-CSS fixture; no user storage, network models, or chat mutations.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const compile=f=>ts.transpileModule(read(f),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
(async()=>{const browser=await require(process.env.PLAYWRIGHT_MODULE||'playwright').chromium.launch({headless:true,executablePath:process.env.CHAT_TEST_BROWSER});try{
const page=await browser.newPage({viewport:{width:780,height:844},deviceScaleFactor:1}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.setContent('<style>*{box-sizing:border-box}body{margin:0;font-family:Arial}.chat-room-wrapper{width:390px}.chat-msg-wrapper{display:flex}.chat-bubble-role-user{width:max-content}.chat-markdown-paragraph{margin:0}#fixture{position:absolute;left:-1000px}#comparison{display:flex;background:linear-gradient(145deg,#7195b0,#213e55 50%,#737982)}canvas{width:390px;height:844px}</style><div id="fixture" class="chat-room-wrapper" data-imessage-private><div class="chat-msg-wrapper" data-role="user" data-imessage-tail><div class="chat-bubble-role-user" data-msg-id="fixture" data-media-type="text"><p class="chat-markdown-paragraph">哈哈哈</p><button>不应采集</button><span aria-hidden="true">隐藏</span><span style="display:none">不可见</span></div></div></div><div id="comparison"><canvas id="before" width="390" height="844"></canvas><canvas id="after" width="390" height="844"></canvas></div>');
for(const f of ['styles/chat.css','styles/imessage26.css'])await page.addStyleTag({content:read(f)});
await page.addStyleTag({content:'#fixture button{position:absolute}#fixture .chat-bubble-role-user{--bubble-text-ink:#fff;color:#fff}#fixture p{color:inherit}'});
await page.addScriptTag({content:'window.exports={};'+compile('lib/message-effects/capture.ts')+compile('lib/message-effects/echo-renderer.js')});
const samples=['哈哈哈','今天也想把所有的快乐都分享给你','今天所有让人开心的小事都想与你分享，希望你看到的时候也能跟着笑起来。','👨‍👩‍👧‍👦❤️👍🏽'];
const results=[];
fs.mkdirSync(path.join(root,'qa/echo-size'),{recursive:true});
for(let i=0;i<samples.length;i++){
const result=await page.evaluate(text=>{
 const node=document.querySelector('[data-msg-id]');node.querySelector('p').textContent=text;
 const recorded=[],original=CanvasRenderingContext2D.prototype.fillText;
 CanvasRenderingContext2D.prototype.fillText=function(s,...args){recorded.push({text:s,font:this.font});return original.call(this,s,...args)};
 const after=window.exports.captureEchoBubble(node);CanvasRenderingContext2D.prototype.fillText=original;
 // Excluded-control probes must not inflate the baseline bubble's layout.
 for(const extra of node.querySelectorAll('button,span'))extra.remove();
 const before=window.exports.captureBubble(node);
 const trace=sample=>{const calls=[],ctx={fillRect(){},drawImage(...args){calls.push(args.slice(1))}};const renderer=window.exports.createEchoRenderer(ctx,sample);renderer.draw(2400,390,844);return calls};
 if(text==='哈哈哈'){
  const expected=trace({...after,width:112.5,height:47.5,normalization:1});
  if(JSON.stringify(expected)!==JSON.stringify(trace(after)))throw Error('Short sprite must retain approved projection sizes');
 }
 for(const [id,sample] of [['before',before],['after',after]]){
  const ctx=document.getElementById(id).getContext('2d');ctx.clearRect(0,0,390,844);
  window.exports.createEchoRenderer(ctx,sample).draw(2400,390,844);
  ctx.fillStyle='#fff';ctx.font='16px sans-serif';ctx.fillText(id==='before'?'接入旧版':'尺寸修复',16,28);
 }
 return {text,lines:recorded.map(x=>x.text),fonts:recorded.map(x=>x.font),before:{width:before.width,height:before.height,n:before.normalization},after:{width:after.width,height:after.height,n:after.normalization}};
},samples[i]);
assert.equal(result.lines.join(''),samples[i]);assert.ok(result.fonts.every(f=>f.includes('20px')));assert.ok(result.after.n>=.85);
if(i===0){assert.ok(Math.abs(result.after.width-112.5)<1);assert.equal(result.after.height,47.5);assert.equal(result.after.n,1);}
if(i===1){assert.equal(result.lines.length,2);assert.equal(result.after.width,197.5);assert.equal(result.after.height,77.5);}
results.push(result);await page.screenshot({path:path.join(root,'qa/echo-size/sample-'+i+'.png')});
}
assert.deepEqual(errors,[]);
assert.match(read('lib/message-effects/echo-renderer.js'),/length:240/);
assert.match(read('lib/message-effects/echo-renderer.js'),/new Set\(\[13,39,52,78,104,130,169,208\]\)/);
assert.match(read('lib/message-effects/echo-renderer.js'),/duration:6000/);
assert.match(read('components/chat/message-effect-playback.tsx'),/effect==='echo'\?captureEchoBubble\(source\):captureBubble\(source\)/);
console.log(JSON.stringify({ok:true,results,errors},null,2));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
