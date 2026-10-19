const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
const source = fs.readFileSync('components/chat/share-destination-sheet.tsx', 'utf8');
const ast = ts.createSourceFile('share.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let expression;
function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'confirm') expression = node.initializer.getText(ast); ts.forEachChild(node, visit); }
visit(ast);
const session = { id: 'actual-session', contactId: 'person' };
function setup(target) {
    const calls = [], submitting = { current: false }, destination = { current: '' };
    const context = { target, ready: true, submitting, sentDestination: destination, identity: { current: 'owner' }, getCurrentIdentityId: () => 'owner',
        payload: { type: 'music', title: 'Test', artist: 'Artist', coverUrl: 'cover' }, note: 'note', excerpt: 'lyrics', audienceIds: ['person'],
        addMomentPost: data => { calls.push(['post', data]); return { id: 'post' }; }, onUserPost: () => {},
        loadChatSessions: () => [session], loadChatContacts: () => [{ characterId: 'person' }], canCurrentIdentityInteract: () => true,
        createOrGetSession: () => session, canShare: () => true, pushChatMessage: data => calls.push(['message', data]),
        window: { dispatchEvent() {} }, CustomEvent: function() {}, setSent: value => calls.push(['sent', value]), setError: error => calls.push(['error', error]),
    };
    const code = ts.transpileModule(`const confirm = ${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    return { confirm: vm.runInNewContext(code + ';confirm', context), destination, calls };
}
const moments = setup(null);
moments.confirm('moments'); moments.confirm('moments');
assert.equal(moments.calls.filter(c => c[0] === 'post').length, 1);
assert.equal(moments.destination.current, 'moments');
const chat = setup({ id: 'contact:person', contactId: 'person' });
chat.confirm();
assert.equal(chat.destination.current, 'actual-session');
assert.equal(chat.calls.filter(c => c[0] === 'message').length, 1);
assert.doesNotMatch(source, /已发送到对话|已发布到朋友圈|setTarget\("moments"\)/);
assert.match(source, /onView\(sentDestination.current\)/);
console.log('PASS: direct moments publish, duplicate guard, resolved private-chat destination and go-view wiring; synthetic storage only.');

const phoneSource = fs.readFileSync('components/chat/phone-chat-app.tsx', 'utf8');
const phoneAst = ts.createSourceFile('phone.tsx', phoneSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const effects = [];
function collectEffects(node) {
    if (ts.isCallExpression(node) && node.expression.getText(phoneAst) === 'useEffect') effects.push(node);
    ts.forEachChild(node, collectEffects);
}
collectEffects(phoneAst);
const sessionEffect = effects.find(node => node.arguments[1]?.getText(phoneAst) === '[initialSessionId, dbReady, sessionRequest]');
assert.ok(sessionEffect, 'session destination must react to hydration and repeat requests');
const state = { dbReady: false, sharePayloadRef: { current: null }, initialSessionId: session.id,
    loadChatSessions: () => [session], setActiveMascot: () => {},
    setActiveSession: value => state.opened = value, setActiveTab: value => state.tab = value };
function runEffect(effect) {
    const code = ts.transpileModule(`(${effect.arguments[0].getText(phoneAst)})()`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, state);
}
runEffect(sessionEffect);
assert.equal(state.opened, undefined);
state.dbReady = true;
runEffect(sessionEffect);
assert.equal(state.opened.id, session.id);
state.opened = null;
runEffect(sessionEffect);
assert.equal(state.opened.id, session.id, 'repeat request reopens the same session');
state.initialSessionId = null;
state.feedsRequest = 1;
const feedsEffect = effects.find(node => node.arguments[1]?.getText(phoneAst) === '[dbReady, feedsRequest, initialSessionId]');
assert.ok(feedsEffect);
runEffect(feedsEffect);
assert.equal(state.tab, 'feeds');
assert.equal(state.opened, null);
console.log('PASS: actual navigation effects cover delayed hydration, repeat chat destination, and Moments feed.');
