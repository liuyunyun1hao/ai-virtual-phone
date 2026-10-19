// Request construction only: no API key, network or paid speech generation.
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/elevenlabs-tts.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {exports:api,URL});
for (const model of ['eleven_v3','eleven_v4','eleven_v4_turbo']) {
  assert.ok(api.ELEVENLABS_MODELS.includes(model));
  const request=api.elevenLabsSpeechRequest('[whispers] 你好',{model:` ${model} `,defaultVoice:'voice/test'});
  assert.equal(request.body.model_id,model);
  if(model==='eleven_v3') assert.equal(request.body.voice_settings,undefined);
  else assert.deepEqual(JSON.parse(JSON.stringify(request.body.voice_settings)),{stability:.5,similarity_boost:.75});
  assert.equal(request.body.text,'[whispers] 你好');
  assert.match(request.url,/voice%2Ftest\?output_format=mp3_44100_128$/);
  assert.equal(api.usesElevenLabsAccountVoiceSettings(` ${model} `),model==='eleven_v3');
}
for(const model of ['eleven_v4','eleven_v4_turbo']){
 const request=api.elevenLabsSpeechRequest('こんにちは',{model,defaultVoice:'test',speechSpeed:1.2,elevenLabs:{stability:.3,similarity:.8,languageCode:' JA ',style:1,speakerBoost:true}});
 assert.equal(request.body.language_code,'ja');
 assert.deepEqual(JSON.parse(JSON.stringify(request.body.voice_settings)),{stability:.3,similarity_boost:.8});
 assert.equal(api.elevenLabsSpeechRequest('你好',{model,defaultVoice:'test'}).body.language_code,undefined);
 assert.throws(()=>api.elevenLabsSpeechRequest('hi',{model,defaultVoice:'test',elevenLabs:{languageCode:'Japanese'}}));
}
assert.equal(api.elevenLabsSpeechRequest('hi',{model:'eleven_v3',defaultVoice:'test',elevenLabs:{languageCode:'ja'}}).body.language_code,undefined);
const old=api.elevenLabsSpeechRequest('你好',{defaultVoice:'test',speechSpeed:99,elevenLabs:{stability:-1}});
assert.equal(old.body.model_id,'eleven_multilingual_v2');
assert.equal(old.body.voice_settings.speed,1.2);
assert.equal(old.body.voice_settings.stability,0);
assert.throws(()=>api.elevenLabsSpeechRequest('你好',{model:'eleven_v4',defaultVoice:''}));
console.log('PASS: v4 stability/similarity and explicit/auto language, no obsolete settings, v3 unchanged, tags and legacy defaults; no synthesis.');
