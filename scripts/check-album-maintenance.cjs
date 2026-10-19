const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
let deletes=0,updates=0,pages=0;
const messages=Array.from({length:7230},(_,i)=>({id:String(i).padStart(5,'0'),sessionId:'s',content:'text',mediaType:undefined}));
const pageFrom=start=>({limit:n=>({toArray:async()=>{pages++;return messages.slice(start,start+n)}})});
const mocks={
 './kv-db':{registerKvMigration(){}},
 './photo-album-storage':{isFavoriteChatPhoto:(_,id)=>id==='fav',collectPhotoAlbumAssets:()=>{throw Error('Cleanup must not collect album histories')}},
 './media-cache-storage':{isMediaStoreRef:()=>true,loadMediaBlob:async()=>({blob:new Blob(['x'])}),deleteMediaRef:async()=>deletes++},
 './chat-storage':{updateChatMessage:()=>{updates++;return null}},
 './chat-db':{chatDb:{transaction:async(_mode,_table,fn)=>fn(),messages:{get:async id=>({id,mediaUrl:"media-store://other"}),put:async()=>{},orderBy:()=>pageFrom(0),where:()=>({above:id=>pageFrom(Number(id)+1)})}}},
 './data-management/serializers':{estimateValueBytes:()=>1},
};
const box={exports:{},require:k=>mocks[k]||{},Date,Set,Blob,setTimeout:fn=>fn()};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/media-maintenance.ts','utf8')+'\nexports.testRun=runChatImageMaintenance;',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,box);
(async()=>{
 assert.equal(await box.exports.cleanChatImage({id:'fav',mediaUrl:'media-store://fav'},new Date().toISOString()),0);
 assert.equal(deletes,0);assert.equal(updates,0);
 await box.exports.cleanChatImage({id:'not-fav',mediaUrl:'media-store://other'},new Date().toISOString());
 assert.equal(deletes,1);assert.equal(updates,1);
 await box.exports.testRun({freedBytes:0,chatImagesCleaned:0,chatImagesCompressed:0},Date.now(),new Date().toISOString());
 assert.equal(pages,Math.ceil(7230/32)+1,'Messages must be paged instead of materializing the entire table');
 console.log('PASS: automatic cleanup protects album favorites while normal cleanup still works');
})().catch(e=>{console.error(e);process.exitCode=1});
