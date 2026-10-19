const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
 const page=await browser.newPage({viewport:{width:575,height:1055},hasTouch:true});
 await page.route('**/*',r=>{const u=new URL(r.request().url());return u.hostname==='127.0.0.1'&&!u.pathname.startsWith('/api/')?r.continue():r.abort()});
 await page.addInitScript(()=>{
  const photo='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="120"><rect width="100" height="120" fill="#b8c6b7"/></svg>');
  localStorage.setItem('ai_phone_photo_album_v1',JSON.stringify({version:1,favorites:[],exclusions:[],albumAnnotations:{},nativeAssets:Array.from({length:40},(_,i)=>({assetVersionId:'fixture-'+i,mediaRef:photo,label:'测试照片'+i,photoKind:'photo',createdAt:new Date(2026,8,19,0,0,40-i).toISOString()}))}));
 });
 await page.goto(process.env.ALBUM_TEST_URL||'http://127.0.0.1:3003/',{timeout:120000});
 await page.getByRole('button',{name:'Enter',exact:true}).click({timeout:45000});
 await page.getByRole('dialog').getByRole('button').last().click();
 await page.getByRole('button',{name:'第4页',exact:true}).click();
 await page.getByRole('button',{name:'相册',exact:true}).click();
 await page.getByRole('button',{name:'查看测试照片0',exact:true}).click();
 const film=page.locator('.photo-album-filmstrip');
 assert.equal(await film.locator('button').count(),40);
 const box=await film.boundingBox(), y=box.y+box.height/2;
 assert.ok(await film.evaluate(e=>e.scrollWidth>e.clientWidth*2));
 const initial=await film.locator('[aria-current=true]').getAttribute('data-photo-id');
 // Real touch input, not synthetic pointer events: drag the rail without selecting photos.
 const cdp=await page.context().newCDPSession(page);
 const touch=async(type,x)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
 await touch('touchStart',box.x+box.width-55);
 for(let i=1;i<=8;i++) await touch('touchMove',box.x+box.width-55-i*26);
 await touch('touchEnd',0);
 await page.waitForTimeout(450);
 const dragged=await film.evaluate(e=>e.scrollLeft);
 assert.ok(dragged>150,'Touch drag scrolls beyond initially visible thumbnails');
 assert.equal(await film.locator('[aria-current=true]').getAttribute('data-photo-id'),initial,'Dragging is not scrubbing');
 const x=box.x+box.width-8;
 await touch('touchStart',x);await page.waitForTimeout(1100);
 const scrubbed=await film.evaluate(e=>e.scrollLeft);
 assert.ok(scrubbed>dragged+100,'Holding at edge scrolls into offscreen photos');
 assert.notEqual(await film.locator('[aria-current=true]').getAttribute('data-photo-id'),initial);
 await touch('touchEnd',0);await page.waitForTimeout(80);
 const stopped=await film.evaluate(e=>e.scrollLeft);await page.waitForTimeout(200);
 assert.equal(await film.evaluate(e=>e.scrollLeft),stopped,'Releasing stops edge scrolling');
 // Mouse path, including reversing direction, also scrolls without a native image drag.
 await page.mouse.move(box.x+90,y);await page.mouse.down();await page.mouse.move(box.x+270,y,{steps:8});await page.mouse.up();
 await page.waitForTimeout(350);
 assert.ok(await film.evaluate(e=>e.scrollLeft)<stopped);
 console.log('PASS: 40-photo overflow, real touch drag, no accidental selection, long-press edge browse, release stop and reverse mouse drag');
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
