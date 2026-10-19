const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const pkg = (p, file) => fs.readFileSync(path.join(path.dirname(require.resolve(p, { paths: [path.dirname(require.resolve('react-dom')), root] })), file), 'utf8');
const modules = {
  react: pkg('react', 'cjs/react.production.js'),
  'react/jsx-runtime': pkg('react', 'cjs/react-jsx-runtime.production.js'),
  'react-dom': pkg('react-dom', 'cjs/react-dom.production.js'),
  'react-dom/client': pkg('react-dom', 'cjs/react-dom-client.production.js'),
  scheduler: pkg('scheduler', 'cjs/scheduler.production.js'),
  experiment: ts.transpileModule(read('components/chat/pwa-header-blur-experiment.tsx'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText,
};
const script = `const sources=${JSON.stringify(modules)},cache={};function require(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;new Function('module','exports','require',sources[id])(m,m.exports,require);return m.exports;}
const R=require('react'),F=require('experiment');window.mount=()=>{window.app=require('react-dom/client').createRoot(document.getElementById('root'));function Harness(){const [state,set]=R.useState({active:true,dark:false});window.configure=patch=>set(s=>({...s,...patch}));return R.createElement('div',{className:'imessage-settings-page',style:{transform:'translateY(50px)'}},R.createElement('h2',null,'聊天设置'),R.createElement('div',{className:'chat-info-menu page-menu'},R.createElement('div',{className:'menu-group'},R.createElement(F.PwaHeaderBlurToggle))),R.createElement(F.PwaHeaderBlurExperiment,state))}window.app.render(R.createElement(Harness))};window.mount();`;

(async () => {
  const browser = await require(process.env.PLAYWRIGHT_MODULE || 'playwright').chromium.launch({ headless: true, executablePath: process.env.CHAT_TEST_BROWSER });
  try {
    for (const mode of ['ios-pwa', 'ios-browser', 'desktop', 'ipad-pwa', 'ios-media-pwa']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('http://pwa-test.local/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body><div id="root"></div></body></html>' }));
      await page.goto('http://pwa-test.local');
      await page.evaluate(mode => {
        Object.defineProperty(navigator, 'userAgent', { configurable: true, value: mode === 'desktop' ? 'Desktop' : mode === 'ipad-pwa' ? 'Macintosh' : 'iPhone OS 27' });
        Object.defineProperty(navigator, 'platform', { configurable: true, value: mode === 'ipad-pwa' ? 'MacIntel' : 'other' });
        Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: mode === 'ipad-pwa' ? 5 : 0 });
        Object.defineProperty(navigator, 'standalone', { configurable: true, value: mode === 'ios-pwa' || mode === 'ipad-pwa' });
        if (mode === 'ios-media-pwa') {
          const original = window.matchMedia.bind(window);
          window.matchMedia = query => query === '(display-mode: standalone)' ? { matches: true, addEventListener() {}, removeEventListener() {} } : original(query);
        }
      }, mode);
      for (const css of ['styles/components.css', 'styles/chat-settings.css']) await page.addStyleTag({ content: read(css) });
      await page.addStyleTag({ content: '*{box-sizing:border-box}body{margin:0;background:#f2f2f7;font:14px system-ui}h2{padding:20px}.menu-group{margin:16px;background:white;border-radius:16px;overflow:hidden}' });
      await page.addScriptTag({ content: script });
      const toggle = page.getByRole('switch', { name: '顶部模糊兼容（实验）' }), layer = page.locator('[data-pwa-header-blur-experiment]');
      await toggle.waitFor();
      assert.equal(await toggle.getAttribute('aria-checked'), 'false');
      assert.equal(await layer.count(), 0, 'default off');
      const offPixels = await page.screenshot();
      const topPixels = await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: 12 } });
      await toggle.click();
      await page.waitForFunction(() => document.querySelector('[role=switch]').getAttribute('aria-checked') === 'true');
      assert.equal(await page.evaluate(() => localStorage.getItem('float:pwa-header-blur-experiment:v1')), '1');
      const supported = mode.endsWith('pwa');
      if (supported) {
        await layer.waitFor({ state: 'attached' });
        const style = await layer.evaluate(el => ({ parent: el.parentElement.tagName, top: el.getBoundingClientRect().top, height: el.getBoundingClientRect().height, pointer: getComputedStyle(el).pointerEvents, clip: getComputedStyle(el).backgroundClip, text: el.textContent }));
        assert.deepEqual(style, { parent: 'BODY', top: 0, height: 11, pointer: 'none', clip: 'text', text: '' });
        assert.ok(topPixels.equals(await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: 12 } })), 'helper paints no visible strip in the document');
        await page.evaluate(() => window.configure({ dark: true }));
        await page.waitForFunction(() => document.querySelector('[data-pwa-header-blur-experiment]').style.backgroundColor === 'rgb(23, 33, 46)');
        await page.evaluate(() => window.configure({ active: false }));
        await layer.waitFor({ state: 'detached' });
        await page.evaluate(() => window.configure({ active: true }));
        await layer.waitFor({ state: 'attached' });
      } else assert.equal(await layer.count(), 0, `${mode}: no platform effect`);
      await page.evaluate(() => { window.app.unmount(); window.mount(); });
      await page.waitForFunction(() => document.querySelector('[role=switch]')?.getAttribute('aria-checked') === 'true');
      assert.equal(await layer.count(), supported ? 1 : 0, 'saved preference after remount');
      await toggle.click();
      await page.waitForFunction(() => document.querySelector('[role=switch]').getAttribute('aria-checked') === 'false');
      assert.equal(await layer.count(), 0);
      await page.waitForTimeout(250);
      assert.ok(offPixels.equals(await page.screenshot()), 'off restores page pixels');
      if (mode === 'ios-pwa') {
        fs.mkdirSync(path.join(root, 'qa/pwa-header'), { recursive: true });
        await page.screenshot({ path: path.join(root, 'qa/pwa-header/settings.png') });
        // Quota/security failure must not prevent switching off an active experiment.
        await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('blocked'); }; });
        await toggle.click(); await layer.waitFor({ state: 'attached' });
        await toggle.click(); await layer.waitFor({ state: 'detached' });
        assert.ok(await page.getByText('本次已切换，但设备未能保存；重开后需重新开启。').count());
      }
      assert.deepEqual(errors, []); await context.close(); console.log('PASS', mode);
    }
  } finally { await browser.close(); }
  console.log('PASS: isolated browser logic only; iOS system blur still requires real-device acceptance.');
})().catch(error => { console.error(error); process.exitCode = 1; });
