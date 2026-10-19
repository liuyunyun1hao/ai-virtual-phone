const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the actual message-run calculation with minimal rendering dependencies.
const source = fs.readFileSync(path.join(__dirname, '../components/chat/chat-room.tsx'), 'utf8');
const start = source.indexOf('const imessageTailMessageIds = useMemo(');
const end = source.indexOf('const getSelectableStoredMessageId', start);
assert.ok(start > 0 && end > start);
const code = ts.transpileModule(source.slice(start, end) + '\nglobalThis.result = imessageTailMessageIds;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
function runs(messages, isGroup = true) {
    const context = {
        useMemo: fn => fn(), projectedMessages: messages,
        session: { isGroup, contactId: 'private' }, voiceCallGroups: { memberSet: new Set() },
        getMessageDisplayContent: m => m.content || '',
        getChatFlowVisibleContent: (m, text) => text,
        isHiddenChatFlowMessage: m => !!m.hidden,
        isStandaloneHtmlPreviewContent: () => false,
        uiRole: m => m.role,
        shouldShowTimestamp: (a, b) => Number(a) - Number(b) >= 300000,
    };
    vm.runInNewContext(code, context);
    return Object.fromEntries(Object.entries(context.result).map(([key, set]) => [key, [...set]]));
}
const msg = (id, sender = 'a', mediaType, extra = {}) => ({ id, role: 'assistant', senderCharacterId: sender, createdAt: '0', content: mediaType ? '' : id, mediaType, ...extra });
assert.deepEqual(runs([msg('a1'), msg('a2'), msg('sticker', 'a', 'sticker')]), {
    firstIds: ['a1'], lastIds: ['sticker'], tailIds: ['a2'],
});
assert.deepEqual(runs([msg('card', 'a', 'transfer'), msg('sticker', 'a', 'sticker')]), {
    firstIds: ['card'], lastIds: ['sticker'], tailIds: [],
});
assert.deepEqual(runs([msg('a1'), msg('b1', 'b'), msg('a2')]), {
    firstIds: ['a1', 'b1', 'a2'], lastIds: ['a1', 'b1', 'a2'], tailIds: ['a1', 'b1', 'a2'],
});
assert.deepEqual(runs([msg('a1'), msg('hidden', 'a', undefined, { hidden: true }), msg('a2')]), {
    firstIds: ['a1'], lastIds: ['a2'], tailIds: ['a2'],
});
assert.equal(runs([msg('a1'), msg('notice', 'a', undefined, { role: 'system' }), msg('a2')]).firstIds.length, 2);
assert.equal(runs([msg('a1'), msg('a2', 'a', undefined, { createdAt: '300001' })]).firstIds.length, 2);
assert.equal(runs([msg('old1', '', undefined, { senderName: 'A' }), msg('old2', '', undefined, { senderName: 'B' })]).firstIds.length, 2);
assert.deepEqual(runs([msg('a1'), msg('a2')], false).tailIds, ['a2']);
console.log('PASS: group run boundaries, card/sticker endings, hidden messages, timestamps and private tails');
const previewSource = fs.readFileSync(path.join(__dirname, '../lib/stream-preview.ts'), 'utf8');
const splitFunction = previewSource.match(/export function splitStreamPreviewSegments\(text: string\): string\[\] \{[\s\S]*?\n\}/)?.[0];
assert.ok(splitFunction);
const splitContext = { exports: {} };
vm.runInNewContext(ts.transpileModule(splitFunction, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, splitContext);
assert.equal(splitContext.exports.splitStreamPreviewSegments('宝贝，早安。\n睡够了没，嗯？\n爸爸惦记你一晚上了。').length, 1);
assert.equal(splitContext.exports.splitStreamPreviewSegments('宝贝，早安。\n\n睡够了没，嗯？\n\n爸爸惦记你一晚上了。').length, 3);
console.log('PASS: actual stream splitter preserves single newlines and splits blank-line-separated messages');
