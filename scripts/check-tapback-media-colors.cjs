const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHAT_TEST_BROWSER });
  try {
    const page = await browser.newPage();
    const css = fs.readFileSync('styles/imessage26.css', 'utf8');
    const cards = ['text', 'image', 'music_share', 'sticker', 'audio', 'file', 'quote'].flatMap(media =>
      ['user', 'assistant'].map(actor => `<div class="chat-msg-wrapper" style="--im26-base-blue:#0000ff;--im26-base-incoming:#00ff00;--chat-edge-lighten:10%"><div data-media-type="${media}" class="chat-bubble-media"><span class="imessage-tapback-badge" data-tapback-by="${actor}"><svg class="imessage-tapback-shape"><path d="M0 0h10v10z"/></svg><span class="imessage-tapback-glyph">♥</span></span></div></div>`)
    ).join('');
    await page.setContent(`<style>${css}</style><div class="chat-room-wrapper" data-imessage-private style="--tapback-user-surface:#f5ce77;--tapback-char-surface:#888888;--tapback-user-ink:#fff;--tapback-char-ink:#111">${cards}</div>`);
    for (const dark of [false, true]) {
      await page.locator('.chat-room-wrapper').evaluate((el, value) => el.toggleAttribute('data-chat-dark', value), dark);
      for (const badge of await page.locator('.imessage-tapback-badge').all()) {
        const user = await badge.getAttribute('data-tapback-by') === 'user';
        assert.equal(await badge.locator('path').evaluate(el => getComputedStyle(el).fill), user ? 'rgb(245, 206, 119)' : 'rgb(136, 136, 136)');
      }
    }
    await page.locator('.chat-room-wrapper').evaluate(el => el.style.setProperty('--tapback-user-surface', '#123456'));
    for (const path of await page.locator('[data-tapback-by="user"] path').all()) assert.equal(await path.evaluate(el => getComputedStyle(el).fill), 'rgb(18, 52, 86)');
    console.log('PASS: actor colors across seven media types, day/night, target tint/edge isolation and live color update.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
