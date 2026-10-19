const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const cache=new Map();
function load(file){
 file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
 const module={exports:{}};cache.set(file,module);
 const localRequire=name=>name==='roughjs/bin/rough'?require('roughjs/bundled/rough.cjs.js'):name.startsWith('.')?load(path.resolve(path.dirname(file),name)+'.ts'):name.startsWith('@/')?load(path.resolve(name.slice(2))+'.ts'):require(name);
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:module.exports,module,require:localRequire,console,process,URL,TextEncoder,TextDecoder,setTimeout,clearTimeout,AbortSignal,fetch});return module.exports;
}
const {parseAIResponse}=load('lib/rich-message-parser.ts');
for(const [input,currency,sender,recipient] of [
 ['[转账:100:USD:Gift]','USD','',''],
 ['[转账:100:GBP:Gift:Baron:User]','GBP','Baron','User'],
 ['[转账:100:Gift]','CNY','',''],
 ['[转账:100:Gift:Baron:User]','CNY','Baron','User'],
 ['[转账：100：eur：Gift]','EUR','',''],
]){
 const result=parseAIResponse(input,[]).parts.find(x=>x.mediaType==='transfer');assert.ok(result,input);
 assert.equal(result.mediaData.currency,currency);assert.equal(result.mediaData.amount,100);
 assert.equal(result.mediaData.label,'Gift');assert.equal(result.mediaData.senderName,sender);assert.equal(result.mediaData.recipientName,recipient);
}
assert.equal(load('lib/exchange-rates.ts').normalizeCurrency('XYZ'),'XYZ');
console.log('PASS real parser: foreign/private/group/legacy/full-width delimiters, actor fields, unknown currency preservation.');
