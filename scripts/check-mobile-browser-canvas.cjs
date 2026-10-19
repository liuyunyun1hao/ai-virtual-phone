const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const root = path.join(__dirname, '..');
const props = new Map();
const meta = {};
let color = 'rgb(255, 255, 255)';
let backgroundImage = 'none';
const samples = [];
const page = {getClientRects: () => [{}]};
const document = {documentElement: {style: {setProperty:(k,v)=>props.set(k,v)}}, querySelector:()=>meta,
  createElement:()=>({getContext:()=>({drawImage(){},getImageData(x,y){samples.push(y);return {data:y===0?[40,50,60,255]:[190,200,210,255]};}})})};
const context = {exports:{}, document, Image:class {set src(value){this.onload();}}, getComputedStyle:el => el===page
  ? {backgroundColor:color, backgroundImage,display:'block',visibility:'visible'}
  : {getPropertyValue:()=>'#f1f2f6'}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'lib/bg-tone.ts'),'utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText, context);
let inChat = true;
const shell = {style:{setProperty(){}},querySelector:()=>null,querySelectorAll:()=>inChat?[page]:[]};
(async()=>{
  for (const [rgb, hex] of [['rgb(255, 255, 255)','#ffffff'], ['rgb(23, 23, 25)','#171719'], ['rgb(62, 83, 101)','#3e5365']]) {
    color=rgb;
    await context.exports.updateStatusBarTone(shell,'chat');
    assert.equal(props.get('--mobile-browser-canvas'),hex);
    assert.equal(meta.content,hex);
  }
  backgroundImage='url("fixture.png")';
  await context.exports.updateStatusBarTone(shell,'chat');
  assert.equal(meta.content,'#28323c','Status bar retains top sampling');
  assert.equal(props.get('--mobile-browser-canvas'),'#bec8d2','Keyboard canvas uses lower image color');
  assert.deepEqual(samples,[0,30]);
  backgroundImage='none';
  inChat=false;
  await context.exports.updateStatusBarTone(shell,null);
  assert.equal(props.get('--mobile-browser-canvas'),'#f1f2f6','Leaving chat restores the page fallback');
  assert.equal(props.has('--c-page-body-bg'),false,'Never overwrite theme tokens');
  const css=fs.readFileSync(path.join(root,'styles/phone-shell.css'),'utf8');
  assert.equal((css.match(/background: var\(--mobile-browser-canvas, var\(--c-page-body-bg\)\)/g)||[]).length,2);
  console.log('PASS: white/dark/colored canvas, page exit, theme isolation and both mobile background layers');
})().catch(e=>{console.error(e);process.exitCode=1;});
