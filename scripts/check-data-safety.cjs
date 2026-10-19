// Real IndexedDB, disposable origin, synthetic data; no model or account calls.
const fs=require('node:fs'),http=require('node:http'),ts=require('typescript'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const paths=['identity-space','identity-runtime','identity-db-guard','phone-session-protocol','identity-lifecycle','identity-recovery','identity-media-cleanup','kv-db','media-cache-storage','photo-album-core','photo-album-discussion','data-management/operation-lock','data-management/idb','data-management/modules','data-management/identity-backup'];
const sources=Object.fromEntries(paths.map(p=>[p.split('/').pop(),ts.transpileModule(fs.readFileSync('lib/'+p+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText]));
(async()=>{
 const server=http.createServer((q,r)=>r.end('<title>Safety regression</title>'));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath: process.env.CHAT_TEST_BROWSER,headless:true});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);await page.addScriptTag({path:require.resolve('dexie')});
  const result=await page.evaluate(async sources=>{
   const mods={}; const check=(v,msg)=>{if(!v)throw Error(msg)};
   const sleep=ms=>new Promise(r=>setTimeout(r,ms));
   const until=async fn=>{for(let i=0;i<200;i++){if(await fn())return;await sleep(20)}throw Error('Timed out')};
   const module=name=>{name=name.split('/').pop();if(name==='dexie')return Dexie;if(mods[name])return mods[name];
    if(name==='photo-album-storage')return {collectPhotoAlbumAssets:()=>[]};
    if(name==='photo-album-permissions')return {getAlbumPermission:()=>({characterIds:[],availableAt:0})};
    if(name==='chat-storage')return {loadChatMessages:()=>[],loadChatSessions:()=>[]};
    if(name==='serializers')return {};
    if(!sources[name])throw Error('Unexpected module '+name);
    const ex=mods[name]={};new Function('exports','require',sources[name])(ex,module);return ex;
   };
   localStorage.setItem('float_identity_runtime_v1',JSON.stringify({version:1,activeUserId:'A',legacyOwnerId:'A',userIds:['A'],deletingUserIds:[],revision:1}));
   const kv=module('kv-db');await kv.hydrateKvDb();
   const nativePut=IDBObjectStore.prototype.put; let failKey='late-key';
   IDBObjectStore.prototype.put=function(value,...args){if(this.transaction.db.name==='AiPhoneKvDB'&&value.key===failKey)throw new DOMException('test quota','QuotaExceededError');return nativePut.call(this,value,...args)};
   localStorage.setItem('late-key','durable-original');kv.registerKvMigration('late-key');await sleep(40);
   check(localStorage.getItem('late-key')==='durable-original','Late migration lost durable source on quota failure');
   failKey='';kv.registerKvMigration('late-key');await until(()=>localStorage.getItem('late-key')===null);
   const db=new Dexie('AiPhoneKvDB');await db.open();check((await db.table('entries').get('late-key')).value==='durable-original','Late migration not committed');
   IDBObjectStore.prototype.put=function(value,...args){const r=nativePut.call(this,value,...args);if(value.key==='race-key')localStorage.setItem('race-key','newer');return r};
   localStorage.setItem('race-key','older');kv.registerKvMigration('race-key');await sleep(40);check(localStorage.getItem('race-key')==='newer','Migration removed a newer source');
   IDBObjectStore.prototype.put=nativePut;
   const raw=JSON.stringify({photo:{assetId:'photo',mediaRef:'data:image/png;base64,'+'A'.repeat(4*1024*1024),label:'synthetic',comments:[{id:'thought',authorId:'C',authorName:'C',kind:'thought',text:'retain',createdAt:'2026-01-01'}],reviewed:{},dueAt:0}});
   await kv.kvSetAsync('ai_phone_album_discussions_v1',raw);
   let attempts=0;
   IDBObjectStore.prototype.put=function(value,...args){if(value.key==='ai_phone_album_discussion_v2:photo'){attempts++;throw new DOMException('test quota','QuotaExceededError')}return nativePut.call(this,value,...args)};
   const album=module('photo-album-discussion');album.loadAlbumDiscussions();await until(()=>attempts>0);await sleep(40);
   check((await db.table('entries').get('ai_phone_album_discussions_v1')).value===raw,'Failed album migration removed legacy copy');
   check(!await db.table('entries').get('ai_phone_album_legacy_media_v1:photo'),'Split transaction partially committed');
   IDBObjectStore.prototype.put=nativePut;
   // Reload only the module to retry its backoff; the persisted database is unchanged.
   delete mods['photo-album-discussion'];const album2=module('photo-album-discussion');album2.loadAlbumDiscussions();
   await until(async()=>!await db.table('entries').get('ai_phone_album_discussions_v1'));
   const archive=JSON.parse((await db.table('entries').get('ai_phone_album_legacy_media_v1:photo')).value);
   check((await module('media-cache-storage').loadMediaBlob(archive.mediaRef)).blob.size===3*1024*1024,'Legacy photo bytes not preserved');
   let bytes=0;
   IDBObjectStore.prototype.put=function(value,...args){if(this.transaction.db.name==='AiPhoneKvDB')bytes+=(value.value||'').length;return nativePut.call(this,value,...args)};
   for(let i=0;i<10;i++)album2.saveAlbumDiscussion({...album2.loadAlbumDiscussions().photo,dueAt:i});await sleep(80);
   IDBObjectStore.prototype.put=nativePut;
   check(bytes<16000,'Small album updates still rewrite embedded image');
   check(album2.loadAlbumDiscussions().photo.comments[0].text==='retain','Migration lost thought');
   await kv.kvSetAsync('chat-app-character-avatars-v1','long-lived');await kv.kvSetAsync('listening-library-v1','long-lived');await kv.kvSetAsync('unknown-future-data','also-long-lived');
   const definitions=module('modules').DATA_MODULES;
   for(const source of definitions.find(m=>m.id==='cache').sources)await module('idb').clearSource(source);
   check((await db.table('entries').get('chat-app-character-avatars-v1')).value==='long-lived','Cache cleanup removed avatar history');
   check((await db.table('entries').get('unknown-future-data')).value==='also-long-lived','Cache cleanup removed unclassified data');
   check(definitions.find(m=>m.id==='apps').sources.some(s=>s.keys?.includes('listening-library-v1')),'Listening library not classified');
   db.close();return {lateMigration:'quota + stale-source passed',album:'transaction rollback + Blob migration + thoughts preserved',smallUpdateBytes:bytes,cache:'long-term + unknown data retained'};
  },sources);console.log(JSON.stringify(result,null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
