// Isolated before/after motion inspection. No chat storage or model requests.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const before=read('lib/message-effects/versions/echo-renderer.near-motion-v4.js.bak');
const after=read('lib/message-effects/echo-renderer.js');
function trace(source){
 const frames=[];const sandbox={record:p=>frames.at(-1).push(p)};
 vm.runInNewContext(source.replace('export function','function').replace('projected.push({x,y,s,z,alpha});','record({id:p.i,near,x,y,s,z,alpha});projected.push({x,y,s,z,alpha});')+';this.create=createEchoRenderer;',sandbox);
 const renderer=sandbox.create({fillRect(){},drawImage(){}},{sprite:{},width:197.5,height:77.5,normalization:.854});
 for(let ms=0;ms<=6000;ms+=1000/60){frames.push([]);renderer.draw(ms,390,844)}
 return frames;
}
const a=trace(before),b=trace(after);let distanceA=0,distanceB=0,comparisons=0;
for(let f=0;f<a.length;f++){
 assert.equal(a[f].length,b[f].length);
 for(let i=0;i<a[f].length;i++){
  const old=a[f][i],now=b[f][i];
  if(!old.near)assert.equal(old.s,now.s,'All background sizes unchanged');
  if(old.near)assert.ok(now.s<=1.4*390/370*.854,'Foreground remains medium-sized');
  if(old.near&&f>=240)assert.ok(now.s<=390/370*.854,'No oversized foreground in dissolving tail');
  assert.equal(old.alpha,now.alpha);
  if(!old.near){assert.equal(old.z,now.z);assert.equal(old.x,now.x);assert.equal(old.y,now.y)}
  if(f>90&&f<201&&old.near){
   const prev=a[f-1].find(p=>p.id===old.id),prevB=b[f-1].find(p=>p.id===old.id);
   if(prev&&prevB){distanceA+=Math.hypot(old.x-prev.x,old.y-prev.y);distanceB+=Math.hypot(now.x-prevB.x,now.y-prevB.y);comparisons++}
  }
 }
}
assert.ok(comparisons>100);assert.match(after,/speed:2\.22/,'Foreground shares the ordinary orbit speed');
assert.ok(distanceB>distanceA,'Medium foreground no longer lags behind its previous orbit');
console.log({comparisons,meanNearPixelsPerFrameBefore:distanceA/comparisons,after:distanceB/comparisons});
(async()=>{
 const browser=await require(process.env.PLAYWRIGHT_MODULE||'playwright').chromium.launch({headless:true,executablePath:process.env.CHAT_TEST_BROWSER});
 try{
  const page=await browser.newPage({viewport:{width:1170,height:1032}});
  await page.setContent('<style>body{margin:0;background:#142f49;color:white;font:16px Arial}.row{display:flex}canvas{width:390px;height:480px}h3{margin:8px 12px}</style><h3>Before: 1.8s / 2.6s / 4.8s</h3><div class="row" id="before"></div><h3>After: medium foreground, unchanged swarm</h3><div class="row" id="after"></div>');
  await page.evaluate(({before,after})=>{
   const sample=document.createElement('canvas');sample.width=198;sample.height=78;const c=sample.getContext('2d');
   c.fillStyle='#1687ef';c.beginPath();c.roundRect(0,0,198,78,24);c.fill();c.fillStyle='white';c.font='20px Arial';c.fillText('今天也想把所有的',16,32);c.fillText('快乐都分享给你',16,59);
   for(const [name,source] of [['before',before],['after',after]]){
    const create=new Function(source.replace('export function','function')+';return createEchoRenderer;')();
    for(const ms of [1800,2600,4800]){
     const canvas=document.createElement('canvas');canvas.width=390;canvas.height=844;document.getElementById(name).append(canvas);
     const ctx=canvas.getContext('2d');ctx.fillStyle='#244e6e';ctx.fillRect(0,0,390,844);
     create(ctx,{sprite:sample,width:197.5,height:77.5,normalization:.854}).draw(ms,390,844);
    }
   }
  },{before,after});
  await page.screenshot({path:path.join(root,'tmp/echo-motion-comparison.png')});
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
