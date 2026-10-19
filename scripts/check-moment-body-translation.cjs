const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>mocks[n]||{},AbortController,setTimeout,clearTimeout,Event,window:{dispatchEvent(){}}});return exports;}
const parser=load('lib/bilingual-text.ts');
let post,revision=1,calls=0,finish;
const mod=load('lib/moment-body-translation.ts',{
 './bilingual-text':parser,
 './identity-runtime':{currentIdentityCloudTag:()=>({userIdentityId:'a',identityRevision:revision})},
 './settings-storage':{resolveAuxiliaryApiConfig:()=>({})},
 './moments-storage':{loadMomentPosts:()=>post?[post]:[],updateMomentPost:(id,patch)=>Object.assign(post,patch)},
 './api-helpers':{simpleLLMCall:async()=>{calls++;return await new Promise(r=>finish=r)}}
});
const needs=mod.needsMomentBodyTranslation;
assert.equal(needs('今天真的很chill'),false);
assert.equal(needs('今天听了Taylor Swift的新歌'),false);
assert.equal(needs('Sunday afternoon at the table. Shen and Zhou are already looking nervous before the first deal. 🥃'),true);
assert.equal(needs('今天很好。 I miss you.'),true);
assert.equal(needs('今日はとても楽しいです'),true);
assert.equal(needs('Rain again.|又下雨了。'),false);
(async()=>{
post={id:'p',content:'Sunday afternoon at the table.'};
const a=mod.translateMomentBody('p'),b=mod.translateMomentBody('p');assert.equal(a,b);assert.equal(calls,1);
finish({content:'周日下午，大家坐在桌边。'});await a;assert.equal(post.content,'Sunday afternoon at the table.');assert.equal(post.contentTranslation,'周日下午，大家坐在桌边。');
await mod.translateMomentBody('p');assert.equal(calls,1);
post={id:'p',content:'Rain again.'};const c=mod.translateMomentBody('p');revision++;finish({content:'又下雨了。'});await c;assert.equal(post.contentTranslation,undefined);
const d=mod.translateMomentBody('p');post.content='Edited body.';finish({content:'又下雨了。'});await d;assert.equal(post.contentTranslation,undefined);
const e=mod.translateMomentBody('p');finish({content:'No translation.'});await assert.rejects(e,/未获得有效中文译文/);
const f=mod.translateMomentBody('p');post=null;finish({content:'修改后的正文。'});await f;
post={id:'lyric',content:'Song and lyrics plus caption',musicLyricShare:{caption:'Stay here with me.'}};
assert.equal(mod.momentTranslationSource(post),'Stay here with me.');
const lyric=mod.translateMomentBody('lyric');finish({content:'留在这里陪我。'});await lyric;
assert.equal(post.contentTranslationSource,'Stay here with me.');
assert.equal(post.contentTranslation,'留在这里陪我。');
post.musicLyricShare.caption='';assert.equal(mod.momentTranslationSource(post),'');
const before=calls;await mod.translateMomentBody('lyric');assert.equal(calls,before);
post.musicLyricShare.caption='New caption.';const stale=mod.translateMomentBody('lyric');post.musicLyricShare.caption='Changed caption.';finish({content:'新的附言。'});await stale;
assert.equal(post.contentTranslationSource,'Stay here with me.');
console.log('Moments body translation: language, cache, dedup, identity/edit/delete guards, lyric caption/clear/stale response checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
