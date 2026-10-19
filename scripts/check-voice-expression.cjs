// Isolated prompt and actual rich-message parsing; no model, TTS, or user storage.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
let provider='ElevenLabs',model='eleven_v4';
function load(file,deps){const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:out,require:name=>deps[name]||{},console});return out;}
const voice=load('lib/voice-expression.ts',{'./settings-storage':{loadBindingConfig:()=>({}),loadVoiceConfigs:()=>[{id:'vc',provider,model}],resolveBinding:(_b,id)=>({voiceConfigId:id==='char'?'vc':undefined})}});
const configuredGuidance = voice.VOICE_EXPRESSION_GUIDANCE_ENABLED;
if (!configuredGuidance) {
 assert.equal(voice.voiceExpressionInstruction(['char']), '');
 assert.equal(voice.voiceExpressionInstruction(['char'], true), '');
 console.log('PASS: comparison mode injects no voice guidance for chat/calls.');
}
// Exercise preserved rules in isolated module memory only; don't enable live guidance.
voice.VOICE_EXPRESSION_GUIDANCE_ENABLED = true;
const instruction=voice.voiceExpressionInstruction(['char']);
assert.match(instruction,/人设、关系、当前上下文/);assert.match(instruction,/teasing/);assert.match(instruction,/无奈/);assert.match(instruction,/只在 \[语音条/);
assert.match(instruction,/沉稳、克制/);assert.match(instruction,/小狗型/);assert.match(instruction,/按实际人设与关系选择/);
assert.doesNotMatch(instruction,/官方|保证|免责声明|导演指令/);
for(const direction of ['soft, composed, fondly teasing tone, gently falling intonation','bright, sincere, warmly teasing tone, gently rising intonation']) {
 assert.equal(voice.voiceDisplayText(`{voice:${direction}} 来啦？`),'来啦？');
 assert.equal(voice.voiceSpeechText(`{voice:${direction}} 来啦？`),`[${direction}] 来啦？`);
}
assert.match(voice.voiceExpressionInstruction(['char'],true),/当前为通话/);
assert.equal(voice.voiceExpressionInstruction(['other']),'');
provider='Minimax';assert.equal(voice.voiceExpressionInstruction(['char']),'');provider='ElevenLabs';model='eleven_multilingual_v2';assert.equal(voice.voiceExpressionInstruction(['char']),'');model='eleven_v4_turbo';assert.ok(voice.voiceExpressionInstruction(['char']));
const parser=load('lib/rich-message-parser.ts',{'./voice-expression':voice,'./state-value-parser':{parseStateValues:text=>({cleanText:text,stateValues:[]}),mergeStateValues:()=>[]},'./action-parser':{stripActionShells:text=>text},'./text-tool-protocol':{stripTextToolDirectives:text=>text},'./custom-app-chat-directives':{loadCustomAppChatDirectives:()=>[]},'./chat-echo':{canUseEcho:()=>false},'./image-grid-split':{isImageGridCount:()=>false}});
const raw='[语音条:{voice:chuckles} {voice:playful, teasing tone} 又熬夜了？]';
const part=parser.parseAIResponse(raw,[]).parts[0];
assert.equal(part.mediaType,'audio');assert.equal(part.mediaData.label,'又熬夜了？');assert.equal(part.mediaData.speechText,'[chuckles] [playful, teasing tone] 又熬夜了？');
const old=parser.parseAIResponse('[语音条:早上好。]',[]).parts[0];assert.equal(old.mediaData.label,'早上好。');assert.equal(old.mediaData.speechText,undefined);
assert.equal(voice.voiceDisplayText('{voice:sighs} 好吧。'),'好吧。');
assert.equal(voice.voiceSpeechText('{voice:sighs} 好吧。'),'[sighs] 好吧。');
assert.equal(voice.voiceDisplayText('普通消息：{其他字段}'),'普通消息：{其他字段}');
console.log('PASS: provider/model/character gating, persona/context/call guidance, actual voice-message parse, labels separated from speech, legacy voice compatibility; no paid calls.');
