const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), ts = require('typescript');
function load(path, dependencies = {}) {
    const sandbox = { exports: {}, URL, Date, Map, Set, window: {}, require: id => {
        if (!(id in dependencies)) throw Error(`Unexpected dependency: ${id}`);
        return dependencies[id];
    }};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, sandbox);
    return sandbox.exports;
}
const { parseStickerImport: parse, uniqueStickerNames: unique } = load('lib/sticker-import-parser.ts');
const plain = x => JSON.parse(JSON.stringify(x));
function check(text, expected) { assert.deepEqual(plain(parse(text).rows), expected.map(([name, url]) => ({ name, url }))); }
check('贴贴：https://img.test/a.jpg\r\n可爱 https://img.test/b.gif', [['贴贴','https://img.test/a.jpg'],['可爱','https://img.test/b.gif']]);
check('比格捏住鼻子--\nhttps://s3.bmp.ovh/imgs/2026/01/03/24c9d907af709853.png', [['比格捏住鼻子','https://s3.bmp.ovh/imgs/2026/01/03/24c9d907af709853.png']]);
check('1. 贴贴\nhttps://img.test/a.jpg\n2、可爱\nhttps://img.test/b.gif', [['贴贴','https://img.test/a.jpg'],['可爱','https://img.test/b.gif']]);
check('贴贴 https://img.test/a.jpg 可爱 https://img.test/b.gif', [['贴贴','https://img.test/a.jpg'],['可爱','https://img.test/b.gif']]);
check('贴贴:https://img.test/a.jpg;可爱:https://img.test/b.gif', [['贴贴','https://img.test/a.jpg'],['可爱','https://img.test/b.gif']]);
check('{"name":"贴贴","url":"https://img.test/a.jpg"}\n{"name":"可爱","url":"https://img.test/b.gif"}', [['贴贴','https://img.test/a.jpg'],['可爱','https://img.test/b.gif']]);
check('![贴贴](https://img.test/a.jpg)\n[可爱](https://img.test/b.gif)', [['贴贴','https://img.test/a.jpg'],['可爱','https://img.test/b.gif']]);
check('| 贴贴 | https://img.test/a.jpg |\n| 可爱 | https://img.test/b.gif |', [['贴贴','https://img.test/a.jpg'],['可爱','https://img.test/b.gif']]);
check('"贴贴","https://img.test/a.jpg"\n"可爱","https://img.test/b.gif"', [['贴贴','https://img.test/a.jpg'],['可爱','https://img.test/b.gif']]);
check('```json\n{"stickers":[{"description":"贴贴","url":"https://img.test/a.jpg"},{"url":"https://img.test/b.gif","name":"可爱"}]}\n```', [['贴贴','https://img.test/a.jpg'],['可爱','https://img.test/b.gif']]);
check('{"贴贴":"https://img.test/a.jpg","可爱":"https://img.test/b.gif"}', [['贴贴','https://img.test/a.jpg'],['可爱','https://img.test/b.gif']]);
check('{"stickers":{"贴贴":"https://img.test/a.jpg"}}', [['贴贴','https://img.test/a.jpg']]);
check('签名 https://img.test/a.gif?token=abc!', [['签名','https://img.test/a.gif?token=abc!']]);
check('[["贴贴","https://img.test/a.jpg"],["可爱","https://img.test/b.gif"]]', [['贴贴','https://img.test/a.jpg'],['可爱','https://img.test/b.gif']]);
check('签名 https://img.test/a_(1).gif?token=abc%2Bdef&x=1;2#view', [['签名','https://img.test/a_(1).gif?token=abc%2Bdef&x=1;2#view']]);
check('https://img.test/a.gif', [['a','https://img.test/a.gif']]);
assert.equal(parse('a https://img.test/a.gif\nb https://img.test/a.gif').duplicates, 1);
assert.equal(parse('a https://[bad\nb https://img.test/b.gif').invalid, 1);
assert.equal(parse('a javascript:alert(1)').rows.length, 0);
assert.equal(parse('a https://user:password@img.test/a.gif').rows.length, 0);
const many = parse(Array.from({length: 1000}, (_, i) => `描述${i} https://img.test/${i}.gif?token=a%2Bb`).join('\n'));
assert.equal(many.rows.length, 1000);
assert.equal(many.rows[999].name, '描述999');
assert.deepEqual(plain(unique([{name:'贴贴',url:'a'},{name:'贴贴',url:'b'}], ['贴贴'])).map(r => r.name), ['贴贴 (2)','贴贴 (3)']);
let packs = JSON.stringify([{id:'p',stickers:[{id:'old',name:'已有',assetId:'old'}]}]), writes = 0;
const storage = load('lib/custom-sticker-storage.ts', {
    './kv-db': {registerKvMigration(){}, kvGet: () => packs, kvSet: (_, value) => { writes++; packs=value; }},
    './theme-storage': {isAnimatedImageBlob: () => true, saveThemeAssetFromBlob: async blob => { if (blob === 'bad') throw Error('bad image'); return 'asset'; }},
});
assert.equal(storage.addStickerUrlsToPack('p', many.rows), 1000);
assert.equal(writes, 1);
assert.equal(JSON.parse(packs)[0].stickers.length, 1001);
assert.equal(new Set(JSON.parse(packs)[0].stickers.map(s => s.id)).size, 1001);
assert.throws(() => storage.addStickerUrlsToPack('missing', many.rows));
assert.throws(() => storage.addStickerUrlsToPack('p', [{name:'bad',url:'javascript:alert(1)'}]));
assert.equal(writes, 1);
(async () => {
    const result = await storage.addStickersToPack('p', [{name:'good',blob:'ok'},{name:'bad',blob:'bad'}]);
    assert.deepEqual(plain(result), {added:1,failed:1,failedIndexes:[1]});
    assert.equal(writes, 2);
    console.log('PASS: plain/multiline/inline/Markdown/table/CSV/JSON, signed URLs, invalid & duplicates, unique names, 1000-row single-write import, file partial failures.');
})().catch(error => { console.error(error); process.exitCode=1; });
