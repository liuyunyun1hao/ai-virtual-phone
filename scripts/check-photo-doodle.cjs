const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
const code = ts.transpileModule(fs.readFileSync('lib/photo-doodle.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const mod = {exports:{}};
new Function('exports','require','module',code)(mod.exports,require,mod);
const {parsePhotoDoodle} = mod.exports;
const raw = JSON.stringify({photo:3,intent:'粉花青叶',strokes:[
  {type:'heart',color:'粉色',fill:'#f5a8bd',width:2,opacity:.6},
  {type:'path',path:'M 60 40 Q 72 28 80 42 Q 68 46 60 40 Z',color:'#43898d'},
]},null,2);
const data = parsePhotoDoodle(raw);
assert.equal(data.photoMarkTargetIndex,2);
assert.equal(data.photoMarkStrokes.length,2);
assert.equal(data.photoMarkStrokes[0].width,.02);
assert.equal(data.photoMarkStrokes[0].opacity,.6);
assert.equal(data.photoMarkStrokes[0].fill,'#f5a8bd');
assert.equal(data.photoMarkStrokes[1].color,'#43898d');
assert.deepEqual(parsePhotoDoodle('not json'),{});
assert.deepEqual(parsePhotoDoodle('{"strokes":[{"type":"path","path":"<script>bad</script>"}]}'),{});
const rough = require('roughjs/bundled/rough.cjs.js').default || require('roughjs/bundled/rough.cjs.js');
const g = rough.generator();
const options = {seed:77,stroke:'#43898d',roughness:.18};
assert.deepEqual(g.toPaths(g.path(data.photoMarkStrokes[1].doodlePath,options)),g.toPaths(g.path(data.photoMarkStrokes[1].doodlePath,options)));
console.log('PASS: multicolor, fill, width, opacity, target photo, invalid input, deterministic path rendering');
