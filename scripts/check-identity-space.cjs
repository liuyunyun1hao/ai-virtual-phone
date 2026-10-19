// Isolated identity boundaries: no browser user data, network, models, or TTS.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
function load(file, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => dependencies[name], AbortController, console });
  return exports;
}
const core = load('lib/identity-space.ts');
const host = load('lib/identity-host-context.ts', { './identity-space': core });
async function main() {
  let state = core.initializeIdentitySpace(['A', 'B'], 'A');
  let access = { C: ['A'], D: [] };
  assert.equal(state.activeUserId, 'A');
  assert.equal(state.legacyOwnerId, 'A');
  const a = host.createIdentityHostContext(() => state, () => access);
  a.assertCharacter('C');
  const registry = new core.IdentityTaskRegistry();
  const task = registry.start(state);
  state = core.switchIdentitySpace(state, 'B');
  registry.silence();
  assert.equal(task.signal.aborted, true);
  assert.throws(() => a.assertCurrent(), /身份/);
  const b = host.createIdentityHostContext(() => state, () => access);
  assert.throws(() => b.assertCharacter('C'), /不能/);
  b.assertCharacter('D'); // Unbound and not necessarily a friend.
  access.C = ['A', 'B'];
  b.assertCharacter('C');
  assert.notEqual(core.identityCharacterKey('A', 'C'), b.characterKey('C'));
  assert.notEqual(core.identityCharacterKey('a,b', 'c'), core.identityCharacterKey('a', 'b,c'));
  assert.notEqual(core.identityStorageKey('A:', 'x'), core.identityStorageKey('A', ':x'));
  state = core.switchIdentitySpace(state, 'A');
  assert.throws(() => a.assertCurrent(), /身份/); // A→B→A does not revive the old request.
  const rows = new Map();
  let delayCommit = false;
  let release;
  const backend = {
    read: async key => rows.get(key),
    write: async (key, value, guard) => {
      if (delayCommit) await new Promise(resolve => { release = resolve; });
      guard();
      rows.set(key, value);
    },
  };
  const storeA = host.bindIdentityAppStorage(host.createIdentityHostContext(() => state, () => access), 'zoo', backend);
  await storeA.write('zoo_saves', { user: 'A', relation: 'A+C' });
  state = core.switchIdentitySpace(state, 'B');
  const storeB = host.bindIdentityAppStorage(host.createIdentityHostContext(() => state, () => access), 'zoo', backend);
  assert.equal(await storeB.read('zoo_saves'), undefined);
  await storeB.write('zoo_saves', { user: 'B', relation: 'B+C' });
  const otherApp = host.bindIdentityAppStorage(host.createIdentityHostContext(() => state, () => access), 'bubble', backend);
  assert.equal(await otherApp.read('zoo_saves'), undefined);
  delayCommit = true;
  const pending = storeB.write('pending', 'must not commit');
  state = core.switchIdentitySpace(state, 'A');
  release();
  await assert.rejects(pending, /身份/);
  assert.equal([...rows.keys()].some(key => key.includes('pending')), false);
  delayCommit = false;
  state = core.beginIdentityDeletion(state, 'A');
  assert.equal(state.activeUserId, 'B');
  assert.equal(core.canIdentityInteract(state, { C: ['A'] }, 'B', 'C'), false); // Not yet deleted.
  let fail = true;
  const participants = [
    { name: 'app-data', remove: async id => { for (const key of rows.keys()) if (key.startsWith(core.identityStoragePrefix(id))) rows.delete(key); } },
    { name: 'cloud-jobs', remove: async () => { if (fail) throw new Error('offline'); } },
  ];
  await assert.rejects(core.cleanIdentityData('A', participants), /cloud-jobs/);
  assert.equal(state.userIds.includes('A'), true); // Keep deleting metadata so cleanup can retry.
  assert.throws(() => core.switchIdentitySpace(state, 'A'), /身份/);
  fail = false;
  await core.cleanIdentityData('A', participants);
  state = core.finishIdentityDeletion(state, 'A');
  access = core.removeIdentityAccess(access, 'A');
  assert.equal(core.canIdentityInteract(state, { C: ['A'] }, 'B', 'C'), true); // Invalid-only whitelist is open.
  const remaining = host.bindIdentityAppStorage(host.createIdentityHostContext(() => state, () => access), 'zoo', backend);
  assert.equal((await remaining.read('zoo_saves')).relation, 'B+C');
  state = core.finishIdentityDeletion(core.beginIdentityDeletion(state, 'B'), 'B');
  assert.equal(state.activeUserId, null);
  assert.equal(state.userIds.length, 0);
  assert.throws(() => core.acquireIdentityLease(state), /创建或选择/);
  const empty = core.initializeIdentitySpace([]);
  assert.equal(empty.activeUserId, null);
  assert.equal(core.normalizeIdentitySpace({ userIds: ['B'], activeUserId: 'A' }).activeUserId, null);
  console.log('PASS: A/B app and character isolation, whitelist rules, stale/ABA callbacks, aborted tasks, guarded delayed commits, deletion retry, remaining user intact, last identity empty.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
