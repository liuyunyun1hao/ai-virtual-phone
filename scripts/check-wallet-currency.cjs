// Isolated wallet/FX regression: fake KV, fake reference rates, no accounts or models.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), ts = require('typescript');
let raw = null, calls = 0, fail = false, duringFetch = null;
const load = (file, dependencies = {}) => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: name => dependencies[name], window: { dispatchEvent() {} }, CustomEvent: class {}, AbortSignal, console,
      fetch: async url => { calls++; if (duringFetch) duringFetch(); const base = url.split('/').at(-1); return { ok: !fail, json: async () => ({ result: 'success', base_code: base, rates: base === 'CNY' ? { USD: .14, EUR: .13 } : { CNY: 7, EUR: .9, USD: 1.1 } }) }; } });
  return exports;
};
const fx = load('lib/exchange-rates.ts');
const wallet = load('lib/wallet-storage.ts', { './exchange-rates': fx, './kv-db': { registerKvMigration() {}, kvGet: () => raw, kvSet: (_, value) => { raw = value; } } });
const context = load('lib/currency-context.ts', { './exchange-rates': fx, './wallet-storage': wallet });
(async () => {
  assert.equal(await fx.fetchExchangeRate('USD', 'USD'), 1); assert.equal(calls, 0);
  assert.equal(await fx.fetchExchangeRate('USD', 'EUR'), .9);
  assert.equal(await fx.fetchExchangeRate('CNY', 'USD'), .14);
  assert.equal(await fx.fetchExchangeRate('BAD', 'USD'), null);
  assert.equal(fx.supportedCurrency(undefined), 'CNY');
  const initial = wallet.loadWalletState(); assert.equal(initial.currency, 'CNY');
  wallet.createWalletCard({ title: 'Test', balance: 1000 });
  const before = wallet.loadWalletState();
  const result = await wallet.changeWalletCurrency('USD'); assert.equal(result.ok, true);
  assert.equal(result.state.balance, 1400); assert.equal(result.state.cards.find(c => c.title === 'Test').balance, 140);
  assert.equal(result.state.transactions.at(-1).amount, 10000); assert.equal(result.state.transactions.at(-1).currency, 'CNY');
  assert.match(wallet.formatWalletAmount(25, 'EUR'), /€25/);
  assert.match(context.walletCurrencyInstruction(), /美国 \/ USD/);
  assert.match(context.shoppingCurrencyInstruction(), /USD/);
  wallet.creditWalletBalance(20, 'Test', 'Test'); assert.equal(wallet.loadWalletState().transactions[0].currency, 'USD');
  const unchanged = raw; fail = true;
  assert.equal((await wallet.changeWalletCurrency('EUR')).ok, false); assert.equal(raw, unchanged); fail = false;
  duringFetch = () => wallet.creditWalletBalance(1, 'Concurrent', 'Test');
  assert.equal((await wallet.changeWalletCurrency('EUR')).ok, false); assert.equal(wallet.loadWalletState().currency, 'USD'); duringFetch = null;
  assert.equal(context.amountCurrency('CAD 100'), 'CAD'); assert.equal(context.amountCurrency('¥100'), 'CNY');
  assert.equal(context.amountCurrency('JPY 100'), 'JPY'); assert.equal(context.moneyNumber('USD 1,200.25'), 1200.25);
  assert.match(context.CHARACTER_CURRENCY_INSTRUCTION, /无法确定角色所在地或币种时用 CNY/);
  assert.equal(context.sumMoneyByCurrency([{ amount: 'USD 100', currency: 'USD' }, { amount: '-USD 20', currency: 'USD' }, { amount: 'CNY 500', currency: 'CNY' }]), 'USD 80 / CNY 500');
  assert.equal(context.sumMoneyByCurrency([{ amount: 'USD -20', currency: 'USD' }], true), 'USD -20');
  console.log('PASS: arbitrary currency pairs, same-currency no fetch, legacy CNY, wallet/card value conversion, historical currency, failed/concurrent FX preserves wallet, region/prompt and labelled money parsing.');
})().catch(error => { console.error(error); process.exitCode = 1; });
