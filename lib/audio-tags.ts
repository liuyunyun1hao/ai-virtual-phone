/**
 * 方括号语气标签的统一处理（[whispers] / [exhales softly] / [轻笑] 这类）。
 *
 * 抽成独立模块的原因：两个地方都要用它，规则必须一致 ——
 *   · 显示层（message-bubble）：按开关决定是否从气泡里抹掉
 *   · 合成层（tts-service）：只有 ElevenLabs 的 v3/v4 会"演"这些标签，
 *     换别的服务商会逐字念出来，必须剥掉
 * 两边各写一份迟早会不一致。
 */

/**
 * 匹配"像语气标签"的方括号片段。
 *
 * 故意收得很紧，避免误伤正文：
 *   · 单行、长度 ≤ 40 —— 长的是正文而不是标签
 *   · 内部不含冒号/方括号 —— `[红包:5.00:1]`、`[获取指令:x]` 这类结构化标记
 *     由 message-bubble 里更早的规则处理，这里不碰
 *   · 排除纯数字（`[1]` 这种脚注引用留着）
 *   · 后面紧跟 `(` 或 `[` 的不碰 —— 那是 markdown 链接/引用语法，
 *     把 `[链接](url)` 的文字剥掉会把链接整个弄坏（实测踩到过）
 */
export const AUDIO_TAG_PATTERN = /\[(?!\d+\])[^[\]\n：:]{1,40}\](?!\(|\[)/g;

/** 判断一段文本里有没有语气标签 */
export function hasAudioTags(text: string): boolean {
    AUDIO_TAG_PATTERN.lastIndex = 0;
    return AUDIO_TAG_PATTERN.test(text);
}

/**
 * 剥掉语气标签。
 * 剥完顺手收一下连续空白和重复省略号，别留下 "……  …" 这种空洞。
 */
export function stripAudioTags(text: string): string {
    return text
        .replace(AUDIO_TAG_PATTERN, " ")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\.{3,}/g, "…")
        .replace(/(…\s*){2,}/g, "…")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
