const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
const readModule = (pkg, file) => fs.readFileSync(path.join(path.dirname(require.resolve(pkg)), file), 'utf8');
const sources = {
  react: readModule('react', 'cjs/react.production.js'),
  'react/jsx-runtime': readModule('react', 'cjs/react-jsx-runtime.production.js'),
  'react-dom': readModule('react-dom', 'cjs/react-dom.production.js'),
  'react-dom/client': readModule('react-dom', 'cjs/react-dom-client.production.js'),
  scheduler: readModule('scheduler', 'cjs/scheduler.production.js'),
  'lucide-react': `const React=require('react');for(const name of ['ChevronLeft','Check','Pencil','Smile','Eraser'])exports[name]=()=>React.createElement('svg',{'aria-hidden':true,width:20,height:20,viewBox:'0 0 24 24'},React.createElement('path',{d:name==='Check'?'M5 12L10 17L19 7':'M14 6L8 12L14 18',fill:'none',stroke:'currentColor'}));`,
  editor: ts.transpileModule(fs.readFileSync(path.join(root, 'components/chat/photo-markup-editor.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText,
};
async function main() {
 const bubble = fs.readFileSync(path.join(root,'components/chat/message-bubble.tsx'),'utf8');
 const layer = bubble.slice(bubble.indexOf('function PhotoAnnotationLayer('),bubble.indexOf('function PhotoAnnotationEditor('));
 sources.layer = ts.transpileModule('import {useRef,useState,useEffect} from "react"; export '+layer,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const browser = await require(process.env.PLAYWRIGHT_MODULE || 'playwright').chromium.launch({headless:true, executablePath: process.env.CHAT_TEST_BROWSER});
 try {
  const page = await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<style>*{box-sizing:border-box}body{margin:0;--c-page-body-bg:#f7f8fa;--c-text:#202124}.chat-photo-annotation-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}</style><div id="root"></div>');
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'styles/photo-editor.css'),'utf8')});
  await page.addScriptTag({content:`const sources=${JSON.stringify(sources)},cache={};function require(id){if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;new Function('module','exports','require',sources[id])(module,module.exports,require);return module.exports;}const React=require('react'),{createRoot}=require('react-dom/client'),{PhotoMarkupEditor}=require('editor');window.saved=null;window.closeCount=0;window.marks=[];createRoot(document.getElementById('root')).render(React.createElement(PhotoMarkupEditor,{fallbackText:'测试照片',onClose:()=>window.closeCount++,onSave:a=>window.saved=a,renderLayer:(a,id)=>{window.marks=a;return React.createElement(require('layer').PhotoAnnotationLayer,{annotations:a,selectedId:id})}}));`});
  await page.getByRole('button',{name:'Emoji',exact:true}).click();
  assert.equal(await page.locator('.photo-pen-options').count(),0);
  await page.getByRole('textbox',{name:'输入 Emoji'}).fill('🧑‍🍳');
  await page.locator('.photo-emoji-input-overlay').click({position:{x:10,y:10}});
  assert.equal(await page.locator('.photo-emoji-input-overlay').count(),0);
  assert.equal(await page.evaluate(()=>window.marks.length),1);
  const rect=await page.locator('.photo-edit-touch').boundingBox(), cx=rect.x+rect.width/2,cy=rect.y+rect.height/2;
  const cdp=await page.context().newCDPSession(page);
  const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id])=>({x,y,id,radiusX:2,radiusY:2}))});
  await touch('touchStart',[[cx,cy,1]]);
  await touch('touchMove',[[cx+20,cy+10,1]]);
  await touch('touchEnd',[]);
  let mark=await page.evaluate(()=>window.marks[0]);assert.ok(mark.x>.5 && mark.y>.5,'one finger moves sticker');
  const px=rect.x+mark.x*rect.width,py=rect.y+mark.y*rect.height;
  await touch('touchStart',[[px-15,py,1]]);
  await touch('touchStart',[[px-15,py,1],[px+15,py,2]]);
  await touch('touchMove',[[px-30,py-30,1],[px+30,py+30,2]]);
  await touch('touchEnd',[]);
  mark=await page.evaluate(()=>window.marks[0]);
  assert.ok(mark.scale>2,'pinch scales existing sticker');assert.ok(Math.abs(mark.rotation-45)<3,'rotation uses screen pixels on non-square photo');
  assert.equal(await page.evaluate(()=>window.marks.length),1,'second finger never creates a sticker');
  await page.waitForTimeout(50);
  const axes = await page.locator('.chat-photo-annotation-layer text').evaluate(el => { const m=el.getScreenCTM(); return [Math.hypot(m.a,m.b),Math.hypot(m.c,m.d)]; });
  assert.ok(Math.abs(axes[0]-axes[1])<.001,'rotated emoji retains equal X/Y scale on portrait image');
  await page.setViewportSize({width:844,height:390});
  await page.waitForTimeout(100);
  const landscapeAxes = await page.locator('.chat-photo-annotation-layer text').evaluate(el => { const m=el.getScreenCTM(); return [Math.hypot(m.a,m.b),Math.hypot(m.c,m.d)]; });
  assert.ok(Math.abs(landscapeAxes[0]-landscapeAxes[1])<.001,'emoji stays proportional after landscape resize');
  await page.setViewportSize({width:390,height:844});
  await page.locator('.photo-edit-workspace').click({position:{x:3,y:3}});
  assert.equal(await page.evaluate(()=>window.closeCount),0,'blank click does not dismiss editor');
  await page.getByRole('button',{name:'确认保存'}).click();
  assert.equal((await page.evaluate(()=>window.saved))[0].emoji,'🧑‍🍳');
  await page.getByRole('button',{name:'放弃修改并返回'}).click();assert.equal(await page.evaluate(()=>window.closeCount),1);
  await page.getByRole('button',{name:'画笔',exact:true}).click();
  if(process.env.PHOTO_EDITOR_SCREENSHOT) await page.screenshot({path:process.env.PHOTO_EDITOR_SCREENSHOT});
  assert.deepEqual(errors,[]);console.log('PASS: arbitrary emoji, drag, pinch/rotate, no duplicate, blank retention, save/back');
 } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
