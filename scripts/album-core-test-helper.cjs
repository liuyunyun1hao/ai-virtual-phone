const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
module.exports = function createCore() {
  const data = new Map();
  const kv = { kvGet: k => data.get(k), kvSet: (k,v) => data.set(k,v), registerKvMigration(){} };
  const box = { exports:{}, require: k => { if(k === './kv-db') return kv; throw Error(k); }, Date, Math, JSON, Set, Intl };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/photo-album-core.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, box);
  return { core:box.exports, data, kv };
};
