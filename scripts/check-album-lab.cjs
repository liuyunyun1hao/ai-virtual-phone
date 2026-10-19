const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const records=[],messages=[],deleted=[],events=[];
const { core } = require('./album-core-test-helper.cjs')();
let calls=0, failSplit=false, enabled=true, request;
const modules={
 './photo-album-core':core,
 './photo-album-permissions':{GENERATED_ALBUM_PERMISSION:'::float-generated-album::'},
 './image-generation-service':{generateImageFromConfiguredApi:async p=>{calls++;request=p;return enabled?{mediaRef:'sheet',blob:new Blob(['photo'])}:null;}},
 './settings-storage':{loadImageGenerationSettings:()=>({size:'1024x1024',model:'test',enabled:true,characterReferences:{char:{assetId:'ref1'},char2:{assetId:'ref2'},char3:{assetId:'ref3'}}})},
 './character-storage':{loadCharacters:()=>[{id:'char',name:'角色一'},{id:'char2',name:'角色二'},{id:'char3',name:'角色三'}]},
 './image-delivery-protocol':{MULTI_IMAGE_TARGET_CELL_ASPECT_RATIO:.84,createPhotoGroupPlan:(count,prompt)=>({count,prompt}),buildMultiImageSheetPrompt:plan=>({prompt:plan.prompt,layout:{count:plan.count},canvasGuidance:{}}),resolveMultiImageGenerationSize:()=>({size:'custom'})},
 './image-grid-split':{splitImageGrid:async(_,layout)=>{if(failSplit)throw Error('split failed');return Array.from({length:layout.count},()=>new Blob(['tile'],{type:'image/jpeg'}));}},
 './media-cache-storage':{storeMediaBlob:async()=>`tile-${Math.random()}`,deleteMediaRef:async ref=>deleted.push(ref)},
 './photo-album-storage':{collectPhotoAlbumAssets:()=>core.attachPhotoVersions(records.map(r=>({...r,id:`album:${r.assetVersionId}`,source:{kind:'album',assetVersionId:r.assetVersionId},baseAnnotations:[],albumAnnotations:[]}))),upsertAlbumNativeAsset:r=>records.push(r),photoAlbumSourceId:s=>`album:${s.assetVersionId}`,resolvePhotoAlbumMedia:async()=>({url:'data:image/png;base64,eA==',revoke:false})},
 './chat-asset-storage':{getChatImageFromIndexedDB:async id=>'data:'+id},
 './chat-storage':{loadChatSessions:()=>[{id:'session-char',contactId:'char'},{id:'origin',contactId:'source'},{id:'group-origin',isGroup:true}],loadChatMessages:()=>[{id:'group-photo',senderCharacterId:'source'}],pushChatMessage:m=>messages.push(m),CHAT_REQUEST_REPLY_EVENT:'request-reply'},
};
const box={exports:{},require:k=>modules[k],Date,Math,Blob,fetch:async()=>({ok:true,blob:async()=>new Blob(['copy'])}),window:{dispatchEvent:e=>events.push(e)},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/photo-album-lab.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,box);
(async()=>{
 for(const count of [1,2,4,6,9]){
  const before=records.length,oldCalls=calls;
  const ids=await box.exports.generateAlbumPhotos('风景',count);
  assert.equal(ids.length,count);assert.equal(records.length,before,'Generation must not save to album');assert.equal(calls-oldCalls,1);
  assert.equal(request.persistResult,false);
  assert.equal(request.settings.extraPrompt,'');
  await box.exports.saveAlbumDraft(ids[0]);
  assert.equal(records.length,before+1);
  assert.equal(request.settings.size,count===1?'1024x1024':'custom');
 }
 const before=records.length;
 failSplit=true;
 await assert.rejects(()=>box.exports.generateAlbumPhotos('失败',4));
 assert.equal(records.length,before);
 failSplit=false;enabled=false;
 await assert.rejects(()=>box.exports.generateAlbumPhotos('无 API',1));
 assert.equal(records.length,before);
 const asset={...modules['./photo-album-storage'].collectPhotoAlbumAssets()[0],mediaKind:'photo'};
 await assert.rejects(()=>box.exports.forwardAlbumPhoto(asset,'no-session'));
 await assert.rejects(()=>box.exports.forwardAlbumPhoto({...asset,source:{kind:'chat',sessionId:'origin'}},'origin'));
 const groupSource={...asset,source:{kind:'chat',sessionId:'group-origin',messageId:'group-photo'}};
 await assert.rejects(()=>box.exports.forwardAlbumPhoto(groupSource,'origin'));
 await assert.rejects(()=>box.exports.forwardAlbumPhoto(groupSource,'group-origin'));
 await box.exports.forwardAlbumPhoto(asset,'session-char');
 assert.ok(messages[0].mediaUrl.startsWith('tile-'));
 assert.notEqual(messages[0].mediaUrl,'original');
 assert.equal(messages[0].sessionId,'session-char');
 assert.equal(events[0].type,'request-reply');
 enabled=true;
 const draft=await box.exports.generateAlbumPhotos('DIY',1,['char','char2','char3'],'data:user-reference');
 assert.deepEqual(Array.from(request.referenceImageDataUrls),['data:user-reference','data:ref1','data:ref2','data:ref3']);
 assert.ok(request.description.includes('参考图4对应角色「角色三」'));
 await assert.rejects(()=>box.exports.generateAlbumPhotos('DIY',1,['char','char2','char3','four']));
 await assert.rejects(()=>box.exports.generateAlbumPhotos('DIY',1,['missing']));
 await box.exports.saveAlbumDraft(draft[0],'我的上传');
 assert.equal(records.at(-1).uploadAlbum,'我的上传');
 console.log('PASS: 1/2/4/6/9 generation, one API call, automatic sizes, persistence, failure cleanup and independent chat forwarding');
})().catch(e=>{console.error(e);process.exitCode=1});
