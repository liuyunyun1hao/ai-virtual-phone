const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync('lib/music-share-resolution.ts', 'utf8');
const transformed = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const matchExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/music-song-match.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {exports:matchExports});
const exportsObject = {};
vm.runInNewContext(transformed, { exports: exportsObject, require: name => name.endsWith('music-song-match') ? matchExports : name.endsWith('music-service') ? {} : name.endsWith('music-storage') ? {} : require(name) });
const { selectSharedSong } = exportsObject;
const rows = [
  { source:'netease', title:'Sway', artist:'Michael Bublé', neteaseResult:{ id: 1, name:'Sway', artists:'Michael Bublé', album:'Call Me Irresponsible', duration: 180000, coverUrl:'https://cover/1.jpg' } },
  { source:'netease', title:'Sway', artist:'Dean Martin', neteaseResult:{ id: 2, name:'Sway', artists:'Dean Martin', album:'Classic', duration: 180000, coverUrl:'https://cover/2.jpg' } },
];
assert.equal(selectSharedSong(rows, 'Sway', 'Michael Bublé').neteaseResult.id, 1);
assert.equal(selectSharedSong(rows, 'Sway', 'Dean Martin').neteaseResult.id, 2);
assert.equal(selectSharedSong(rows, 'Sway').neteaseResult.id, 1);
assert.equal(selectSharedSong(rows, 'Unknown'), null);
assert.equal(selectSharedSong(rows, 'Sway', 'Other singer'), null);
console.log('PASS: artist-qualified selection, title-only search ranking and unrelated-song rejection.');

const service = fs.readFileSync('lib/music-service.ts','utf8');
const ast=ts.createSourceFile('service.ts',service,ts.ScriptTarget.Latest,true);
const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text==='findPlayableMatch');
let candidates=rows; const probed=[]; const playableExports={};
vm.runInNewContext(ts.transpileModule(fn.getText(ast), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
 exports:playableExports, music_song_match_1:matchExports, matchesSharedSong:matchExports.matchesSharedSong,
 unifiedSearch:async()=>candidates, getNeteasePlayUrl:async id=>{probed.push(id);return id===2?'audio-url':null;}
});
(async()=>{
 assert.equal((await playableExports.findPlayableMatch('Sway')).result.neteaseResult.id,2);
 probed.length=0;
 assert.equal(await playableExports.findPlayableMatch('Sway','Michael Bublé'),null);
 assert.deepEqual(probed,[1]);
 candidates=[{source:'local',title:'Other',artist:'Other',localTrack:{id:'unrelated'}},...rows];
 assert.equal((await playableExports.findPlayableMatch('Sway','Dean Martin')).result.neteaseResult.id,2);
 console.log('PASS: playable fallback stays within requested title/artist; unrelated local tracks excluded.');
})().catch(e=>{console.error(e);process.exitCode=1});
