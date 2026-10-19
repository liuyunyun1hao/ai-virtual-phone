// Real IndexedDB in a disposable profile; synthetic records, no model calls.
const fs = require('node:fs'), http = require('node:http'), ts = require('typescript');
const { chromium } = require('playwright');
const files = ['identity-runtime', 'identity-space', 'identity-access', 'idb-open', 'memory-storage', 'memory-types'];
const sources = Object.fromEntries(files.map(name => [name, ts.transpileModule(fs.readFileSync(`lib/${name}.ts`, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText]));
async function main() {
  const server = http.createServer((_q, res) => res.end('<!doctype html><title>Public memory regression</title>'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHAT_TEST_BROWSER, headless: true });
    const page = await browser.newPage(), url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(url);
    async function load(owner) {
      await page.evaluate(owner => localStorage.setItem('float_identity_runtime_v1', JSON.stringify({
        version: 1, activeUserId: owner, legacyOwnerId: 'A', userIds: ['A', 'B'], deletingUserIds: [], revision: owner === 'A' ? 0 : 1,
      })), owner);
      await page.goto(url);
      await page.evaluate(sources => {
        const modules = {}, cache = new Map();
        window.module = name => {
          name = name.replace(/^.*\//, '');
          if (name === 'kv-db') return { kvGet: k => cache.get(k) || null, kvSet: (k,v) => cache.set(k,v), registerDynamicPrefix() {}, registerKvMigration() {} };
          if (modules[name]) return modules[name];
          const exports = {}; modules[name] = exports;
          new Function('exports', 'require', sources[name])(exports, window.module);
          return exports;
        };
        window.check = (ok, message) => { if (!ok) throw Error(message); };
      }, sources);
    }
    await load('A');
    await page.evaluate(async () => {
      // Simulate a restored backup whose database version is higher than this app's.
      const request = indexedDB.open('ai_phone_memory_db_v1', 8);
      request.onupgradeneeded = () => request.result.createObjectStore('memories', {keyPath:'id'});
      const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      db.close();
      const storage = module('memory-storage'), now = new Date().toISOString();
      for (const type of ['long_term', 'core']) await storage.saveMemoryEntry({ id: type, characterId:'C', type, sourceApp:'chat', content:'A memory', importance:0.8, createdAt:now, updatedAt:now });
      check((await storage.loadMemoryEntries('C')).length === 2, 'High-version backup read failed');
      check((await storage.loadMemoryEntriesByType('C','core')).length === 1, 'Core memory filter failed');
      check((await storage.loadMemoryEntries('Other')).length === 0, 'Character boundary failed');
    });
    await load('B');
    await page.evaluate(async () => {
      const storage = module('memory-storage'), now = new Date().toISOString();
      check((await storage.loadMemoryEntries('C')).length === 0, 'B sees A memory');
      await storage.saveMemoryEntry({id:'long_term',characterId:'C',type:'long_term',sourceApp:'chat',content:'B memory',importance:0.8,createdAt:now,updatedAt:now});
      check((await storage.loadMemoryEntries('C'))[0].content === 'B memory', 'Fresh database write failed');
      await storage.deleteMemoryEntry('long_term');
      check((await storage.loadMemoryEntries('C')).length === 0, 'Delete failed');
    });
    await load('A');
    await page.evaluate(async () => check((await module('memory-storage').loadMemoryEntries('C')).length === 2, 'B modified A memory'));
    console.log('PASS: public memory fresh/high-version IDB, long-term/core CRUD, character filter and A/B isolation. No user data/model calls.');
  } finally { if (browser) await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
