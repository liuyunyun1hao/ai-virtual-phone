const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
function load(file) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: () => ({}) });
    return exports;
}
const { lyricRange, activeLyricIndex } = load('lib/lyric-selection.ts');
const { parseTimedLyrics, createMusicListeningContext, musicListeningHistoryText } = load('lib/music-listening.ts');
const lines = parseTimedLyrics('[00:01.00]First\n[00:02.00]\n[00:02.50]Second\n[00:03.00]Third');
assert.equal(activeLyricIndex(lines, .999), -1);
assert.equal(activeLyricIndex(lines, 1), 0);
assert.equal(activeLyricIndex(lines, 2), 1); // Instrumental gap stays blank.
assert.equal(activeLyricIndex(lines, 2.5), 2);
assert.equal(activeLyricIndex(lines, 1.5), 0); // Seeking back.
assert.equal(activeLyricIndex([], 50), -1);
assert.equal(lyricRange(lines, 0, 3).map(l => l.text).join('\n'), 'First\nSecond\nThird');
assert.equal(lyricRange(lines, 3, 0).map(l => l.text).join('\n'), 'First\nSecond\nThird');
assert.equal(lyricRange(lines, 2, 2).length, 1);
const selectedLines = lyricRange(lines, 0, 3);
const context = createMusicListeningContext({ currentTrack: { id: 'test', title: 'Test', artist: 'Test', lyrics: '' }, currentTime: 15, isPlaying: true }, 'test', 'now', lines[0]);
const history = musicListeningHistoryText({ role: 'user', listeningContext: { ...context, selectedLines, reference: { time: 1, text: selectedLines.map(l => l.text).join('\n') } } }, '');
assert.match(history, /明确引用 00:01：First/);
assert.match(history, /明确引用 00:02：Second/);
assert.match(history, /明确引用 00:03：Third/);
const { lyricColorFromPixels } = load('lib/lyric-card-color.ts');
assert.equal(lyricColorFromPixels([0, 0, 0, 255]).color, '#fff');
assert.equal(lyricColorFromPixels([255, 255, 255, 255]).color, '#000');
assert.equal(lyricColorFromPixels([20, 80, 190, 255, 20, 80, 190, 255, 255, 0, 0, 255]).background, 'rgb(20,80,190)');
assert.equal(lyricColorFromPixels([0, 0, 0, 0]).background, '#eadde3');
const palette = (...entries) => lyricColorFromPixels(entries.flatMap(([rgb, count, alpha = 255]) => Array.from({ length: count }, () => [...rgb, alpha]).flat()));
const black = [8, 8, 8], grey = [120, 120, 120], white = [250, 250, 250], orange = [210, 130, 40];
assert.equal(palette([black, 60], [orange, 40]).background, 'rgb(210,130,40)', 'skip first neutral');
assert.equal(palette([black, 50], [grey, 30], [orange, 20]).background, 'rgb(210,130,40)', 'third candidate');
assert.equal(palette([black, 40], [grey, 30], [white, 20], [orange, 10]).background, 'rgb(8,8,8)', 'do not search fourth candidate');
assert.equal(palette([black, 96], [orange, 4]).background, 'rgb(8,8,8)', 'ignore tiny accent');
assert.equal(palette([black, 95], [orange, 5]).background, 'rgb(210,130,40)', '5% boundary');
assert.equal(palette([black, 95, 0], [orange, 5]).background, 'rgb(210,130,40)', 'coverage excludes transparent pixels');
assert.equal(palette([black, 6], [grey, 5], [white, 4], [[200,120,40], 3], [[220,140,50], 3]).background, 'rgb(210,130,45)', 'merge shades before ranking');
assert.equal(palette([[5, 10, 25], 60], [orange, 40]).background, 'rgb(210,130,40)', 'reject near-black colour');
assert.equal(palette([white, 60], [grey, 40]).background, 'rgb(250,250,250)', 'monochrome keeps dominant shade');
for (let value = 0; value <= 255; value++) {
    const result = lyricColorFromPixels([value, value, value, 255]);
    const s = value / 255, l = s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
    const contrast = result.color === '#000' ? (l + .05) / .05 : 1.05 / (l + .05);
    assert.ok(contrast >= 4.5, `contrast ${value}`);
}
// Execute the actual JSX pointer callbacks with a synthetic pointer/container.
const file = fs.readFileSync('components/music/music-player.tsx', 'utf8');
const ast = ts.createSourceFile('player.tsx', file, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = {};
function visit(node) {
    if (ts.isJsxOpeningElement(node) && node.attributes.properties.some(p => ts.isJsxAttribute(p) && p.name.getText(ast) === 'className' && p.initializer?.text === 'mp-lyric-seek')) {
        for (const prop of node.attributes.properties) if (ts.isJsxAttribute(prop) && prop.initializer && ts.isJsxExpression(prop.initializer) && prop.initializer.expression) handlers[prop.name.getText(ast)] = prop.initializer.expression.getText(ast);
    }
    ts.forEachChild(node, visit);
}
visit(ast);
let timer, captured = false, selection = null, preview = false;
const press = { current: { x: 0, y: 0, consumed: false } };
const rangeRef = { current: null };
const env = { lyricPress: press, selectionRef: rangeRef, i: 1, line: { text: 'Second' }, scrollFrame: { current: 0 }, manualScrollUntil: { current: 0 },
    cancelAnimationFrame() {}, cancelLyricPress() { timer = null; press.current.timer = undefined; },
    setSelectedLyric() { preview = false; }, setSelection(value) { selection = value; }, setPressingLyric() {}, setDragSelecting() {},
    setTimeout(fn) { timer = fn; return 1; }, finishLyricRange() { preview = true; },
    lyricsContainerRef: { current: { scrollTop: 0, getBoundingClientRect: () => ({ top: 0, bottom: 400 }), children: [0, 1, 2, 3].map(index => ({ getBoundingClientRect: () => ({ top: index * 80, bottom: index * 80 + 60 }) })) } },
};
const call = (name, event) => { const code = ts.transpileModule(`const handler = ${handlers[name]}; handler(event);`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText; vm.runInNewContext(code, { ...env, event }); };
const event = y => ({ button: 0, pointerId: 1, clientX: 10, clientY: y, currentTarget: { setPointerCapture() { captured = true; }, hasPointerCapture() { return captured; } } });
call('onPointerDown', event(110)); assert.ok(timer); assert.equal(preview, false);
timer(); assert.equal(press.current.selecting, true); assert.equal(preview, false);
call('onPointerMove', event(270)); assert.equal(selection.join(','), '1,3');
call('onPointerMove', event(30)); assert.equal(selection.join(','), '1,0');
call('onPointerUp', event(30)); assert.equal(preview, true); assert.equal(press.current.selecting, false);
call('onPointerDown', event(110)); call('onPointerMove', event(70)); assert.equal(timer, null); assert.equal(press.current.consumed, true); assert.equal(preview, false);
call('onPointerDown', event(110)); timer(); call('onPointerCancel', event(110)); assert.equal(selection, null); assert.equal(press.current.selecting, false);
console.log('PASS: real hold/drag/release/cancel callbacks, timing boundaries/seek, both range directions, multi-line context, dominant color/fallback and contrast. No API calls.');
