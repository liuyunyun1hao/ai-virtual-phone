const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const calls=[];
const mods={
 './character-storage':{loadCharacters:()=>[{id:'a',name:'甲'},{id:'b',name:'乙'},{id:'outsider',name:'外人'}]},
 './chat-storage':{loadChatSessions:()=>[{id:'g',isGroup:true,participantIds:['a','b']}]},
 './abort-utils':{throwIfAborted(){},isAbortError:()=>false},
 './photo-album-actions':{executeAlbumAction:async(...args)=>calls.push(args)},
};
const box={exports:{},require:k=>mods[k]||{},console:{log(){},warn(){}}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/action-parser.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,box);
(async()=>{
 const parsed=box.exports.parseActionTags('给你看看[相册转发 "album:p|pv:marks-2"]照片说明[/相册转发]');
 assert.equal(parsed.cleanText,'给你看看');assert.equal(parsed.actions.length,1);
 await box.exports.dispatchActions(parsed.actions,{characterId:'a',sourceEngine:'chat'});
 assert.equal(calls[0][1],'album:p');assert.equal(calls[0][4],'pv:marks-2');
 await box.exports.dispatchActions([{...parsed.actions[0],target:'album:p'}],{characterId:'a',sourceEngine:'chat'});assert.equal(calls.length,1);
 await box.exports.dispatchActions([{...parsed.actions[0],actor:'乙'}],{characterId:'a',sourceEngine:'chat'});assert.equal(calls.length,1);
 await box.exports.dispatchActions([{...parsed.actions[0],actor:'外人'}],{characterId:'a',sourceEngine:'group_chat',sessionId:'g'});assert.equal(calls.length,1);
 await box.exports.dispatchActions([{...parsed.actions[0],actor:'乙'}],{characterId:'a',sourceEngine:'group_chat',sessionId:'g'});assert.equal(calls.length,2);assert.equal(calls[1][0],'b');
 console.log('PASS: album tags stripped, expected version required, private actor impersonation and non-member actors rejected');
})().catch(e=>{console.error(e);process.exitCode=1});
