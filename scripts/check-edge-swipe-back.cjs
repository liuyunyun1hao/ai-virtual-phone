const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = fs.readFileSync(require('node:path').join(__dirname, '../lib/edge-swipe-back.ts'), 'utf8');
class Element {
  constructor() { this.disabled=false; this.isConnected=true; this.blocked=false; }
  closest() { return this.blocked ? this : null; }
  getAttribute(name) { return name==='data-edge-back' ? this.edgeBack ?? null : null; }
  contains(el) { return el===this; }
  getBoundingClientRect() { return {left:60,top:60,width:40,height:40}; }
}
const context={exports:{},Element,Date};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const {backSwipeIntent,shouldFinishBackSwipe,installEdgeSwipeBack}=context.exports;
assert.equal(backSwipeIntent(5,2),'pending');
assert.equal(backSwipeIntent(12,2),'back');
assert.equal(backSwipeIntent(8,18),'cancel');
assert.equal(backSwipeIntent(-30,2),'cancel');
assert.equal(shouldFinishBackSwipe(100,10,390,600),true);
assert.equal(shouldFinishBackSwipe(60,5,390,100),true);
assert.equal(shouldFinishBackSwipe(60,5,390,500),false);
assert.equal(shouldFinishBackSwipe(100,90,390,600),false);
assert.equal(shouldFinishBackSwipe(120,0,390,3000),false);
let count=0, innerCount=0, hint=0, selection='';
const outer=new Element(); outer.click=()=>count++;
const inner=new Element(); inner.click=()=>innerCount++;
let buttons=[outer], covered=false;
const handlers={};
const root={
 ownerDocument:{getSelection:()=>({toString:()=>selection}),elementFromPoint:()=>covered?new Element():buttons.at(-1)},
 querySelectorAll:()=>buttons,
 getBoundingClientRect:()=>({left:50,top:20,width:390,height:844}),
 addEventListener:(name,fn)=>{handlers[name]=fn;},removeEventListener:name=>{delete handlers[name];},
};
const cleanup=installEdgeSwipeBack(root,p=>{hint=p;});
const compose=new Element(); compose.edgeBack='off'; compose.click=()=>{throw new Error('Compose must not be a back action');};
buttons=[outer,compose];
assert.equal(context.exports.findExposedBackButton({...root,ownerDocument:{...root.ownerDocument,elementFromPoint:()=>outer}}),outer);
buttons=[outer];
const target=new Element();
function emit(name,x,y,time,options={}) {
 const touch={identifier:1,clientX:x,clientY:y};
 const event={target,touches:name==='touchend'?[]:[touch],changedTouches:[touch],timeStamp:time,cancelable:true,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...options};
 handlers[name](event); return event;
}
function swipe(x,dx,dy,elapsed=600) {emit('touchstart',x,200,100);const move=emit('touchmove',x+dx,200+dy,200);emit('touchend',x+dx,200+dy,100+elapsed);return move;}
assert.equal(swipe(55,110,5).prevented,true); assert.equal(count,1);
swipe(90,110,5); assert.equal(count,1,'Interior drags must not go back');
assert.equal(swipe(55,5,110).prevented,undefined); assert.equal(count,1,'Vertical scroll stays native');
swipe(55,-110,5); swipe(55,30,0); assert.equal(count,1);
emit('touchstart',55,200,100);emit('touchmove',160,200,200);handlers.touchcancel();emit('touchend',160,200,700);assert.equal(count,1);
emit('touchstart',55,200,100);emit('touchmove',160,200,200,{touches:[{identifier:1},{identifier:2}]});emit('touchend',160,200,700);assert.equal(count,1);
emit('touchstart',55,200,100);emit('touchmove',160,200,200,{cancelable:false});emit('touchend',160,200,700);assert.equal(count,1);
buttons=[outer,inner]; swipe(55,110,0); assert.equal(innerCount,1); assert.equal(count,1,'Only the exposed nested page returns');
covered=true;swipe(55,110,0);assert.equal(innerCount,1,'Modal coverage blocks background navigation');covered=false;
target.blocked=true;swipe(55,110,0);assert.equal(innerCount,1,'Editable/media opt-out is respected');target.blocked=false;
selection='selected';swipe(55,110,0);assert.equal(innerCount,1);selection='';
buttons=[];swipe(55,110,0);assert.equal(count,1,'No back button means no navigation');
assert.equal(hint,0);cleanup();assert.equal(Object.keys(handlers).length,0);
console.log('PASS: edge origin, direction, distance/flick, nested back, scroll, multitouch/cancel, modal/input guards, cleanup.');
