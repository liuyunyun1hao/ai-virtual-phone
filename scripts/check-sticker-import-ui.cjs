// Isolated real dialog + React. Never reads or changes the user's browser database.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const readModule=(pkg,file)=>fs.readFileSync(path.join(path.dirname(require.resolve(pkg,{paths:[path.dirname(require.resolve('react-dom')),root]})),file),'utf8');
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const source=fs.readFileSync(path.join(root,'components/chat/sticker-manager.tsx'),'utf8');
const modules={
 react:readModule('react','cjs/react.production.js'),
 'react/jsx-runtime':readModule('react','cjs/react-jsx-runtime.production.js'),
 'react-dom':readModule('react-dom','cjs/react-dom.production.js'),
 'react-dom/client':readModule('react-dom','cjs/react-dom-client.production.js'),
 scheduler:readModule('scheduler','cjs/scheduler.production.js'),
 parser:compile(fs.readFileSync(path.join(root,'lib/sticker-import-parser.ts'),'utf8')),
 dialog:compile(`import {useState,useRef,useEffect,useMemo} from 'react';
 import {parseStickerImport,stickerNameFromUrl,uniqueStickerNames} from 'parser';
 const ImagePlus=()=>null,Trash2=()=>null;
 const loadStickerPacks=()=>[{id:'p',stickers:window.saved}];
 const checkStickerBlob=()=>null;
 const addStickerUrlsToPack=(_,rows)=>{if(window.failSave)throw Error('测试保存失败');window.writes++;window.saved.push(...rows);};
 const addStickersToPack=async(_,rows)=>{window.saved.push(rows[0]);return {added:1,failed:rows.length-1,failedIndexes:rows.slice(1).map((_,i)=>i+1)};};
 ${source.slice(source.indexOf('type BatchRow ='))}
 export {BatchAddStickerDialog};`)
};
async function main(){
 const browser=await require(process.env.PLAYWRIGHT_MODULE||'playwright').chromium.launch({headless:true,executablePath:process.env.CHAT_TEST_BROWSER});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await page.route('https://img.test/**',route=>route.abort());
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({content:`const sources=${JSON.stringify(modules)},cache={};function require(id){if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;new Function('module','exports','require',sources[id])(module,module.exports,require);return module.exports;}window.saved=[{name:'贴贴'}];window.writes=0;window.done=0;const React=require('react'),{createRoot}=require('react-dom/client'),{BatchAddStickerDialog}=require('dialog');createRoot(document.getElementById('root')).render(React.createElement(BatchAddStickerDialog,{packId:'p',onDone:()=>window.done++,onCancel:()=>{}}));`});
  await page.locator('textarea').fill('贴贴：https://img.test/1.gif\n贴贴\nhttps://img.test/2.gif\n笑 https://img.test/3.gif');
  await page.getByRole('button',{name:'预览并编辑',exact:true}).click();
  const names=page.getByPlaceholder('表情名称');
  assert.deepEqual(await names.evaluateAll(nodes=>nodes.map(n=>n.value)),['贴贴 (2)','贴贴 (3)','笑']);
  await names.nth(1).fill('');
  await page.getByRole('button',{name:'添加可用项 (2/3)',exact:true}).click();
  await page.waitForFunction(()=>window.saved.length===3);
  assert.equal(await names.count(),1);assert.equal(await page.evaluate(()=>window.done),0);
  await names.first().fill('修正');
  await page.evaluate(()=>window.failSave=true);
  await page.getByRole('button',{name:'添加可用项 (1/1)',exact:true}).click();
  assert.equal(await names.count(),1);
  assert.ok(await page.getByText('已添加 0 张；测试保存失败').isVisible());
  await page.evaluate(()=>window.failSave=false);
  await page.getByRole('button',{name:'添加可用项 (1/1)',exact:true}).click();
  await page.waitForFunction(()=>window.done===1);
  assert.equal(await page.evaluate(()=>window.saved.length),4);
  const many=Array.from({length:500},(_,i)=>`比格描述${i}--\nhttps://img.test/m${i}.gif`).join('\n');
  await page.locator('textarea').fill(many);
  // Reproduce the phone report: paste then tap the bottom action, no staging/preview click.
  assert.equal(await names.count(),0);
  assert.equal(await page.getByRole('button',{name:'全部添加 (500)',exact:true}).isEnabled(),true);
  await page.getByRole('button',{name:'全部添加 (500)',exact:true}).tap();
  await page.waitForFunction(()=>window.done===2);
  assert.equal(await page.evaluate(()=>window.saved.length),504);
  assert.equal(await page.evaluate(()=>window.writes),3);
  await page.locator('textarea').fill('不是链接');
  await page.getByRole('button',{name:'全部添加',exact:true}).tap();
  assert.ok(await page.getByText('没有可添加的表情，请检查描述和 http/https 链接，或修正列表中标出的名称。').isVisible());
  // Failed direct saves must stage the rows for retry without losing pasted content.
  await page.locator('textarea').fill('手机重试 https://img.test/retry.gif');
  await page.evaluate(()=>window.failSave=true);
  await page.getByRole('button',{name:'全部添加 (1)',exact:true}).tap();
  assert.equal(await names.count(),1);
  await page.evaluate(()=>window.failSave=false);
  await page.getByRole('button',{name:'添加可用项 (1/1)',exact:true}).tap();
  await page.waitForFunction(()=>window.done===3);
  assert.equal(await page.evaluate(()=>window.saved.length),505);
  assert.deepEqual(errors,[]);
  console.log('PASS: mobile touch direct import of 500 pasted URLs without preview click; invalid-text feedback, direct-save failure retry, optional preview/edit, partial rows and single batch write.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
