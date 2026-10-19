const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const root=path.resolve(__dirname,'..');
const tracks=Array.from({length:5},(_,i)=>({id:String(i),title:i?'Song '+i:'很长的歌曲名字 Very Long Song Title',artist:'Artist',coverUrl:`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="${['#ce6846','#4c7398','#637b51','#875d87','#282828'][i]}"/><circle cx="50" cy="50" r="24" fill="#ffffff33"/></svg>`)}`}));
let played=[],opened=0,toggled=0;
let player={currentTrack:tracks[0],queue:[...tracks,tracks[0]],isPlaying:false,playTrack:t=>played.push(t.id),togglePlay:()=>toggled++,openFullPlayer:()=>opened++};
const marqueeContext={exports:{},require};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'components/widgets/music-marquee.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,marqueeContext);
const dependencies=name=>name==='@/components/widgets/music-marquee'?marqueeContext.exports:require(name);
const context={exports:{},require:name=>name==='react'?{...React,useState:()=>[undefined,()=>{}],useEffect:()=>{}}:name==='@/lib/music-context'?{useMusicControlsOptional:()=>player}:dependencies(name),window:{dispatchEvent:()=>opened++},CustomEvent:class{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'components/widgets/live-music-widget.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
const Widget=context.exports.LiveMusicWidget;
// Exercise the real image sampling hook without touching user's covers or storage.
let sampledState, cleanup;
const hookReact={...React,useState:()=>[undefined,v=>{sampledState=v;}],useEffect:fn=>{cleanup=fn();}};
let pixel=[240,80,40,255];
const paletteContext={exports:{},require:name=>name==='react'?hookReact:name==='@/lib/music-context'?{}:dependencies(name),
 Image:class{set src(v){this.onload();}},document:{createElement:()=>({getContext:()=>({drawImage(){},getImageData:()=>({data:pixel})})})}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'components/widgets/live-music-widget.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText+'\nexports.sample=useCoverColor;',paletteContext);
paletteContext.exports.sample('red-fixture');assert.equal(sampledState.color,'rgb(84,36,24)');cleanup();
pixel=[30,90,230,255];paletteContext.exports.sample('blue-fixture');assert.equal(sampledState.color,'rgb(21,39,81)');cleanup();
assert.ok([84,36,24,21,39,81].every(c=>c<90),'Darkened covers preserve white text contrast');
function buttons(node,out=[]){if(!node||typeof node!=='object')return out;if(node.type==='button')out.push(node);React.Children.forEach(node.props?.children,c=>buttons(c,out));return out;}
player.openFullPlayer=()=>assert.fail('Widget navigation must open Music App, not the full player');
context.CustomEvent=class {constructor(type,init){this.type=type;this.detail=init.detail;}};
context.window.dispatchEvent=e=>{assert.equal(e.type,'open-app');assert.equal(e.detail.appId,'music');opened++;};
let nodes=buttons(Widget({wide:true}));assert.equal(nodes.length,6);
nodes[1].props.onClick();assert.equal(toggled,1);assert.equal(opened,0);
nodes.slice(2).forEach(n=>n.props.onClick());assert.deepEqual(played,['0','1','2','3']);assert.equal(opened,0);
nodes[0].props.onClick();assert.equal(opened,1);
assert.equal(Widget({config:{glassTheme:'dark'}}).props['data-glass-theme'],'auto');
player.isPlaying=true;assert.equal(buttons(Widget({}))[1].props['aria-label'],'暂停音乐');player.isPlaying=false;
buttons(Widget({wide:true,preview:true})).forEach(n=>{assert.equal(n.props.disabled,true);n.props.onClick();});assert.equal(toggled,1);assert.equal(played.length,4);assert.equal(opened,1);
const fullSquare=renderToStaticMarkup(React.createElement(Widget,{}));const fullWide=renderToStaticMarkup(React.createElement(Widget,{wide:true}));
player={...player,currentTrack:null};buttons(Widget({wide:true}))[1].props.onClick();assert.equal(played.at(-1),'0');assert.equal(opened,1);
player={...player,queue:[]};nodes=buttons(Widget({wide:true}));assert.equal(nodes[1].props.disabled,true);nodes[1].props.onClick();assert.equal(opened,1);nodes[0].props.onClick();assert.equal(opened,2);
const empty=renderToStaticMarkup(React.createElement(Widget,{wide:true}));
assert.ok(!fs.readFileSync(path.join(root,'components/widgets/live-music-widget.tsx'),'utf8').includes('new Audio('),'Must reuse the existing audio engine');
async function main(){
 const browser=await require(process.env.PLAYWRIGHT_MODULE||'playwright').chromium.launch({headless:true,executablePath:process.env.CHAT_TEST_BROWSER});
 try{const page=await browser.newPage({viewport:{width:390,height:720}});
 const css=['styles/widgets.css','styles/live-music-widget.css'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n');
 await page.setContent(`<style>${css}body{margin:24px;background:#bccbd7}.fixture{margin-bottom:24px}.small{width:148px;height:160px}.wide{width:320px;height:160px}</style><div class="fixture small">${fullSquare}</div><div class="fixture wide">${fullWide}</div><div class="fixture wide">${empty}</div>`);
 for(const el of await page.locator('.live-music-widget').all()) assert.ok(await el.evaluate(n=>n.scrollWidth<=n.clientWidth&&n.scrollHeight<=n.clientHeight),'Widget must fit its grid slot');
 const covers=await page.locator('.live-music-wide .live-music-queue .live-music-cover').all();assert.equal(covers.length,4);
 await page.screenshot({path:path.join(root,'qa/live-music-widgets.png')});
 const lightInk=await page.locator('.live-music-widget').first().evaluate(n=>getComputedStyle(n).color);
 await page.emulateMedia({colorScheme:'dark'});
 assert.notEqual(await page.locator('.live-music-widget').first().evaluate(n=>getComputedStyle(n).color),lightInk);
 await page.screenshot({path:path.join(root,'qa/live-music-widgets-dark.png')});
 await page.locator('.music-marquee').first().evaluate(n=>{n.dataset.overflow='true';n.style.setProperty('--music-marquee-end','-100px');});
 assert.equal(await page.locator('.music-marquee-text').first().evaluate(n=>getComputedStyle(n).animationName),'music-title-scroll');
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.music-marquee-text').first().evaluate(n=>getComputedStyle(n).animationName),'none');
 assert.ok(!fs.readFileSync(path.join(root,'components/music/music-app.tsx'),'utf8').includes('src="/birds/'));
 console.log('PASS: shared playback actions, preview isolation, empty state, deduped queue, square/wide layout.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
