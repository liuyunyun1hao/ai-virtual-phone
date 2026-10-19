const fs=require('fs'),ts=require('typescript'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('components/music/chat-music-panel.tsx','utf8'), ast=ts.createSourceFile('ui.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let root,clamp;function walk(n){if(ts.isJsxOpeningElement(n)&&n.attributes.properties.some(a=>a.name?.text==='ref'&&a.initializer?.expression?.getText(ast)==='statusRef'))root=n;if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='clampPosition')clamp=n.initializer;ts.forEachChild(n,walk)}walk(ast);
let position,blocked=false,captured=false;const parent={clientWidth:400,clientHeight:800,getBoundingClientRect:()=>({width:200})};const node={offsetParent:parent,offsetLeft:180,offsetTop:78,offsetWidth:200,offsetHeight:50,setPointerCapture(){captured=true},hasPointerCapture(){return captured},releasePointerCapture(){captured=false}};
const scope={statusRef:{current:node},drag:{current:null},suppressClick:{current:false},Math,setPosition:v=>{position=typeof v==='function'?v(position):v}};
function compile(n){const js=ts.transpileModule('const f='+n.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;return vm.runInNewContext('(()=>{'+js+';return f})()',scope)}
scope.clampPosition=compile(clamp);
function handler(name){return compile(root.attributes.properties.find(p=>p.name?.text===name).initializer.expression)}
const event=(x,y)=>({clientX:x,clientY:y,pointerId:1,isPrimary:true,button:0,currentTarget:node,stopPropagation(){blocked=true},preventDefault(){}});
handler('onPointerDown')(event(100,100));handler('onPointerMove')(event(101,101));assert.equal(captured,false,'tap does not capture button');
handler('onPointerMove')(event(20,200));assert.equal(position.x,20);assert.equal(position.y,278,'scaled phone coordinates');
handler('onPointerUp')(event(20,200));assert.equal(position.x,12,'snap left');assert.equal(captured,false);
blocked=false;handler('onClickCapture')({...event(20,200),detail:1});assert.equal(blocked,true,'drag cannot open music');
handler('onPointerDown')(event(20,200));handler('onPointerUp')(event(20,200));blocked=false;handler('onClickCapture')({...event(20,200),detail:1});assert.equal(blocked,false,'tap opens normally');
assert.equal(scope.clampPosition(999,999,true).x,188);assert.equal(scope.clampPosition(999,999,true).y,738);
console.log('PASS: real status handlers: tap, scaled drag, snap, bounds, drag-click suppression.');
