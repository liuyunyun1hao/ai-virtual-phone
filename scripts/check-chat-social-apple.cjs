// Isolated visual fixture: no real conversations, browser storage or user actions.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const feed = read('components/chat/moments-feed.tsx');
const profile = read('components/chat/user-profile-panel.tsx');
assert(feed.includes('onClick={() => setShowCompose(true)}'));
assert(feed.includes('onChange={handleCoverUpload}'));
assert(feed.includes('handleSignatureSubmit(e.target.value)'));
assert(!feed.includes('12.4K'));
assert(profile.includes('setShowWalletPanel(true)'));
assert(profile.includes('setShowCSSEditor(true)'));
assert(profile.includes('apple-profile-wallet'));
assert(!feed.includes('<h1 className="apple-social-title">动态'));
assert(!profile.includes('<h1 className="apple-social-title">主页'));
assert(profile.includes('ID：{identity.id}'));
async function main() {
  const browser = await require(process.env.PLAYWRIGHT_MODULE || 'playwright').chromium.launch({headless:true, executablePath:process.env.CHAT_TEST_BROWSER});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    const css = read('styles/chat-social-apple.css');
    const base = `*{box-sizing:border-box}body{margin:0;font-family:Arial;background:#f2f2f7;--c-card:#fff;--c-text-title:#1c1c1e;--c-text:#636366}.page-header{height:102px;display:flex;align-items:end;justify-content:space-between;padding:0 14px 5px}.page-back-btn{width:40px;height:40px}.page-body{background:var(--c-page-body-bg,#f2f2f7)}.feed-cover-shell{position:relative}.feed-cover-bg{position:absolute;inset:0;background:linear-gradient(135deg,#cad8e3,#c8c3d7)}.feed-profile{position:relative}.feed-profile-avatar{border:3px solid white;background:#d8dde5;border-radius:50%}.feed-profile-info{display:flex;flex-direction:column}.feed-post-header{display:flex;align-items:center;gap:12px;margin-bottom:12px}.feed-post-author-avatar{width:40px;height:40px;border-radius:50%;background:#d8dde5}.feed-post-content{white-space:pre-wrap}.apple-profile-content{display:flex;flex-direction:column}.apple-profile-identity{display:flex;align-items:center}.apple-profile-wallet{text-align:left}.amount{font-size:30px;margin:10px 0}.mx-4{padding:18px}.section-row{padding:12px 0;border-bottom:1px solid var(--social-line)}button{font:inherit;color:inherit}`;
    const header = '<header class="page-header"><button class="page-back-btn">‹</button><button class="page-back-btn">＋</button></header>';
    const fixtures = {
      feed:`<section class="apple-social-page moments-feed-page">${header}<main class="page-body"><h1 class="apple-social-title">动态</h1><div class="feed-cover-shell"><div class="feed-cover-bg"></div><div class="feed-profile"><div class="feed-profile-avatar"></div><div class="feed-profile-info"><strong class="feed-profile-name">我的名字</strong><span>记录日常里的小美好。</span></div></div></div><article class="feed-post"><div class="feed-post-header"><div class="feed-post-author-avatar"></div><strong class="feed-post-author-name">朋友</strong></div><div class="feed-post-content">今天的天空很好看。\n分享一些平凡又值得记住的瞬间。</div></article><article class="feed-post"><strong>另一位朋友</strong><p class="feed-post-content">周末一起出门走走吧。</p></article></main></section>`,
      profile:`<section class="apple-social-page user-profile-page-root">${header}<main class="page-body apple-profile-content"><h1 class="apple-social-title">主页</h1><div class="apple-profile-identity"><div class="shrink-0"><div style="background:#d8dde5;border-radius:50%"></div></div><div><strong>我的名字</strong><p>聊天 4 · 动态 12 · 访客 3</p></div></div><button class="apple-profile-wallet mx-4"><span>钱包余额</span><div class="apple-wallet-amount amount">¥2,500.00</div><span>余额管理 · 银行卡与流水</span></button><div class="mx-4"><div class="section-row">我的动态</div><div class="section-row">外观 CSS</div><div class="section-row">追发规则与延迟控制</div></div></main></section>`
    };
    for (const colorScheme of ['light','dark']) {
      await page.emulateMedia({colorScheme});
      for (const [name, html] of Object.entries(fixtures)) {
        await page.setContent(`<style>${base}\n${css}</style>${html}`);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const buttonBox = await page.locator('.page-back-btn').first().boundingBox();
        assert.equal(buttonBox.width,44, 'Navigation uses the Messages 44px standard');
        if (colorScheme === 'dark') assert.equal(await page.locator('.apple-social-title').evaluate(e=>getComputedStyle(e).color),'rgb(245, 245, 247)');
        await page.screenshot({path:path.join(root,`qa/chat-social-${name}-${colorScheme}.png`)});
        await page.setViewportSize({width:320,height:740});
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.setViewportSize({width:390,height:844});
      }
    }
    for (const colorScheme of ['light','dark']) {
      await page.emulateMedia({colorScheme});
      const measurements=[];
      for (const type of ['imessage-list-page','imessage-contacts-page','moments-feed-page','user-profile-page-root']) {
        const social=type.endsWith('page-root') || type==='moments-feed-page';
        const shell=`<section class="page-shell ${social ? 'apple-social-page '+type : ''}">${header}</section>`;
        await page.setContent(`<style>${base}\n${css}</style>${social ? shell : `<div class="${type}">${shell}</div>`}`);
        measurements.push(await page.locator('.page-back-btn').first().evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,background:s.backgroundColor,border:s.border,shadow:s.boxShadow};}));
      }
      for(const measurement of measurements) assert.deepEqual(measurement, measurements[0], 'Four tab headers must match');
    }
    console.log('PASS: retained hooks, removed headings, actual ID, four matching headers in light/dark. Fixtures are not a live app interaction test.');
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
