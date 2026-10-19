const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
let now = 1_000_000, scans = 0, tick, lock = null;
const listeners = new Map();
const doc = {hidden: false};
const win = {
  addEventListener(name, fn) { listeners.set(name, fn); },
  removeEventListener(name) { listeners.delete(name); },
};
class Clock extends Date { static now() { return now; } }
const modules = {
  './photo-album-discussion': {loadAlbumDiscussions: () => ({}), ALBUM_REVIEW_REQUESTED: 'review'},
  './photo-album-storage': {collectPhotoAlbumAssets: () => { scans++; return []; }, getPhotoAlbumSourceUpdatedEvents: () => ['source'], PHOTO_ALBUM_UPDATED_EVENT: 'album'},
  './photo-album-core': {reconcilePhotoAccess() {}},
  './chat-storage': {loadChatSessions: () => { throw new Error("Album must not scan every chat history"); }, getChatSessionMetadata: () => [{id: 'chat'}]},
  './kv-db': {kvGet: () => lock},
  './bg-timer': {bgSetInterval: fn => { tick = fn; return () => {}; }},
};
const box = {exports: {}, require: key => modules[key] || {}, window: win, document: doc, Date: Clock, AbortController, setTimeout};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/photo-album-review.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, box);
async function step(ms = 5000) { now += ms; tick(); await new Promise(resolve => setImmediate(resolve)); }
(async () => {
  box.exports.startAlbumReviewService();
  assert.equal(scans, 0, 'Startup must yield to foreground loading');
  await step(15001);
  assert.equal(scans, 1);
  for (let i = 0; i < 5; i++) await step();
  assert.equal(scans, 1, 'Unchanged five-second ticks must not collect photos');
  listeners.get('input')(); listeners.get('source')();
  await step(); assert.equal(scans, 1, 'Typing must defer dirty work');
  await step(15001); assert.equal(scans, 2, 'Pending work resumes after input quiet period');
  lock = JSON.stringify({startedAt: now}); listeners.get('source')();
  await step(20000); assert.equal(scans, 2, 'Chat generation takes priority');
  lock = JSON.stringify({startedAt: now - 300001});
  await step(); assert.equal(scans, 3, 'Expired generation locks do not starve album');
  doc.hidden = true; listeners.get('source')();
  await step(70000); assert.equal(scans, 3, 'Hidden pages do no album work');
  doc.hidden = false; await step(); assert.equal(scans, 4);
  box.exports.stopAlbumReviewService();
  assert.equal(listeners.size, 0, 'Cleanup removes all listeners');
  console.log('PASS: album idle ticks, typing deferral/resume, generation priority, stale locks, hidden pages and cleanup');
})().catch(error => { console.error(error); process.exitCode = 1; });
