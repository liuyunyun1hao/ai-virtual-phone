// Render the real wallet component with isolated data; never reads user storage.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const compile=f=>ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const fx={};vm.runInNewContext(compile('lib/exchange-rates.ts'),{exports:fx});
const wallet={currency:'USD',balance:1400,cards:[{id:'card',title:'储蓄卡',bankLabel:'TEST',maskedNumber:'**** 0214',cardStyle:'graphite',balance:140,accentLabel:'储蓄',isDefault:true}],transactions:[{id:'tx',cardId:'wallet_balance_account',title:'原币流水',amount:10000,kind:'transfer_in',createdAt:'2026-10-03T00:00:00Z',detail:'TEST',balanceAfter:10000,currency:'CNY'}],defaultCardId:'card',updatedAt:'2026-10-03T00:00:00Z'};
const store={loadWalletState:()=>wallet,getWalletBalance:w=>w.balance,formatWalletAmount:(amount,currency='USD')=>`${currency} ${fx.currencySymbol(currency)}${amount.toFixed(2)}`};
const moduleExports={};vm.runInNewContext(compile('components/chat/wallet-panel.tsx'),{exports:moduleExports,require:name=>name==='@/lib/wallet-storage'?store:name==='@/lib/exchange-rates'?fx:name==='@/components/ui'?{ConfirmDialog:()=>null}:name==='@/components/ui/page-shell'?{PageShell:({children})=>React.createElement('div',{className:'page-shell'},children)}:require(name)});
const html=renderToStaticMarkup(React.createElement(moduleExports.WalletPanel,{onBack(){}}));
assert.match(html,/钱包地区和币种/);assert.match(html,/CNY ¥10000/);assert.match(html,/USD \$1400/);
(async()=>{
 const pw=require(process.env.PLAYWRIGHT_MODULE||'playwright');const browser=await pw.chromium.launch({headless:true,executablePath:process.env.CHAT_TEST_BROWSER});
 try{const page=await browser.newPage();for(const width of [320,390,430])for(const dark of [false,true]){
  await page.setViewportSize({width,height:844});await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;font:14px Arial;background:${dark?'#161616':'white'};color:${dark?'white':'black'}}.p-4{padding:16px}.gap-4{gap:16px}.gap-3{gap:12px}.flex{display:flex}.flex-col{flex-direction:column}.items-center{align-items:center}.justify-between{justify-content:space-between}.ui-input{padding:8px;border-radius:10px;max-width:100%}label span{white-space:nowrap}label select{min-width:0}.page-shell{width:100%}</style>${html}`);
  await page.emulateMedia({colorScheme:dark?'dark':'light'});
  await page.locator('summary[aria-label="钱包地区和币种"]').click();
  assert.equal(await page.locator('.wallet-currency-menu button').count(),10);
  assert.match(await page.locator('.wallet-currency-menu button[aria-pressed=true]').innerText(),/USD/);
  const fits=await page.locator('.wallet-currency-menu').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth});assert.ok(fits,`${width}: expanded menu fits`);
  await page.screenshot({path:path.resolve(`tmp/wallet-currency-${width}-${dark?'dark':'light'}.png`)});
 }console.log('PASS isolated wallet render: expanded menu fits 320/390/430 light/dark, ten currencies, USD selected; no real storage or API.');}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
