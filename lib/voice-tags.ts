// 语音条里的「[轻声吸气]」「[压低声音]」这类方括号标注是给 TTS 引擎的表现力
// 提示（ElevenLabs 的音频标签），不是给人看的内容。转文字、编辑框、聊天记录
// 摘要都应当把它们隐藏掉，只在真正合成（且引擎支持标签）时才把原文送出去。

/** 单个标签：不跨行、不超过 40 字，避免把普通方括号内容整段吞掉。
 *  容错：模型偶尔会用全角方括号【】或［］写标注，这些也要隐藏。 */
const VOICE_TAG_RE = /[\[【［][^\[\]【】［］\r\n]{1,40}[\]】］]/g;

/** 判断一段语音条文字里是否含表现力标注。 */
export function hasVoiceTag(text: string | undefined | null): boolean {
  if (!text) return false;
  VOICE_TAG_RE.lastIndex = 0;
  return VOICE_TAG_RE.test(text);
}

/**
 * 去掉语音条里的方括号标注，并清理标记留下的多余空格与标点前的空白。
 * `[轻笑]嗯？` → `嗯？`；`我[停顿]…没事` → `我…没事`
 */
export function stripVoiceTags(text: string | undefined | null): string {
  if (!text) return "";
  return text
    .replace(VOICE_TAG_RE, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([，。！？、；：…—,.!?;:)）])/g, "$1")
    .replace(/([（(])[ \t]+/g, "$1")
    .replace(/([—…])\s+/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .replace(/^\s+|\s+$/g, "");
}

/** 某些引擎会把标签当正文读出来，只有 ElevenLabs 原生支持音频标签。 */
export function voiceTagsSupportedByProvider(provider: string | undefined): boolean {
  return provider === "ElevenLabs";
}


/** 追加到系统提示词末尾的硬约束。模型最容易在括号种类、全角冒号、
 *  括号嵌套三处写错，写错了整条语音条会退化成乱码文字。 */
export const VOICE_FORMAT_RULE = [
    "\n【语音条格式 · 硬约束】",
    "1. 只允许半角方括号 + 半角冒号：`[语音条:内容]`，冒号前后不要换行。",
    "2. 内容里的语气标注也只能用半角方括号，紧跟在内容里：`[语音条:[贴近麦克风, 气声]你今天…怎么才回我。]`。",
    "3. 禁止用【】、［］、（）、“”、<> 包裹；禁止写成「语音条：」或 [语音条]…[/语音条]；方括号里不许再套方括号（语气标注除外）。",
    "4. 一条语音只写一条 [语音条:...]，不要把它写进 [内心] 或旁白里。",
    "格式写错时这条消息会原样显示成文字、用户听不到语音——宁可不用语音条，也不要写错格式。",
].join("\n");
