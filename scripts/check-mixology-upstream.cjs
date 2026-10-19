// Offline integration regression: real mixology modules, in-memory KV and fake LLM only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const data = new Map([['chat-sentinel', 'untouched'], ['album-sentinel', 'untouched']]);
const cache = new Map(), calls = [], hooks = [];
let reply = '「这是模拟回复。」', hookHandler = () => ({});
const mocks = {
  'lib/kv-db.ts': {kvGet: k => data.get(k), kvSet: (k,v) => data.set(k,v), registerKvMigration() {}},
  'lib/download-utils.ts': {downloadFile() {}},
  'lib/chat-engine.ts': {
    ChatEngineError: class extends Error {},
    sendLLMRequest: async (...args) => {calls.push(args); return reply;},
    sendLLMStreamRequest: async () => {throw Error('Unexpected streaming request');},
  },
  'lib/settings-storage.ts': {loadApiConfigs: () => [{id:'mock'}], loadBindingConfig: () => ({globalDefaults:{apiConfigId:'mock'}})},
  'lib/mixology/mechanism-runtime.ts': {
    disposeMixSandboxes() {},
    runMixHook: async (session, material, script, hook, payload) => {hooks.push(hook); return hookHandler(hook,payload);},
  },
};
function load(file) {
  file = file.replaceAll('\\','/');
  if (mocks[file]) return mocks[file];
  if (cache.has(file)) return cache.get(file).exports;
  const module = {exports:{}}; cache.set(file,module);
  const source = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const req = id => {
    const resolved = id.startsWith('@/') ? id.slice(2) : id.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file),id)) : null;
    if (!resolved) throw Error('Unexpected dependency: '+id);
    return load(resolved.endsWith('.ts') ? resolved : resolved+'.ts');
  };
  vm.runInNewContext(source, {module,exports:module.exports,require:req,console,Date,Math,JSON,Map,Set,RegExp,URL,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,crypto:require('node:crypto').webcrypto,
    fetch:()=>{throw Error('Network forbidden in regression');}}, {filename:file});
  return module.exports;
}
const s = load('lib/mixology/storage.ts'), a = load('lib/mixology/assembler.ts');
const types = load('lib/mixology/types.ts'), protocol = load('lib/mixology/mechanism-protocol.ts');
const transfer = load('lib/mixology/transfer.ts'), engine = load('lib/mixology/engine.ts');
const connector = load('lib/mixology/connectors.ts'), prose = load('lib/mixology/prose.ts');
const trusted = load('lib/mixology/trusted-runtime.ts');
const card = {id:'card',kind:'character',name:'测试角色',charName:'测试角色',baseInfo:'基础资料',personality:'沉稳',appearance:'短发',background:'背景',worldview:'测试世界',cognition:'初次见面',relations:'朋友',plot:'散步',extra:'',openings:['「你好，{{user}}。」'],examples:[],createdAt:1,updatedAt:1};
const recipe = {id:'recipe',name:'测试配方',slots:{character:'card'},createdAt:1,updatedAt:1};
async function main() {
  // Legacy string slots and existing session records remain readable, without a migration write.
  data.set('mixology_cabinet_v1',JSON.stringify([card]));
  data.set('mixology_recipes_v1',JSON.stringify([recipe]));
  const savedRecipe = data.get('mixology_recipes_v1');
  assert.equal(s.loadMixRecipes()[0].slots.character[0].materialId,'card');
  assert.equal(data.get('mixology_recipes_v1'),savedRecipe);
  const plain = a.assembleMixPrompt({character:card,materials:{},userName:'测试用户'});
  assert.ok(plain.system.includes('基础资料') && plain.system.includes('测试世界'));
  assert.ok(!plain.system.includes('# 输出格式检查'));
  assert.equal(plain.opening,'「你好，测试用户。」');
  const preface = {...card,kind:'preface',id:'preface',content:'序言 {{char}}',sectionTitles:{character:'人物档案'}};
  const checklist = {...card,kind:'checklist',id:'check',content:'核对对白'};
  const composed = a.assembleMixPrompt({character:{...card,profileMode:'freeform',profileText:'一框资料'},materials:{preface:[preface],checklist:[checklist]},sections:[{at:'ticket',text:'额外契约'}]});
  assert.ok(composed.system.startsWith('序言 测试角色'));
  assert.ok(composed.system.includes('一框资料') && !composed.system.includes('基础资料'));
  assert.ok(composed.system.includes('人物档案') && composed.system.includes('核对对白') && composed.system.includes('额外契约'));
  // Long mechanism memory survives normalization; only recognized hook sections pass through.
  const long='记忆'.repeat(16000);
  const result=protocol.normalizeHookResult({text:long,note:long,store:{memory:long},raw:'原文',lastReply:'临时历史',sections:[{at:'ticket',text:'契约'},{at:'bad',text:'忽略'}]});
  assert.equal(result.text,long); assert.equal(result.note,long); assert.equal(result.store.memory,long);
  assert.equal(result.sections.length,1); assert.equal(result.lastReply,'临时历史');
  assert.equal(types.normalizeMixDialogueButton({icon:'speaker',title:'朗读'}).icon,'speaker');
  const req=connector.buildMixConnectorRequest({url:'https://example.invalid/tts',method:'POST',headers:{},body:'{"text":"{{text}}","speed":{{speed|1}}}'},{text:'带"引号\n换行'});
  assert.equal(JSON.parse(req.init.body).text,'带"引号\n换行');
  assert.equal(JSON.parse(req.init.body).speed,1);
  assert.ok('err' in connector.normalizeMixConnectorParams({nested:{x:1}}));
  for(let i=0;i<30;i++) assert.equal(connector.takeMixConnectorQuota('test',100),true);
  assert.equal(connector.takeMixConnectorQuota('test',100),false);
  assert.equal(connector.takeMixConnectorQuota('test',60101),true);
  const imported=transfer.parseMixMaterialsFromJson(JSON.stringify([preface,checklist,{...card,kind:'mechanism',script:'',panelHtml:'',trusted:true}]));
  assert.equal(imported.length,3); assert.equal(transfer.mixTrustedMechanismNames(imported).length,1);
  assert.ok(prose.parseMixProse('「你好」\n\n```html\n<div>卡片</div>\n```').some(p=>p.type==='html'));
  // A missing status block no longer triggers an extra paid request.
  const ticket={id:'ticket',kind:'ticket',name:'状态',contract:'输出状态',renderHtml:'<div>状态</div>',fields:[],createdAt:1,updatedAt:1};
  s.saveMixMaterial(ticket);
  const first=engine.startMixSession({...recipe,slots:{character:'card',ticket:'ticket'}});
  await engine.generateMixReply(first.id,'你好');
  assert.equal(calls.length,1);
  assert.equal(s.getMixSession(first.id).turns.length,3);
  assert.equal(engine.mixRoundCount(s.getMixSession(first.id).turns),1);
  // Hooks edit request history transiently, retain original model output, and preserve full memory.
  const mechanism={id:'mechanism',kind:'mechanism',name:'测试机括',script:'mock hook',createdAt:1,updatedAt:1};
  s.saveMixMaterial(mechanism);
  const second=engine.startMixSession({...recipe,id:'hook-recipe',slots:{character:'card',mechanism:'mechanism'}});
  const originalOpening=second.turns[0].text;
  hookHandler=(hook,payload)=>hook==='beforeSend'?{lastReply:'只在本轮请求的历史',sections:[{at:'ticket',text:'本轮契约'}]}:hook==='rawReply'?{raw:payload.raw.replace('[状态栏:机括]私有记账[/状态栏]',''),store:{memory:long}}:{};
  reply='[状态栏:机括]私有记账[/状态栏]「回复正文。」';
  await engine.generateMixReply(second.id,'继续');
  const lastCall=calls.at(-1), updated=s.getMixSession(second.id);
  assert.ok(lastCall[2].some(m=>m.content.includes('本轮契约')));
  assert.ok(lastCall[2].some(m=>m.content==='只在本轮请求的历史'));
  assert.equal(updated.turns[0].text,originalOpening);
  assert.equal(updated.turns.at(-1).rawText,reply);
  assert.ok(!updated.turns.at(-1).text.includes('私有记账'));
  assert.equal(updated.mechanismStore.mechanism.memory,long);
  assert.ok(hooks.includes('rawReply'));
  // Refilter only assistant context; raw archives and user words remain intact.
  s.saveMixMaterial({id:'filter',kind:'filter',name:'滤网',rules:[{find:'回复正文',replace:'过滤后的正文',mode:'context'}],createdAt:1,updatedAt:1});
  s.saveMixSession({...updated,recipe:{...updated.recipe,slots:{...updated.recipe.slots,filter:'filter'}}});
  assert.equal(engine.rerunMixFilters(second.id).changed,1);
  const filtered=s.getMixSession(second.id);
  assert.equal(filtered.turns.at(-1).rawText,reply);
  assert.ok(filtered.turns.at(-1).text.includes('过滤后的正文'));
  assert.equal(filtered.turns.at(-2).text,'继续');
  assert.equal(engine.rerunMixFilters(second.id).changed,0);
  // Trusted runtime is explicit, its hooks normalize results, and leaving disposes the instance.
  const mat={...mechanism,id:'trusted',trusted:true,script:'mix.on("rawReply", p => ({raw:p.raw+"!"}));'};
  trusted.ensureMixTrusted('isolated',mat,{toast:message=>{throw Error(message);}});
  assert.equal((await trusted.runMixTrustedHook('isolated','trusted','rawReply',{raw:'测试'})).raw,'测试!');
  trusted.disposeMixTrusted('isolated'); assert.equal(trusted.getMixTrusted('isolated','trusted'),undefined);
  assert.equal(data.get('chat-sentinel'),'untouched'); assert.equal(data.get('album-sentinel'),'untouched');
  assert.ok([...data.keys()].every(k=>k.startsWith('mixology_')||k.endsWith('-sentinel')));
  console.log('PASS: legacy recipes, prompt materials, long memory, connectors, import, HTML, one-request replies, hook/history isolation and trusted lifecycle; no network or real data');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
