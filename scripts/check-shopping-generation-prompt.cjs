// Capture real engine request assembly with a fake model; no API, storage or account access.
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
const requests = [];
const result = {};
const compile = ts.transpileModule(fs.readFileSync('lib/shopping-engine.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(compile, { exports: result, require: name => ({
  './chat-engine': { sendLLMRequest: async (_api, _char, messages) => { requests.push(messages); return '#搜索结果1\n[名称]护理套组\n[店铺]品牌旗舰店\n[价格]USD 1500.00\n[说明]多件套组\n[详情]明确规格\n[图标]✨'; }, previewMessagesForApi: (_api, _char, messages) => messages },
  './settings-storage': { loadApiConfigs: () => [{ id: 'fake', defaultModel: 'fake' }], loadBindingConfig: () => ({ globalDefaults: {} }) },
  './currency-context': { shoppingCurrencyInstruction: () => '【购物计价】USD' },
}[name]) });
(async () => {
  const oldRefresh = '旧版首页预设，保留用户偏好';
  const oldSearch = '旧版搜索预设：{{query}}';
  await result.generateShoppingCatalog(oldRefresh);
  const search = await result.generateShoppingSearchResults('奢侈品化妆品，预算2000美元', oldSearch);
  assert.equal(search.result.items[0].priceLabel, 'USD 1500.00');
  for (const messages of requests) {
    assert.equal(messages[0].role, 'system');
    for (const rule of [/简体中文/, /币种改变不意味着改用英文/, /显式预算/, /亲民/, /旗舰大规格/, /套组/, /不强制每件奢侈品/, /USD/]) assert.match(messages[0].content, rule);
  }
  assert.equal(requests[0][1].content, oldRefresh);
  assert.equal(requests[1][1].content, '旧版搜索预设：奢侈品化妆品，预算2000美元');
  for (const [mode, params, captured] of [['catalog', {refreshPrompt:oldRefresh}, requests[0]], ['search', {query:'奢侈品化妆品，预算2000美元',searchPrompt:oldSearch}, requests[1]]]) {
    const preview = await result.previewShoppingPromptPayload(mode, params);
    assert.equal(preview.messages[0].content, captured[0].content);
    assert.equal(preview.messages[1].content, captured[1].content);
  }
  assert.ok(result.DEFAULT_SHOPPING_REFRESH_PROMPT.includes(result.SHOPPING_LANGUAGE_AND_PRICING_INSTRUCTION));
  assert.ok(result.DEFAULT_SHOPPING_SEARCH_PROMPT.includes(result.SHOPPING_LANGUAGE_AND_PRICING_INSTRUCTION));
  console.log('PASS: refresh/search actual assembly and preview match; saved custom prompts preserved; language/pricing guard applies with old presets; default presets updated. Fake model only.');
})().catch(error => {console.error(error);process.exitCode=1;});
