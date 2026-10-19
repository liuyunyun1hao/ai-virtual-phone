// Real IndexedDB; synthetic users only. Assert reads, not unreliable heap/GC timing.
const fs = require('node:fs'), http = require('node:http'), ts = require('typescript');
const { chromium } = require('playwright');
const sources = Object.fromEntries(['kv-db', 'identity-runtime', 'identity-space', 'phone-session-protocol'].map(name => [name,
  ts.transpileModule(fs.readFileSync(`lib/${name}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText]));
(async () => {
  const server = http.createServer((_, res) => res.end('<title>KV read regression</title>'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHAT_TEST_BROWSER, headless: true });
  try {
    for (const activeUser of ['A', 'B']) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.addScriptTag({ path: require.resolve('dexie') });
      const result = await page.evaluate(async ({ sources, activeUser }) => {
        const check = (ok, message) => { if (!ok) throw Error(message); };
        const db = new Dexie('AiPhoneKvDB'); db.version(1).stores({ entries: 'key' });
        await db.open();
        const value = 'x'.repeat(1024 * 1024);
        await db.table('entries').bulkPut([
          { key: 'legacy-private', value },
          { key: 'identity:B:private', value },
          { key: 'identity:C:private', value: value.repeat(8) },
          { key: 'ai_phone_worldbooks_v1', value: 'shared' },
          ...Array.from({ length: 96 }, (_, i) => ({ key: `identity:B:small-${i}`, value: String(i) })),
        ]);
        localStorage.setItem('float_identity_runtime_v1', JSON.stringify({ version: 1, activeUserId: activeUser, legacyOwnerId: 'A', userIds: ['A', 'B', 'C'], deletingUserIds: [], revision: 1 }));
        const modules = {};
        const requireModule = path => {
          const name = path.split('/').pop();
          if (name === 'dexie') return Dexie;
          if (name === 'identity-recovery') return { resumeIdentityRecovery: async () => false };
          if (name === 'identity-lifecycle') return { initializePhoneIdentity: async () => {} };
          if (modules[name]) return modules[name];
          if (!sources[name]) throw Error('Unexpected module ' + name);
          const exports = modules[name] = {}; new Function('exports', 'require', sources[name])(exports, requireModule); return exports;
        };
        const nativeGet = IDBObjectStore.prototype.get;
        const nativeGetAll = IDBObjectStore.prototype.getAll;
        const readKeys = [];
        const batches = new Map();
        IDBObjectStore.prototype.getAll = function (...args) {
          if (this.transaction.db.name === 'AiPhoneKvDB') throw Error('Hydration must not read all users values');
          return nativeGetAll.apply(this, args);
        };
        IDBObjectStore.prototype.get = function (key) {
          if (this.transaction.db.name === 'AiPhoneKvDB') {
            readKeys.push(key);
            batches.set(this.transaction, (batches.get(this.transaction) || 0) + 1);
          }
          return nativeGet.call(this, key);
        };
        const kv = requireModule('kv-db'); await kv.hydrateKvDb();
        IDBObjectStore.prototype.get = nativeGet; IDBObjectStore.prototype.getAll = nativeGetAll;
        check(kv.kvGet('ai_phone_worldbooks_v1') === 'shared', 'Shared data missing');
        check(!readKeys.includes('identity:C:private'), 'Inactive large archive read into memory');
        if (activeUser === 'A') {
          check(kv.kvGet('legacy-private') === value && kv.kvGet('private') === null, 'Legacy owner scope wrong');
          check(!readKeys.some(key => key.startsWith('identity:')), 'Legacy owner read another identity');
        } else {
          check(kv.kvGet('private') === value && kv.kvGet('small-95') === '95', 'B data missing across batches');
          check(kv.kvGet('legacy-private') === null && !readKeys.includes('legacy-private'), 'B read legacy owner');
        }
        check(Math.max(...batches.values()) <= 32, 'Unbounded hydration batch');
        check((await db.table('entries').get('identity:C:private')).value.length === 8 * 1024 * 1024, 'Other user modified');
        db.close(); return { activeUser, valueReads: readKeys.length, maxBatch: Math.max(...batches.values()), skippedOtherUserMiB: 9 };
      }, { sources, activeUser });
      console.log('PASS', JSON.stringify(result)); await context.close();
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
