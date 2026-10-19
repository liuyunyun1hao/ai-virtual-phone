const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'lib/message-effects/echo-renderer.js'),'utf8');
const sandbox={};vm.runInNewContext(source.replace('export function','function')+';this.create=createEchoRenderer;',sandbox);
// Inspect the actual drawing calls, not just declared near-pass count.
for(const [width,height,normalization] of [[112.5,47.5,1],[197.5,77.5,.854],[197.5,155.5,.85]])for(const screenWidth of [320,390]){
 const calls=[],ctx={fillRect(){},drawImage(sprite,x,y,w,h){calls.push({x,y,w,h,alpha:this.globalAlpha})}};
 const renderer=sandbox.create(ctx,{sprite:{},width,height,normalization});
 assert.equal(renderer.duration,6000);
 let readableFrames=0,maxCopies=0;
 for(let ms=1000;ms<=4400;ms+=50){
  calls.length=0;renderer.draw(ms,screenWidth,844);maxCopies=Math.max(maxCopies,calls.length);
  const readable=calls.filter(c=>c.alpha>.95&&20*c.w/width>=23&&c.x>=0&&c.x+c.w<=screenWidth&&c.y>=0&&c.y+c.h<=844);
  if(readable.length)readableFrames++;
 }
 assert.ok(maxCopies<=240);assert.ok(readableFrames>=42,`readable foreground >= 2.1s: ${width}/${screenWidth}: ${readableFrames}`);
 calls.length=0;renderer.draw(6000,screenWidth,844);assert.equal(calls.length,0);
 console.log(JSON.stringify({sample:[width,height],screenWidth,readableSeconds:readableFrames*.05,maxCopies}));
}
console.log('PASS: readable, fully in-frame near bubbles across short/long messages; total count and six-second ending preserved.');
