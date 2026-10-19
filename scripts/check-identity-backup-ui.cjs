// Actual app page in an isolated browser profile. Never imports into the user's browser.
const fs = require('node:fs');
const JSZip = require('jszip');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ format: 'ai-phone-backup', version: 1, createdAt: new Date().toISOString(), origin: '', totalBytes: 1, totalRecords: 1, modules: [{ id: 'chat', label: '聊天数据', records: 1, bytes: 1 }] }));
  zip.file('modules/chat.json', JSON.stringify({ moduleId: 'chat', sources: [{ type: 'kv', records: [{ key: 'synthetic-preview', value: 'never imported' }] }] }));
  const fixture = await zip.generateAsync({ type: 'nodebuffer' });
  fs.mkdirSync('tmp/f1-ui', { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHAT_TEST_BROWSER, headless: true });
  try {
    for (const colorScheme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: colorScheme === 'light' ? 390 : 320, height: 844 }, isMobile: true, hasTouch: true, colorScheme });
      if (process.env.BACKUP_QA_MOCK_ACCOUNT === '1') {
        await page.route('**/api/auth/me', route => route.fulfill({ json: { ok: true, account: { id: 'backup_qa', username: 'backup_qa', displayName: 'Backup QA', status: 'active' } } }));
      }
      const errors = []; page.on('pageerror', error => {errors.push(error.message);console.log('PAGE ERROR',error.message)});page.on('console',message=>{if(message.type()==='error')console.log('BROWSER',message.text().slice(0,400))});
      await page.goto(process.env.BACKUP_QA_URL || 'http://127.0.0.1:3003/', { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.getByRole('button', { name: 'Enter', exact: true }).click({ timeout: 60000 }).catch(async error=>{console.log(await page.locator('body').innerText());await page.screenshot({path:'tmp/f1-ui/startup-failure.png'});throw error});
      await page.getByRole('button', { name: '我知道了' }).click({timeout: 5000}).catch(() => {});
      await page.getByRole('button', { name: '关闭更新卡片' }).click({timeout:12000}).catch(()=>{});
      await page.locator('[data-flip-id="icon:settings"]').click();
      await page.getByText('数据管理', { exact: true }).click();
      const scope = page.getByRole('group', { name: '备份身份范围', exact: true });
      await scope.scrollIntoViewIfNeeded();
      assert.equal(await scope.getByRole('button', { name: '全部 user', exact: true }).getAttribute('aria-pressed'), 'true');
      const current = scope.getByRole('button', { name: '当前 user', exact: true });
      await current.focus(); await page.keyboard.press('Enter');
      assert.equal(await current.getAttribute('aria-pressed'), 'true');
      await page.screenshot({ animations: 'disabled', path: `tmp/f1-ui/${colorScheme}-scope.png` });
      await page.locator('input[type="file"][accept*="aiphone"]').setInputFiles({ name: 'synthetic-legacy.zip', mimeType: 'application/zip', buffer: fixture });
      const modal = page.locator('.data-import-modal'); await modal.waitFor();
      const choice = modal.getByRole('button', { name: '新建 user（推荐）', exact: true });
      assert.equal(await choice.getAttribute('aria-pressed'), 'true');
      const toggle = modal.getByRole('switch', { name: '覆盖公共档案的冲突项' });
      assert.equal(await toggle.getAttribute('aria-checked'), 'false');
      await page.waitForFunction(() => !document.querySelector('[aria-label="覆盖公共档案的冲突项"]')?.disabled);
      await toggle.focus(); await page.keyboard.press('Space');
      await page.waitForFunction(() => document.querySelector('[aria-label="覆盖公共档案的冲突项"]')?.getAttribute('aria-checked') === 'true');
      assert.equal(await toggle.getAttribute('aria-checked'), 'true');
      const rect = await modal.boundingBox(); const width = await page.evaluate(() => window.innerWidth);
      assert(rect && rect.x >= 0 && rect.x + rect.width <= width + 1, 'Import dialog overflows viewport');
      await page.screenshot({ animations: 'disabled', path: `tmp/f1-ui/${colorScheme}-import.png` });
      await modal.getByRole('button', { name: '取消', exact: true }).click();
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS actual app page: 390/320px light/dark system preference, backup scope, legacy preview, defaults, keyboard controls, dialog bounds; no restore/model/account mutations.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
