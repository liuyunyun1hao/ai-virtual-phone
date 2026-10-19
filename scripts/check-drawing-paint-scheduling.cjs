const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), ts = require('typescript');
// Execute the actual component with deterministic hooks/frames; no accounts or models.
let slots = [], cursor = 0, reads = 0, paints = [], frames = new Map(), nextFrame = 0, cleanups = [];
const store = new Map();
const hooks = {
  useRef(value) { const i = cursor++; return slots[i] ||= { current: value }; },
  useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
  useEffect(fn) { const i = cursor++; if (!(i in slots)) { slots[i] = true; const cleanup = fn(); if (cleanup) cleanups.push(cleanup); } },
  useLayoutEffect() { cursor++; },
};
const jsx = (type, props) => ({ type, props });
const core = { DRAWING_PALETTE: ['#191919'], DRAWING_MAX_WIDTH: 80, drawBoard: (_c, strokes) => paints.push(JSON.parse(JSON.stringify(strokes))), drawingSummary: () => '' };
const mocks = {
  react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx },
  'lucide-react': new Proxy({}, { get: () => () => null }),
  '@/lib/kv-db': { kvGet: k => { reads++; return store.get(k); }, kvSet: (k,v) => store.set(k,v), kvRemove: k => store.delete(k) },
  '@/lib/chat-drawing': core,
  '@/lib/chat-drawing-model': { requestDrawingTurn: () => { throw Error('unexpected model call'); } },
  '@/lib/chat-drawing-group': { requestGroupDrawingRound: () => { throw Error('unexpected group call'); } },
  '@/lib/abort-utils': {},
};
const exportsObj = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(process.env.DRAWING_BOARD_SOURCE || 'components/chat/drawing-board.tsx','utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
  exports: exportsObj, require: id => { assert(id in mocks, id); return mocks[id]; },
  requestAnimationFrame: fn => { const id = ++nextFrame; frames.set(id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id),
  window: { addEventListener() {}, removeEventListener() {} }, setTimeout, clearTimeout, AbortController, DOMException,
});
const canvas = { getBoundingClientRect: () => ({ left:0, top:0, width:600, height:800 }), toDataURL: () => 'snapshot' };
const workspace = { setPointerCapture() {}, hasPointerCapture: () => false };
let sent;
const props = { session:{id:'s'}, characters:[], history:[], onClose() {}, onSend: (_image,_summary,process) => { sent = process; return true; } };
function walk(node, predicate) { if (!node || typeof node !== 'object') return; if (predicate(node)) return node; for (const child of [node.props?.children].flat(Infinity)) { const found = walk(child,predicate); if (found) return found; } }
function render() { cursor = 0; const tree = exportsObj.DrawingBoard(props); walk(tree,n => n.type === 'canvas').props.ref.current = canvas; return tree; }
const event = x => ({ button:0, pointerId:1, clientX:x, clientY:30, pressure:.5, pointerType:'mouse', target:canvas, currentTarget:workspace, preventDefault() {}, nativeEvent:{clientX:x,clientY:30,pressure:.5,pointerType:'mouse'} });
let tree = render();
for (let i=0;i<10;i++) tree = render();
assert.equal(reads,1,'rerenders do not reread/parse the draft');
let area = walk(tree,n => n.props?.className === 'drawing-workspace').props;
area.onPointerDown(event(10));
const start = paints.length;
for (let x=11;x<=30;x++) area.onPointerMove(event(x));
assert.equal(paints.length,start,'moves wait for the next frame');
assert.equal(frames.size,1,'burst schedules only one frame');
for (const [id,fn] of [...frames]) { frames.delete(id); fn(); }
assert.equal(paints.length,start+1);
assert.equal(paints.at(-1)[0].points.length,21,'all sampled points survive frame coalescing');
area.onPointerUp(event(30));
assert.equal(JSON.parse(store.get('chat-drawing-draft:s')).strokes[0].points.length,21,'release saves complete stroke');
tree = render(); area = walk(tree,n => n.props?.className === 'drawing-workspace').props;
area.onPointerDown(event(40)); area.onPointerMove(event(50));
assert.equal(frames.size,1);
walk(render(),n => n.props?.['aria-label'] === '发送画板').props.onClick();
assert.equal(frames.size,0,'send flushes pending frame');
assert.equal(sent.strokes[1].points.length,2,'snapshot includes final pending points');
assert.equal(paints.at(-1)[1].points.length,2);
for(const cleanup of cleanups) cleanup();
assert.equal(store.has('chat-drawing-draft:s'),false,'unmount does not restore sent draft');
// A fresh unsent mount cancels its pending paint and saves on unmount.
slots=[]; cleanups=[]; tree=render(); area=walk(tree,n=>n.props?.className==='drawing-workspace').props;
area.onPointerDown(event(10)); area.onPointerMove(event(20));
for(const cleanup of cleanups) cleanup();
assert.equal(frames.size,0);
assert.equal(JSON.parse(store.get('chat-drawing-draft:s')).strokes[0].points.length,2);
console.log('PASS: one draft read, burst coalescing without dropped points, release save, send flush, unmount cancellation/persistence');
