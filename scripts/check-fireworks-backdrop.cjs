const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'lib/message-effects/fireworks-renderer.js'),'utf8');
const baseline=process.env.FIREWORKS_BASELINE?fs.readFileSync(process.env.FIREWORKS_BASELINE,'utf8'):null;
assert.match(source,/\.72\*smooth\(t\/\.55\)/);assert.match(source,/duration:9200/);
if(baseline){const plan=s=>s.slice(s.indexOf('const plan='),s.indexOf('function rocket'));assert.equal(plan(source),plan(baseline),'burst plan, seeds and particle equations unchanged');}
(async()=>{const browser=await require(process.env.PLAYWRIGHT_MODULE||'playwright').chromium.launch({headless:true,executablePath:process.env.CHAT_TEST_BROWSER});try{
const page=await browser.newPage({viewport:{width:780,height:844}});
await page.setContent('<style>body{margin:0;display:flex}canvas{width:390px;height:844px}</style><canvas id="old" width="390" height="844"></canvas><canvas id="new" width="390" height="844"></canvas>');
await page.addScriptTag({content:source.replace('export function','function')+';window.current=createFireworksRenderer;'});
if(baseline)await page.addScriptTag({content:baseline.replace('export function','function')+';window.previous=createFireworksRenderer;'});
fs.mkdirSync(path.join(root,'qa/fireworks-backdrop'),{recursive:true});
for(const ms of [2600,5500,8500,9200]){
const result=await page.evaluate(ms=>{
 const stats={};
 for(const [id,create] of [['old',window.previous||window.current],['new',window.current]]){
  const c=document.getElementById(id).getContext('2d');c.clearRect(0,0,390,844);
  // Separate color fields and fine details reveal how much wallpaper survives.
  const g=c.createLinearGradient(0,0,390,844);g.addColorStop(0,'#355b78');g.addColorStop(.5,'#198daf');g.addColorStop(1,'#e7d1a2');c.fillStyle=g;c.fillRect(0,0,390,844);
  c.fillStyle='#ffffff70';for(let y=120;y<820;y+=85)c.fillRect(12,y,365,2);
  create(c).draw(ms,390,844);stats[id]=[...c.getImageData(5,830,1,1).data];
 }
 return stats;
},ms);
if(baseline&&ms<9200)assert.ok(result.new[0]>result.old[0],'wallpaper remains more visible');
if(ms===9200)assert.deepEqual(result.new,result.old,'final backdrop fully restored');
await page.screenshot({path:path.join(root,'qa/fireworks-backdrop/'+ms+'.png')});
}
console.log('PASS: reduced but retained dimmer, brighter background, unchanged burst plan and complete ending.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
