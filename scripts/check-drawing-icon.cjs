const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHAT_TEST_BROWSER, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 220 } });
    const css = ['styles/chat.css', 'styles/chat-drawing.css', 'styles/imessage26.css'].map(f => fs.readFileSync(f, 'utf8')).join('\n');
    const glyph = fs.readFileSync('components/chat/drawing-board.tsx', 'utf8').match(/<svg viewBox="0 0 24 24"[\s\S]*?<\/svg>/)[0].replace('fillRule=', 'fill-rule=').replace('clipRule=', 'clip-rule=');
    for (const privateMode of [false, true]) {
      await page.setContent(`<style>*{box-sizing:border-box}body{background:#153665;padding:24px}${css}</style><div class="chat-room-wrapper" ${privateMode ? 'data-imessage-private' : ''}><div class="chat-plus-icon-box"><span class="imessage-drawing-icon">${glyph}</span></div></div>`);
      const boxes = await page.evaluate(() => ['.chat-plus-icon-box', '.imessage-drawing-icon', '.imessage-drawing-icon svg'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x:r.x,y:r.y,w:r.width,h:r.height }; }));
      const [outer, circle, icon] = boxes;
      for (const r of [circle, icon]) {
        assert.ok(Math.abs((r.x+r.w/2)-(outer.x+outer.w/2)) < .1, 'horizontal center');
        assert.ok(Math.abs((r.y+r.h/2)-(outer.y+outer.h/2)) < .1, 'vertical center');
        assert.ok(r.w <= outer.w && r.h <= outer.h, 'no oversized child clipping');
      }
      if (privateMode) await page.screenshot({path:'tmp/drawing-icon-centered.png'});
    }
    console.log('PASS drawing icon centered without clipping in normal and iMessage menus');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
