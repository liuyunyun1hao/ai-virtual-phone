// Disposable profile on local dev only; synthetic profiles, no models/cloud credentials.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { Script } = require('node:vm');
const { chromium, webkit } = require('playwright');
async function main() {
 const browser = await (process.env.IDENTITY_TEST_BROWSER==='webkit' ? webkit.launch({headless:true}) : chromium.launch({ executablePath: process.env.CHAT_TEST_BROWSER, headless: true }));
 try {
  const context=await browser.newContext({ viewport: { width: 390, height: 844 },isMobile:true,hasTouch:true });
  const page = await context.newPage();
  let phone=page.mainFrame(), topNavigations=0, trackNavigation=false;
  await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
   const style=document.createElement('style');style.textContent='nextjs-portal{display:none!important}';document.head.appendChild(style);
  }));
  page.on('request', request=>{if(trackNavigation&&request.isNavigationRequest()&&request.frame()===page.mainFrame())topNavigations++});
  const errors = []; page.on('pageerror', error => { errors.push(error.message); console.log('BROWSER ERROR',error.stack); });
  if(process.env.IDENTITY_TEST_DEBUG)page.on('console',message=>{if(message.type()==='error'||message.type()==='warning')console.log('CONSOLE',message.text().slice(0,500))});
  await page.route('**/api/**', route => route.abort());
  await page.route('https://**/*', route => route.abort());
  await page.route('**/_next/static/chunks/**',async route=>{
   for(let attempt=0;attempt<3;attempt++)try{
    const response=await route.fetch({headers:{'accept-encoding':'identity'},timeout:60000}),body=await response.body();new Script(body.toString('utf8'));
    await route.fulfill({response,body,headers:{...response.headers(),'content-encoding':'identity','content-length':String(body.length)}});return;
   }catch{if(attempt===2)await route.abort().catch(()=>{});}
  });
  await page.route('**/identity-fixture', route => route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated seed</title>'}));
  await page.goto('http://127.0.0.1:3003/identity-fixture');
  await page.evaluate(async () => {
   const request = indexedDB.open('AiPhoneKvDB',10);
   request.onupgradeneeded=()=>request.result.createObjectStore('entries',{keyPath:'key'});
   const db = await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
   const tx=db.transaction('entries','readwrite'); const store=tx.objectStore('entries');
   const identity=id=>({id,name:id==='A'?'测试身份 A':'测试身份 B',bio:'',gender:'保密',age:'',occupation:'',customSettings:''});
   store.put({key:'ai_phone_user_identities_v1',value:JSON.stringify([identity('A'),identity('B')])});
   store.put({key:'ai_phone_characters_v1',value:JSON.stringify([{id:'C',name:'共享角色 C',description:'测试角色',personality:'',scenario:'',firstMessage:'',exampleDialogue:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}])});
   store.put({key:'ai_phone_bindings_v1',value:JSON.stringify({globalDefaults:{userIdentityId:'A'},characterBindings:[]})});
   store.put({key:'float_identity_character_access_v1',value:'{}'});
   const fixtureHtml = '<!doctype html><html><body style="padding:120px 24px"><pre id="output">ready</pre><button id="read">Read</button><button id="save">Save</button><script>read.onclick=async()=>{const profile=await AiPhone.user.getProfile({userId:"spoof"});const records=await AiPhone.db.list("test");output.textContent=JSON.stringify({id:profile.id,local:localStorage.getItem("test"),records})};save.onclick=async()=>{const profile=await AiPhone.user.getProfile();localStorage.setItem("test",profile.id);await AiPhone.db.create("test",{owner:profile.id});output.textContent="saved"};</script></body></html>';
   const manifest={id:'identity-fixture',name:'身份兼容测试',version:'1.0.0',permissions:['app.data.read','app.data.write','user.profile.read']};
   store.put({key:'ai_phone_custom_apps_v1',value:JSON.stringify([{id:manifest.id,name:manifest.name,version:manifest.version,manifest,permissions:manifest.permissions,assets:{},entryHtml:fixtureHtml,installedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}])});
   await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
   localStorage.setItem('float_identity_runtime_v1',JSON.stringify({version:1,activeUserId:'A',legacyOwnerId:'A',userIds:['A','B'],deletingUserIds:[],revision:0}));
   document.cookie='pwa_display_mode=standalone; path=/';
  });
  await page.goto('http://127.0.0.1:3003/',{waitUntil:'networkidle',timeout:120000});
  await page.waitForFunction(() => !document.querySelector('[aria-label="Enter"]')?.disabled);
  const settings = async () => {
   const notice=phone.getByRole('button',{name:'我知道了',exact:true});
   if(await notice.waitFor({state:'visible',timeout:1500}).then(()=>true).catch(()=>false)) await notice.click();
   await phone.evaluate(()=>window.dispatchEvent(new CustomEvent('open-app',{detail:{appId:'settings'}})));
   await phone.getByText('配置绑定',{exact:true}).click();
  };
  const enter = async () => {
   await page.getByRole('button',{name:'Enter',exact:true}).click();
   await settings();
  };
  await enter();
  trackNavigation=true;
  await page.evaluate(()=>{window.identityTestSentinel='outer-document-retained';document.cookie='pwa_display_mode=standalone; path=/';});
  const checkApp = async (id, expectedLocal, expectedRecords, save) => {
   await phone.evaluate(()=>window.dispatchEvent(new CustomEvent('open-app',{detail:{appId:'custom_app:identity-fixture'}})));
   const frame=phone.frameLocator('iframe[title="身份兼容测试"]');
   await frame.locator('body').waitFor();
   const appFrame=await(await phone.locator('iframe[title="身份兼容测试"]').elementHandle()).contentFrame();
   await appFrame.waitForFunction(()=>typeof document.getElementById('read')?.onclick==='function'&&typeof window.AiPhone==='object');
   await frame.getByText('Read',{exact:true}).click();
   await frame.locator('#output').filter({hasText:'"id"'}).waitFor().catch(async error=>{
    console.log('SDK DIAGNOSTIC',await frame.locator('body').innerText(),await phone.locator('body').innerText());
    await page.screenshot({path:'tmp/identity-switch-failure.png'});throw error;
   });
   const output=JSON.parse(await frame.locator('#output').innerText());
   assert.equal(output.id,id,'SDK spoofed userId');assert.equal(output.local,expectedLocal,'Legacy localStorage leaked');
   const records=Array.isArray(output.records)?output.records:output.records.records;
   assert.equal(records.length,expectedRecords,'SDK records leaked');
   if(save){await frame.getByText('Save',{exact:true}).click();await frame.locator('#output').filter({hasText:'saved'}).waitFor();await page.waitForTimeout(200);}
   await settings();
  };
  await checkApp('A',null,0,true);
  await phone.getByText('当前用户身份',{exact:true}).click();
  await phone.getByRole('dialog').waitFor();
  await page.screenshot({path:'tmp/identity-global-390-light.png'});
  const waitDesktop = async previous => {
   // WebKit may replace the provisional about:blank Frame during the first navigation.
   await page.waitForFunction(previous=>{
    const frame=document.querySelector('iframe[data-phone-session]');
    if(!frame||frame.dataset.phoneSession===previous)return false;
    const workspace=frame.contentDocument?.querySelector('.phone-workspace');
    return workspace&&frame.contentWindow.getComputedStyle(workspace).visibility==='visible';
   },previous,{timeout:120000});
   phone=await(await page.locator('iframe[data-phone-session]').elementHandle()).contentFrame();
  };
  const switchTo = async id => {
   const previous=await page.locator('iframe[data-phone-session]').getAttribute('data-phone-session').catch(()=>null);
   await phone.getByRole('dialog').getByText(`测试身份 ${id}`,{exact:true}).click();
   await waitDesktop(previous);
   assert.equal(await phone.getByRole('button',{name:'Enter',exact:true}).count(),0,'Repeated splash');
   const serverHtml=await(await page.request.get(await page.locator('iframe[data-phone-session]').getAttribute('src'))).text();
   assert.equal(serverHtml.includes('aria-label="Enter"'),false,'Internal server markup contains startup splash');
   assert.equal(await phone.locator('iframe[data-phone-session]').count(),0,'Nested phone host');
   assert.equal(await page.locator('[data-phone-session-safe-area]').count(),1,'Retired device probes accumulated');
   assert.equal(topNavigations,0,'Outer page reloaded');
   assert.equal(await page.evaluate(()=>window.identityTestSentinel),'outer-document-retained');
   await page.screenshot({path:`tmp/identity-switch-${id}-desktop.png`});
   await settings();
  };
  await switchTo('B');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('float_identity_runtime_v1')).activeUserId),'B');
  await checkApp('B',null,0,true);
  await phone.getByText('当前用户身份',{exact:true}).click();
  await switchTo('A');
  await checkApp('A','A',1,false);
  await phone.getByRole('button',{name:'为角色配置专属绑定'}).click();
  await phone.getByRole('dialog').getByText('共享角色 C',{exact:true}).click();
  await phone.getByText('可互动身份',{exact:true}).click();
  const picker = phone.getByRole('dialog');
  await picker.getByText('测试身份 A',{exact:true}).click();
  await picker.getByText('测试身份 B',{exact:true}).click();
  assert.equal(await picker.count(),1,'Multi-select closed after first selection');
  await page.waitForTimeout(300);
  const access=await page.evaluate(async()=>{
   const r=indexedDB.open('AiPhoneKvDB');const db=await new Promise(resolve=>{r.onsuccess=()=>resolve(r.result)});
   const q=db.transaction('entries').objectStore('entries').get('float_identity_character_access_v1');
   const row=await new Promise(resolve=>{q.onsuccess=()=>resolve(q.result)});db.close();return JSON.parse(row.value).C;
  });
  assert.deepEqual(access.sort(),['A','B']);
  for(const width of [320,390]) for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:844}); await page.emulateMedia({colorScheme:theme});
   await phone.waitForFunction(dark => { const rgb = getComputedStyle(document.querySelector('[data-identity-picker="true"]')).backgroundColor.match(/[\d.]+/g).map(Number); return dark ? rgb[0] < 80 : rgb[0] > 150; }, theme === 'dark');
   await page.screenshot({path:`tmp/identity-binding-${width}-${theme}.png`});
   assert.equal(await picker.evaluate(el=>el.getBoundingClientRect().width<=innerWidth),true,'Picker overflow');
  }
  // Another tab updates the identity manifest. Both the outer host and old child receive storage events.
  const tab=await page.context().newPage();
  await tab.route('**/identity-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Second isolated tab</title>'}));
  await tab.goto('http://127.0.0.1:3003/identity-fixture');
  const oldToken=await page.locator('iframe[data-phone-session]').getAttribute('data-phone-session');
  await tab.evaluate(()=>{const state=JSON.parse(localStorage.getItem('float_identity_runtime_v1'));state.activeUserId='B';state.revision++;localStorage.setItem('float_identity_runtime_v1',JSON.stringify(state))});
  await tab.close();await page.bringToFront();
  await waitDesktop(oldToken);
  await settings();await checkApp('B','B',1,false);
  assert.equal(topNavigations,0,'Cross-tab update reloaded outer document');
  assert.equal(await page.locator('iframe[data-phone-session]').count(),1,'Duplicate host on storage broadcast');
  assert.equal(await page.locator('[data-phone-session-safe-area]').count(),1,'Cross-tab remount leaked a device probe');
  const beforeNoop=await page.locator('iframe[data-phone-session]').getAttribute('data-phone-session');
  await phone.getByText('当前用户身份',{exact:true}).click();await phone.getByRole('dialog').getByText('测试身份 B',{exact:true}).click();
  assert.equal(await page.locator('iframe[data-phone-session]').getAttribute('data-phone-session'),beforeNoop,'Selecting current identity restarted phone');
  assert.deepEqual(errors,[],`Browser errors: ${errors.join('; ')}`);
  console.log('PASS: real 3003 A→B→A and cross-tab switching without outer navigation/splash/nested or duplicate phone frames; current-owner no-op; SDK current-user translation, legacy iframe localStorage and records isolation; 320/390 light/dark binding picker. Synthetic profile; no paid model calls.');
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
