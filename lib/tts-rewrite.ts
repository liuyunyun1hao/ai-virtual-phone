/**
 * TTS 配音脚本改写器。
 *
 * 为什么要它
 * ----------
 * ElevenLabs 的 v3/v4 支持"音频标签"（[whispers] / [exhales softly]），
 * 但模型不会自己产出这些标签 —— 得有人把台词改写成配音脚本。
 * 这里就是那个改写器：送 TTS 之前先过一遍，把平铺的句子改出呼吸和情绪。
 *
 * 什么时候跑
 * ----------
 * 在 synthesizeSpeech 里跑（可选开启）。好处是四个调用点
 * （消息语音条 / 语音通话 / 视频通话 / 群组通话）自动全覆盖。
 *
 * 语音条那条消息只会改写一次：合成完音频后，应用会把"用来合成的文本"
 * 和音频一起存在这条消息上（synthesizedFromText），重播不再花这次调用。
 */

import { loadApiConfigs } from "./settings-storage";
import { simpleLLMCall } from "./api-helpers";
import type { ApiConfig } from "./settings-types";

/**
 * 系统提示词。
 *
 * 原始版本是用户给的（英文标签 + 中文规则），这里做了几处调整：
 *  1. 去掉对话式的收尾（"请回复已就绪…"）—— 那是聊天用法，走 API 会把这句话
 *     本身当成任务的一部分回答出来。换成明确的输出契约。
 *  2. 把"不要长篇大论"这类要求写成可判定的约束（一个标签最多管两句）。
 *  3. 补三条硬约束：不改语言、不增删内容、不加旁白/说话人/引号。
 *     这三条是最常翻车的地方 —— 模型很容易把台词重写一遍再加旁白。
 */
export const TTS_REWRITE_SYSTEM_PROMPT = `你把用户给的原始文本改写成 TTS 配音脚本。只输出改写后的脚本本身，不要解释、不要复述原文、不要加引号或 markdown。

【一、强制换气与碎片化】
不要保留长句。用省略号（...）和破折号（—）把句子切碎，模拟思考、犹豫、喘息、换气。
❌ I don't know what you are talking about.
✅ I don't know... [short pause] what you're talking about.

【二、用动作标签，不用情绪词】
禁止 [sad] [angry] [happy] [calm] 这类干瘪的情绪标签。
必须用物理动作、呼吸状态或发声质感：
[exhales softly] [takes a slow breath] [swallows hard] [breath hitches] [chuckles airy]
[voice dropping lower] [breathy, close to the mic] [whispering]

【三、高频打标】
一个标签最多管两个短句。语气、语速或情绪一变，立刻插新标签。
不插的话，AI 会变成平直的朗读机器。

【四、亲密/暧昧场景】
不要直接写 [kisses] 或拟声词 —— AI 会把它们念出来，气氛全毁。
改用：[sharp inhale]（倒吸气）、[exhales shakily]（颤抖呼气）、[swallows thickly]（沉重吞咽），
配合省略号营造。整体音量压低，用 [barely a whisper] 或 [lips brushing the mic]。

【五、外语与重音隔离】
遇到外语词汇，或需要重读的词，必须加前置标签：
[switching to Spanish, low] No puedo verlo.
[drawn out, emphasizing] never.

【硬约束 —— 违反任何一条都算失败】
· 语言不变：原文是中文就输出中文，是英文就输出英文。标签本身用英文。
· 内容不增不减：不许自己编台词，不许删掉信息，不许合并成一句概括。
· 不加旁白、不加说话人名字、不加引号、不加代码块。
· 第一个字符就是脚本本身。

—— 输出示例 ——
[breathy, close to mic] I didn't want to say this... [short pause] but you left me no choice.
[exhales slowly] Fine... [voice dropping lower] let's do it your way.`;

/** 模型偶尔还是会裹一层引号或说明，兜底剥掉 */
function stripWrapper(raw: string): string {
    let t = raw.trim();
    // 剥 markdown 代码块
    t = t.replace(/^```[a-z]*\s*/i, "").replace(/```$/, "").trim();
    // 剥整段包裹的引号（只剥首尾成对的那种，别动台词里的引号）
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("“") && t.endsWith("”"))) {
        const inner = t.slice(1, -1).trim();
        if (inner && !inner.includes("\n\n")) t = inner;
    }
    // 模型有时会自作多情加一行前缀
    t = t.replace(/^(改写后(的)?(脚本|文本|结果)?[:：]\s*)/, "").trim();
    return t;
}

export type TtsRewriteResult = { text: string; error?: string; usedConfigId?: string };

/**
 * 把台词改写成配音脚本。
 * 任何一步失败都返回原文 —— 改写是锦上添花，不该让语音直接失败。
 */
export async function rewriteForTts(
    text: string,
    options?: { apiConfigId?: string; signal?: AbortSignal },
): Promise<TtsRewriteResult> {
    const original = text;
    if (!original.trim()) return { text: original };

    let configs: ApiConfig[] = [];
    try {
        configs = loadApiConfigs();
    } catch {
        return { text: original, error: "读不到 API 配置" };
    }
    if (!configs.length) return { text: original, error: "没有可用的 API 配置" };

    const config = options?.apiConfigId
        ? configs.find(c => c.id === options.apiConfigId)
        : undefined;
    const picked = config || configs[0];

    try {
        const result = await simpleLLMCall(
            picked,
            [
                { role: "system", content: TTS_REWRITE_SYSTEM_PROMPT },
                { role: "user", content: original },
            ],
            // 温度高一点：改写的价值就在于有起伏，太低会退回成平铺的句子。
            // max_tokens 给足 —— 推理模型会先烧一截在思考上。
            { temperature: 1.0, max_tokens: 4096, signal: options?.signal, label: "tts-rewrite" },
        );
        const out = result.content ? stripWrapper(result.content) : "";
        if (!out) return { text: original, error: result.error || "改写返回空" };
        return { text: out, usedConfigId: picked.id };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { text: original, error: msg };
    }
}
