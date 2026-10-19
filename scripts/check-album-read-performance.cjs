// Exercise production album scheduling with a 7,230-message synthetic history.
// Legacy mode restores only the three old session-read calls for comparison.
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
function pick(file, names) {
  const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  return ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text)).map(n => n.getText(ast)).join('\n');
}
function run(code, globals) {
  const box = { exports: {}, ...globals };
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, box);
  return box.exports;
}
async function measure(legacy) {
  let scans = 0, participantReads = 0;
  const sessions = Array.from({ length: 11 }, (_, i) => ({ id: `s${i}`, contactId: `c${i}` }));
  const messages = Array.from({ length: 7230 }, (_, i) => ({ id: `m${i}`, sessionId: `s${i % 11}`, order: i, content: 'synthetic', createdAt: '2026-01-01', role: 'user' }));
  const assets = Array.from({ length: 103 }, (_, i) => ({ id: `photo${i}`, source: { kind: 'chat', sessionId: `s${i % 11}` } }));
  const chat = run(pick('lib/chat-storage.ts', ['getStableMessageOrder', 'getMessageTimeValue', 'compareChatMessages', 'getSortedSessionMessages', 'getLastVisibleSessionMessage', 'refreshSessionPreviewMetadata', 'loadChatSessions', 'getChatSessionMetadata']), {
    _sessionsCache: sessions, _hydrated: false,
    _loadAllMessages: () => { scans++; return messages; },
    isSessionPreviewCandidate: () => true, getChatMessagePreview: msg => msg.content,
    normalizeChatSessions: items => ({ items, redirects: new Map(), changed: false }),
    redirectMessagesToPreferredSessions: () => 0,
  });
  const discussion = run(pick('lib/photo-album-discussion.ts', ['albumParticipants']).replaceAll('getChatSessionMetadata', legacy ? 'loadChatSessions' : 'getChatSessionMetadata'), { ...chat });
  const participants = asset => { participantReads++; return discussion.albumParticipants(asset); };
  const modules = {
    './chat-storage': chat,
    './photo-album-storage': { collectPhotoAlbumAssets: () => assets },
    './photo-album-discussion': { albumParticipants: participants, queueAlbumReview: participants, loadAlbumDiscussions: () => ({}) },
    './photo-album-core': { reconcilePhotoAccess: (all, getParticipants) => all.forEach(getParticipants) },
    './kv-db': { kvGet: () => null },
  };
  const review = run(fs.readFileSync('lib/photo-album-review.ts', 'utf8').replaceAll('getChatSessionMetadata', legacy ? 'loadChatSessions' : 'getChatSessionMetadata'), {
    require: name => modules[name] || {}, document: { hidden: false }, window: {}, AbortController, setTimeout,
  });
  const start = performance.now(); await review.reviewNextAlbumPhoto();
  return { ms: Math.round(performance.now() - start), historyScans: scans, participantReads };
}
(async () => {
  const before = await measure(true), after = await measure(false);
  assert(before.historyScans > 1000, 'Legacy fixture must reproduce repeated history scans');
  assert.equal(after.historyScans, 0, 'Album metadata checks must not read message histories');
  assert.equal(after.participantReads, before.participantReads, 'Access checks were skipped');
  console.log(JSON.stringify({ before, after, note: 'Synthetic album preparation only; not whole-app speed or phone FPS.' }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
