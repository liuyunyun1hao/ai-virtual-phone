// Real IndexedDB in a disposable browser profile; never opens the user's Float origin.
const fs = require('node:fs');
const http = require('node:http');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
async function main() {
  const server = http.createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Identity storage regression</title>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHAT_TEST_BROWSER, headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.addScriptTag({ path: require.resolve('dexie') });
    const result = await page.evaluate(async ({ coreSource, dbSource }) => {
      const core = {};
      new Function('exports', coreSource)(core);
      const database = {};
      new Function('exports', 'require', dbSource)(database, name => name === 'dexie' ? window.Dexie : core);
      const db = new database.IdentitySpaceDatabase('IdentityRegression');
      const repo = new database.IdentitySpaceRepository(db);
      const check = (value, message) => { if (!value) throw new Error(message); };
      let state = await repo.initialize(['A', 'B'], 'A');
      let a = core.acquireIdentityLease(state);
      await repo.write(a, 'memory', 'C', { relationship: 'A+C' });
      await repo.write(a, 'wallet', 'balance', 100);
      await repo.setAccess('C', ['A']);
      // A second repository simulates another tab using the same persisted metadata.
      const secondDb = new database.IdentitySpaceDatabase('IdentityRegression');
      const second = new database.IdentitySpaceRepository(secondDb);
      state = await second.switchTo('B');
      const b = core.acquireIdentityLease(state);
      check(await repo.read(b, 'memory', 'C') === undefined, 'B read A memory');
      check(await repo.read(b, 'wallet', 'balance') === undefined, 'B read A wallet');
      await repo.write(b, 'memory', 'C', { relationship: 'B+C' });
      await repo.write(b, 'wallet', 'balance', 200);
      let blocked = false;
      try { await repo.write(a, 'memory', 'late', 'stale'); } catch { blocked = true; }
      check(blocked, 'Other-tab stale write accepted');
      state = await repo.switchTo('A');
      blocked = false;
      try { await repo.write(a, 'memory', 'late', 'ABA stale'); } catch { blocked = true; }
      check(blocked, 'A→B→A revived old lease');
      a = core.acquireIdentityLease(state);
      check((await repo.read(a, 'memory', 'C')).relationship === 'A+C', 'A history lost');
      state = await repo.beginDeletion('A');
      check(state.activeUserId === 'B', 'Deleting active A did not switch to B');
      blocked = false;
      try { await repo.write(a, 'wallet', 'balance', 0); } catch { blocked = true; }
      check(blocked, 'Deleting user can still write');
      await repo.finishDeletion('A');
      const newB = core.acquireIdentityLease(await repo.readState());
      check((await repo.read(newB, 'memory', 'C')).relationship === 'B+C', 'Deleted B memory');
      check(await repo.read(newB, 'wallet', 'balance') === 200, 'Deleted B wallet');
      check(await db.records.where('userId').equals('A').count() === 0, 'A records remain');
      check((await repo.readAccess()).C.length === 0, 'Whitelist A reference remains');
      await repo.beginDeletion('B');
      state = await repo.finishDeletion('B');
      check(state.activeUserId === null && state.userIds.length === 0, 'Last user resurrected');
      const reload = await second.initialize(['A', 'B'], 'A');
      check(reload.userIds.length === 0, 'Initialize resurrected deleted identities');
      secondDb.close();
      await db.delete();
      return { remainingUsers: state.userIds.length, staleWritesBlocked: true, otherUserPreserved: true };
    }, { coreSource: compile('lib/identity-space.ts'), dbSource: compile('lib/identity-space-db.ts') });
    assert.equal(result.remainingUsers, 0);
    console.log('PASS: real IndexedDB A/B isolation, cross-tab transactional guards, ABA rejection, deletion scope, last-user deletion persists across initialization.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
