// Production namespace/lifecycle modules, real IDB, disposable browser and synthetic data only.
const fs = require('node:fs');
const http = require('node:http');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const files = ['identity-space', 'identity-runtime', 'phone-session-protocol', 'identity-db-guard', 'identity-recovery', 'identity-media-cleanup', 'identity-lifecycle', 'identity-access', 'kv-db'];
const sources = Object.fromEntries(files.map(name => [name, ts.transpileModule(fs.readFileSync(`lib/${name}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText]));
sources['operation-lock'] = ts.transpileModule(fs.readFileSync('lib/data-management/operation-lock.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
sources['identity-backup'] = ts.transpileModule(fs.readFileSync('lib/data-management/identity-backup.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
sources.idb = ts.transpileModule(fs.readFileSync('lib/data-management/idb.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function main() {
 const server = http.createServer((_req, res) => res.end('<!doctype html><title>Production identity regression</title>'));
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const browser = await chromium.launch({ executablePath: process.env.CHAT_TEST_BROWSER, headless: true });
 try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const load = async () => {
   await page.addScriptTag({ path: require.resolve('dexie') });
   await page.evaluate(sources => {
    const mods = {};
    window.module = name => {
     name = name.replace(/^.*\//, '');
     if (name === 'dexie') return window.Dexie;
     if (name === 'personal-push-cloud') return { isPersonalPushCloudActive: () => Boolean(window.failCloud), setPersonalPushCloudScheduled: async()=>{}, personalPushFetch: async()=>({ok:false}) };
     if (name === 'serializers') return {};
     if (name === 'push-client') return { hasAccountPushSubscription: async () => false };
     if (mods[name]) return mods[name];
     if (!sources[name]) throw new Error(`Unexpected dependency ${name}`);
     const exports = mods[name] = {};
     new Function('exports', 'require', sources[name])(exports, window.module);
     return exports;
    };
    window.check = (value, message) => { if (!value) throw new Error(message); };
   }, sources);
  };
  await load();
  await page.evaluate(async () => {
   const kv = new Dexie('AiPhoneKvDB'); kv.version(1).stores({ entries: 'key' });
   await kv.table('entries').bulkPut([
    { key: 'ai_phone_user_identities_v1', value: JSON.stringify([{ id: 'A', name: 'Alice' }, { id: 'B', name: 'Bob' }]) },
    { key: 'ai_phone_bindings_v1', value: JSON.stringify({ globalDefaults: { userIdentityId: 'A' }, characterBindings: [] }) },
    { key: 'ai_phone_characters_v1', value: JSON.stringify([{ id: 'C', name: 'Shared', avatar: 'asset://shared-image' }]) },
    { key: 'wallet', value: '100' }, { key: 'memory:C', value: 'A+C' },
    { key: 'private-image', value: 'asset://A-image' },
   ]); kv.close();
   const db = new Dexie('AiPhoneChatDB'); db.version(1).stores({ rows: 'id' }); await db.table('rows').put({ id: 'C', relation: 'A+C' }); db.close();
   const assets = new Dexie('ai_phone_theme_db_v1'); assets.version(1).stores({ assets: 'id' });
   await assets.table('assets').bulkPut([{id:'A-image',type:'chat_bg',ownerUserId:'A'}, {id:'shared-image',type:'chat_bg',ownerUserId:'A'}]); assets.close();
   localStorage.setItem('app-test', 'A local');
   await module('kv-db').hydrateKvDb();
   check(module('identity-runtime').getCurrentIdentityId() === 'A', 'Wrong legacy owner');
   check(module('identity-runtime').hasActiveIdentity(), 'Initialization left dispatcher paused');
   check((await module('identity-recovery').listIdentityRecoveryPoints()).length === 0, 'Initialization must not duplicate the whole save');
   await module('identity-recovery').createIdentityRecoveryPoint();
   const nativeUuid = crypto.randomUUID; Object.defineProperty(crypto,'randomUUID',{value:undefined,configurable:true});
   check(/^[a-f0-9-]{36}$/.test(module('identity-space').createIdentityId()),'LAN UUID fallback failed');
   Object.defineProperty(crypto,'randomUUID',{value:nativeUuid,configurable:true});
   module('identity-access').setCharacterIdentityAccess('C', ['A']);
   window.failCloud=true;
   let failed=false;try{await module('identity-lifecycle').switchPhoneIdentity('B')}catch{failed=true}
   check(failed && module('identity-runtime').readIdentityRuntime().activeUserId === 'A','Failed cloud pause switched identity');
   check(module('identity-runtime').hasActiveIdentity(),'Failed switch left A muted');window.failCloud=false;
  });
  const change = async id => {
   await Promise.all([page.waitForNavigation(), page.evaluate(id => module('identity-lifecycle').switchPhoneIdentity(id), id)]);
   await load(); await page.evaluate(() => module('kv-db').hydrateKvDb());
  };
  // Phone hosts consume the cancelable remount event; the retired realm must stay on A.
  await page.evaluate(async()=>{
   const runtime=module('identity-runtime'), controller=new AbortController();runtime.registerIdentityRequest(controller);
   let remounts=0;const host=event=>{event.preventDefault();remounts++};window.addEventListener('float-phone-session-remount',host);
   await module('identity-lifecycle').switchPhoneIdentity('A');check(remounts===0,'Same owner remounted');
   await module('identity-lifecycle').switchPhoneIdentity('B');
   check(remounts===1,'Host did not receive remount');check(controller.signal.aborted,'Old request survived');
   check(runtime.getCurrentIdentityId()==='A'&&runtime.readIdentityRuntime().activeUserId==='B','Retired lease rebound to B');
   let blocked=false;try{runtime.identityLocalStorage.setItem('app-test','late A')}catch{blocked=true}check(blocked,'Late old-realm write accepted');
   window.removeEventListener('float-phone-session-remount',host);
  });
  await page.reload();await load();await page.evaluate(()=>module('kv-db').hydrateKvDb());
  await page.evaluate(async () => {
   const kv = module('kv-db'), runtime = module('identity-runtime');
   check(kv.kvGet('wallet') === null && kv.kvGet('memory:C') === null, 'B sees A data');
   check(runtime.identityLocalStorage.getItem('app-test') === null, 'B sees A local storage');
   check(JSON.parse(kv.kvGet('ai_phone_characters_v1'))[0].id === 'C', 'Shared archive lost');
   check(!module('identity-access').canCurrentIdentityInteract('C'), 'B bypassed whitelist');
   await kv.kvSetAsync('wallet', '200'); await kv.kvSetAsync('memory:C', 'B+C');
   const source={type:'kv',keys:['wallet','memory:C']};
   const exported=await module('idb').exportSource(source);
   check(exported.records.some(row=>row.key==='wallet'&&row.value==='200'),'B export used physical keys/A value');
   check(!exported.records.some(row=>row.value==='100'||row.value==='A+C'),'Export leaked A');
   await kv.kvSetAsync('clear-me','B temporary');
   await module('idb').clearSource({type:'kv',keys:['clear-me']});
   check(kv.kvGet('clear-me')===null,'Private clear did not update cache');
   await kv.kvSetAsync('private-image','asset://B-image');
   const assets = new Dexie('ai_phone_theme_db_v1'); assets.version(1).stores({ assets: 'id' });
   await assets.table('assets').put({id:'B-image',type:'chat_bg',ownerUserId:'B'}); assets.close();
   runtime.identityLocalStorage.setItem('app-test', 'B local');
   const db = new Dexie(runtime.identityDatabaseName('AiPhoneChatDB')); db.version(1).stores({ rows: 'id' });
   check(await db.table('rows').count() === 0, 'B sees A chat DB'); await db.table('rows').put({ id: 'C', relation: 'B+C' }); db.close();
  });
  await change('A');
  await page.evaluate(() => {
   check(module('kv-db').kvGet('wallet') === '100', 'Returning A lost balance');
   check(module('identity-runtime').identityLocalStorage.getItem('app-test') === 'A local', 'Returning A lost local data');
   module('identity-lifecycle').updateIdentityDirectory([{ id: 'A', name: 'Edited' }, { id: 'B' }]);
   module('identity-runtime').assertIdentityActive();
   const controller = new AbortController(); module('identity-runtime').registerIdentityRequest(controller);
   window.testController = controller;
  });
  await page.evaluate(async()=>{
   let remounts=0;const host=event=>{event.preventDefault();remounts++};window.addEventListener('float-phone-session-remount',host);
   const occupied = await new Promise((resolve,reject)=>{const r=indexedDB.open('AiPhoneChatDB');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
   occupied.onversionchange=()=>{};
   let blocked=false;try{await module('identity-lifecycle').deletePhoneIdentity('A')}catch{blocked=true}
   check(blocked, 'Occupied database must leave a retryable deletion');
   const retained=new Dexie('ai_phone_theme_db_v1');await retained.open();
   check(await retained.table('assets').get('A-image'), 'Blocked deletion prematurely removed media');retained.close();
   check(await module('identity-recovery').readIdentityOperation('delete:A'), 'Deletion progress was not persisted');
   const recoveryDb=new Dexie('AiPhoneIdentityRecoveryDB');await recoveryDb.open();
   check((await recoveryDb.table('chunks').toArray()).some(c=>c.database==='AiPhoneChatDB'), 'Blocked deletion prematurely purged recovery');recoveryDb.close();
   occupied.close();
   await module('identity-lifecycle').deletePhoneIdentity('A');
   check(remounts===1&&module('identity-runtime').readIdentityRuntime().activeUserId==='B','Deletion did not request an internal remount after selecting B');
   check(window.testController.signal.aborted,'Delete did not cancel old requests');
   window.removeEventListener('float-phone-session-remount',host);
  });
  await page.reload();
  await load(); await page.evaluate(() => module('kv-db').hydrateKvDb());
  await page.evaluate(async () => {
   check(module('identity-runtime').getCurrentIdentityId() === 'B', 'Deleting A did not select B');
   check(module('kv-db').kvGet('wallet') === '200', 'Deleting A deleted B wallet');
   check(module('kv-db').kvGet('memory:C') === 'B+C', 'Deleting A deleted B memory');
   check(module('identity-access').canCurrentIdentityInteract('C'), 'Empty whitelist not opened');
   check(!(await indexedDB.databases()).some(row => row.name === 'AiPhoneChatDB'), 'A chat database remains');
   check(module('identity-runtime').identityLocalStorage.getItem('app-test') === 'B local', 'Deleting A deleted B local data');
   const assets = new Dexie('ai_phone_theme_db_v1'); assets.version(1).stores({ assets: 'id' });
   check(await assets.table('assets').get('A-image') === undefined, 'A private image remains');
   check(await assets.table('assets').get('B-image') !== undefined, 'B private image deleted');
   check(await assets.table('assets').get('shared-image') !== undefined, 'Shared archive image deleted'); assets.close();
   const backups = new Dexie('AiPhoneIdentityRecoveryDB'); backups.version(1).stores({ points: 'id, createdAt', chunks: 'id, recoveryId' });
   for (const chunk of await backups.table('chunks').toArray()) {
    check(chunk.database !== 'AiPhoneChatDB', 'Deleted A chat remains in backup');
    if (chunk.database === 'AiPhoneKvDB') check(!chunk.rows.some(row => row.key === 'wallet' || row.key === 'memory:C'), 'A private KV remains in backup');
   }
   backups.close();
  });
  await Promise.all([page.waitForNavigation(), page.evaluate(() => module('identity-lifecycle').deletePhoneIdentity('B'))]);
  await load(); await page.evaluate(() => module('kv-db').hydrateKvDb());
  const result = await page.evaluate(() => {
   const kv = module('kv-db'); const identities = JSON.parse(kv.kvGet('ai_phone_user_identities_v1'));
   check(identities.length === 1 && !['A','B'].includes(identities[0].id), 'Last deletion did not create fresh identity');
   check(kv.kvGet('wallet') === null && kv.kvGet('memory:C') === null, 'Default identity inherited old data');
   check(JSON.parse(kv.kvGet('ai_phone_characters_v1'))[0].id === 'C', 'Deleted shared character');
   const controller = new AbortController(); module('identity-runtime').registerIdentityRequest(controller);
   module('identity-runtime').silenceIdentityRuntime();
   check(controller.signal.aborted, 'Pending request not aborted');
   let rejected=false;try{kv.kvSet('wallet','late')}catch{rejected=true}check(rejected,'Late write accepted');
   return true;
  });
  assert.equal(result, true);
  await page.evaluate(async()=>{
   const points=await module('identity-recovery').listIdentityRecoveryPoints();
   const live=new Dexie('AiPhoneKvDB');await live.open();await live.table('entries').put({key:'rollback-sentinel',value:'keep-on-failure'});live.close();
   const nativePut=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(value,...args){if(this.transaction.db.name==='AiPhoneKvDB'&&value.key==='ai_phone_characters_v1')throw new DOMException('Injected quota','QuotaExceededError');return nativePut.call(this,value,...args)};
   let failed=false;try{await module('identity-recovery').restoreIdentityRecoveryPoint(points[0].id)}catch{failed=true}finally{IDBObjectStore.prototype.put=nativePut}
   check(failed,'Restore fault was not exercised');
   const rollback=new Dexie('AiPhoneKvDB');await rollback.open();check(await rollback.table('entries').get('rollback-sentinel'),'Failed database restore destroyed live rows');rollback.close();
   check(await module('identity-recovery').readIdentityOperation('restore'),'Interrupted restore lost progress');
   await module('identity-recovery').restoreIdentityRecoveryPoint(points[0].id);
   const db=new Dexie('AiPhoneKvDB');db.version(1).stores({entries:'key'});
   const rows=await db.table('entries').toArray();
   check(!rows.some(row=>row.key==='wallet'||row.key==='memory:C'||row.key.startsWith('identity:B:')),'Restore resurrected deleted private data');
   check(rows.some(row=>row.key==='ai_phone_characters_v1'),'Restore lost shared archive');db.close();
  });
  console.log('PASS: production runtime/KV/IDB: host-consumed switch/delete remounts preserve immutable leases and abort late writes; same-owner no-op; A/B isolation/return, rename ID, whitelist, delete A retain B, last deletion fresh default; no-host reload fallback. Cloud APIs mocked; no user origin/model calls.');
 } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
