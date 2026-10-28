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
