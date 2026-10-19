const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const refs=['user','char1','char2','char3'].map(s=>'data:image/png;base64,'+Buffer.from(s).toString('base64'));
const settings={enabled:true,apiKey:'mock',baseUrl:'https://mock.invalid/v1',model:'mock',extraPrompt:'',requestMode:'direct',characterReferences:{}};
let captured, cors=false;
const mockedFetch=async(url,options)=>{
 if(cors && url!=='/api/image-generation') throw new TypeError('mock CORS');
 captured={url,options};
 return new Response(JSON.stringify(url==='/api/image-generation'?{b64:'eA=='}:{data:[{b64_json:'eA=='}]}),{headers:{'content-type':'application/json'}});
};
const box={exports:{},require:k=>({'./settings-storage':{loadImageGenerationSettings:()=>settings},'./chat-asset-storage':{},'./media-cache-storage':{},'./abort-utils':{throwIfAborted(){}}}[k]),process:{env:{}},fetch:mockedFetch,Blob,FormData,Response,AbortController,Uint8Array,atob,setTimeout,clearTimeout,TypeError,Set};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/image-generation-service.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,box);
(async()=>{
 const result=await box.exports.generateImageFromConfiguredApi({description:'test',referenceImageDataUrls:refs,persistResult:false});
 assert.equal(result.usedReferenceImage,true);
 assert.equal(captured.options.body.getAll('image[]').length,4);
 assert.deepEqual(await Promise.all(captured.options.body.getAll('image[]').map(b=>b.text())),['user','char1','char2','char3']);
 await box.exports.generateImageFromConfiguredApi({description:'test',referenceImageDataUrl:refs[0],persistResult:false});
 assert.equal(captured.options.body.getAll('image').length,1,'Legacy single image API is preserved');
 settings.requestMode='server';cors=true;
 await box.exports.generateImageFromConfiguredApi({description:'test',referenceImageDataUrls:refs,persistResult:false});
 assert.equal(captured.url,'/api/image-generation');
 assert.deepEqual(JSON.parse(captured.options.body).referenceImageDataUrls,refs);
 const server={exports:{},require:k=>k==='next/server'?{NextResponse:{json:(body,init)=>Response.json(body,init)}}:{ProxyAgent:class{}},process:{env:{}},fetch:async(url,options)=>{captured={url,options};return Response.json({data:[{b64_json:'eA=='}]});},Blob,FormData,Buffer,Response,AbortController,setTimeout,clearTimeout};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/image-generation/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,server);
 const response=await server.exports.POST({json:async()=>({...settings,prompt:'test',referenceImageDataUrls:refs}),headers:new Headers()});
 assert.equal(response.status,200);
 assert.equal(captured.options.body.getAll('image[]').length,4);
 console.log('PASS: ordered multi-reference direct + server transport, legacy single image compatibility (mock fetch only)');
})().catch(e=>{console.error(e);process.exitCode=1});
