const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const css=['tokens','components','chat','imessage26','chat-social-apple'].map(name=>fs.readFileSync(path.join(root,'styles',name+'.css'),'utf8')).join('\n');
const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 19V5h14v14z"/></svg>';
const header=title=>`<header class="page-header"><div class="page-header-safe-area"></div><div class="page-header-content"><button class="page-back-btn">‹</button><span class="page-title">${title}</span><span class="page-header-right"><button class="page-back-btn">${icon}</button></span></div></header>`;
const dock=`<nav class="chat-tab-bar chat-bottom-glass-bar">${['消息','联系人','动态','主页'].map((label,i)=>`<button class="chat-tab ${i===0?'chat-tab-active':''}">${icon}<span>${label}</span></button>`).join('')}</nav>`;
async function main(){
 const browser=await require(process.env.PLAYWRIGHT_MODULE||'playwright').chromium.launch({headless:true,executablePath:process.env.CHAT_TEST_BROWSER});
 try {
  const page=await browser.newPage({viewport:{width:390,height:740}});
  for(const name of ['imessage-list-page','imessage-contacts-page','moments-feed-page','user-profile-page-root']){
   const social=name==='moments-feed-page'||name==='user-profile-page-root';
   const title=name==='moments-feed-page'?'<span class="moments-section-label">MOMENTS</span>':'';
   const shell=`<section class="page-shell ${social?'apple-social-page '+name:''}">${header(title)}<main class="page-body"><div class="test-copy">${name}</div><div class="chat-search-bar">搜索</div><div class="menu-group"><div class="menu-item">示例内容</div></div></main></section>`;
   await page.setContent(`<style>${css}*{box-sizing:border-box}body{margin:0;font-family:Arial}.chat-app{position:absolute;inset:0}.chat-main-content{height:100%}.test-copy{padding:20px}.chat-search-bar{margin:0 20px 20px}button{font:inherit}</style><div class="chat-app"><div class="chat-main-content">${social?shell:`<div class="${name}" style="height:100%">${shell}</div>`}</div>${dock}</div>`);
   for(const colorScheme of ['light','dark','light']){
    await page.emulateMedia({colorScheme});
    const bg=await page.locator('.page-body').evaluate(el=>getComputedStyle(el).backgroundColor);
    assert.equal(bg,colorScheme==='dark'?'rgb(16, 16, 18)':'rgb(250, 250, 250)',name+' must follow system changes');
    assert.equal(await page.locator('.test-copy').evaluate(el=>getComputedStyle(el).color),colorScheme==='dark'?'rgb(245, 245, 247)':'rgb(44, 52, 64)');
    const box=await page.locator('nav').boundingBox();assert.equal(box.width,350);assert.equal(box.height,77);assert.equal(box.x,20);
    const glass=await page.locator('nav').evaluate(el=>({background:getComputedStyle(el).backgroundColor,filter:getComputedStyle(el).backdropFilter}));
    const buttonGlass=await page.locator('.page-back-btn').first().evaluate(el=>({background:getComputedStyle(el).backgroundColor,filter:getComputedStyle(el).backdropFilter}));
    assert.deepEqual(glass,buttonGlass,'Dock material must match the functional buttons in both themes');
    for(const tab of await page.locator('nav button').all()){const rect=await tab.boundingBox();assert(rect.width>=44&&rect.height>=44);}
    if(title){const center=sel=>page.locator(sel).first().boundingBox().then(r=>r.y+r.height/2);assert(Math.abs(await center('.page-title')-await center('.page-back-btn'))<1);}
    if(name==='moments-feed-page') await page.screenshot({path:path.join(root,`qa/chat-system-${colorScheme}.png`)});
   }
  }
  await page.setViewportSize({width:320,height:640});
  const narrowDock=await page.locator('nav').boundingBox();assert.equal(narrowDock.width,280);assert.equal(narrowDock.height,77);assert.equal(narrowDock.x,20);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:440,height:900});
  const wideDock=await page.locator('nav').boundingBox();assert.equal(wideDock.width,400);assert.equal(wideDock.x,20);assert.equal(wideDock.height,77);
  console.log('PASS: 20px dock gutters at 320/390/440px, unchanged 77px height, glass material matches functional buttons in both system themes, touch targets intact.');
 } finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
