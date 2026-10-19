const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
async function main(){
 const browser=await require(process.env.PLAYWRIGHT_MODULE||'playwright').chromium.launch({headless:true,executablePath:process.env.CHAT_TEST_BROWSER});
 try {
  const page=await browser.newPage({viewport:{width:390,height:720}});
  const inline=read('components/chat/user-profile-panel.tsx').match(/<style>\{`([\s\S]*?)`\}<\/style>/)[1];
  const base=`*{box-sizing:border-box}body{margin:0}.page-shell{position:absolute;inset:0;background:#fafafa}.page-header{position:absolute;top:0;left:0;right:0;height:102px;display:flex;align-items:end;padding:0 14px 5px}.page-back-btn{width:44px;height:44px}.page-body{overflow:auto}.apple-profile-content{position:relative;display:flex;flex-direction:column}.apple-profile-identity{height:230px;flex-shrink:0}.profile-cover-image{background-image:linear-gradient(120deg,#36465b,#a2b2c8)}.wallet{margin:0 20px;background:#ddd;height:132px;flex-shrink:0}.spacer{height:1200px;flex-shrink:0}`;
  await page.setContent(`<style>${base}${read('styles/chat-social-apple.css')}${inline}</style><div class="user-profile-page-root apple-social-page page-shell"><header class="page-header"><button class="page-back-btn" aria-label="返回">‹</button></header><main class="page-body"><div class="apple-profile-content"><div class="apple-profile-identity"><div class="profile-cover-image"></div><button class="profile-cover-upload" aria-label="上传背景"></button></div><div class="wallet">钱包</div><div class="spacer"></div></div></main></div>`);
  const rect=selector=>page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return{top:r.top,bottom:r.bottom};});
  assert.equal((await rect('.page-body')).top,0);
  assert.equal((await rect('.profile-cover-image')).top,0);
  assert.equal((await rect('.apple-profile-identity')).top,102);
  assert((await rect('.profile-cover-image')).bottom <= (await rect('.wallet')).top);
  assert(await page.locator('.page-back-btn').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.left+22,r.top+22));}));
  const before=await rect('.page-back-btn');
  await page.locator('.page-body').evaluate(el=>el.scrollTop=150);
  assert.deepEqual(await rect('.page-back-btn'),before);
  console.log('PASS: background and scroll canvas reach screen top, content retains 102px offset, fade ends before wallet, back button exposed and fixed while scrolling.');
 } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
