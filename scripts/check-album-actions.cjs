const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {core:c,data}=require('./album-core-test-helper.cjs')();
let assets=c.attachPhotoVersions([{id:'album:a',source:{kind:'album',assetVersionId:'a'},mediaKind:'photo',mediaRef:'local:a',label:'风景',baseAnnotations:[],albumAnnotations:[]}]);
let allowed=true, revision='1', changedDuringFetch=false, avatars=0, messages=[],deleted=[];
const mods={
 './photo-album-core':c,
 './photo-album-storage':{collectPhotoAlbumAssets:()=>assets,resolvePhotoAlbumMedia:async()=>({url:'test:image',revoke:false})},
 './photo-album-discussion':{albumParticipants:()=>allowed?['char']:[],getAlbumDiscussion:()=>({comments:[]}),saveAlbumDiscussion:t=>messages.push(t)},
 './photo-album-permissions':{getAlbumPermission:()=>({revision})},
 './chat-storage':{loadChatSessions:()=>[{id:'private',contactId:'char'}],pushChatMessage:m=>messages.push(m)},
 './character-storage':{loadInteractableCharacters:()=>[{id:'char',name:'角色'}]},
 './media-cache-storage':{storeMediaBlob:async()=>`media-store://copy`,deleteMediaRef:async ref=>deleted.push(ref)},
 './chat-photo-markup':{compositePhotoAnnotations:async()=> 'data:image/jpeg;base64,doodle'},
 './chat-avatar-action':{setAvatarFromSharedAlbum:()=>{avatars++;return true}},
};
const box={exports:{},require:k=>{if(!mods[k])throw Error(k);return mods[k]},Date,Math,Set,URL,Blob,
 fetch:async()=>({ok:true,blob:async()=>{if(changedDuringFetch){allowed=false;revision='2'}return new Blob(['pixels'])}}),
 Image:class{naturalWidth=600;naturalHeight=800;set src(v){this.onload()}},document:{createElement:()=>({getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,avatar'})}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/photo-album-actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,box);
const run=box.exports.executeAlbumAction;
(async()=>{
 assert.equal(await run('char','album:a','forward','看看'),false,'Must actually have seen current photo');
 c.recordPhotoSeen(assets[0],'char','一片山',['你好']);
 assert.equal(await run('other','album:a','forward','看看'),false);
 changedDuringFetch=true;
 assert.equal(await run('char','album:a','forward','过期'),false,'Revoke during fetch blocks sending');assert.equal(messages.length,0);
 changedDuringFetch=false;allowed=true;revision='3';
 assert.ok(await run('char','album:a','forward','看这张'));
 assert.equal(messages[0].role,'assistant');assert.equal(messages[0].mediaUrl,'media-store://copy');assert.equal(messages[0].mediaData.albumPhotoId,'album:a');
 assert.equal(await run('char','album:a','forward','重复'),false);
 assert.equal(await run('char','album:a','avatar','重复'),false,'Burst frequency bounded across actions');
 assert.ok(await run('char','album:a','comment','有意思'));assert.equal(await run('char','album:a','comment','重复'),false);
 data.clear();
 c.recordPhotoSeen(assets[0],'char','一片山',[]);
 assert.ok(await run('char','album:a','avatar','喜欢'));assert.equal(avatars,1);
 assets=[{...assets[0],source:{kind:'chat',sessionId:'private',messageId:'a'}}];
 assert.equal(await run('char','album:a','forward','聊天收藏不可自主转发'),false);
 console.log('PASS: autonomous actions, existing destination, sender identity, permission race, seen/version gate, idempotence, avatar and source boundary');
})().catch(e=>{console.error(e);process.exitCode=1});
