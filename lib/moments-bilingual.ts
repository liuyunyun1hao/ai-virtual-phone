import { DEFAULT_MOMENTS_BILINGUAL_PROMPT, resolveBilingualPrompt } from "./bilingual-prompt-defaults";
import type { LLMMessage } from "./llm-prompt-assembler";

export function buildMomentsBilingualInstruction(enabled: boolean, customPrompt?: string): string {
    const prompt = resolveBilingualPrompt(enabled, customPrompt, DEFAULT_MOMENTS_BILINGUAL_PROMPT);
    if (!prompt || prompt.includes(DEFAULT_MOMENTS_BILINGUAL_PROMPT)) return prompt;
    // Keep saved preferences, including older defaults, with the current output protocol.
    return `${prompt}\n${DEFAULT_MOMENTS_BILINGUAL_PROMPT}`;
}

export function ensureMomentsBilingualInstruction(messages: LLMMessage[], instruction?: string): void {
    const rule = instruction?.trim();
    if (!rule || messages.some(message => message.role === "system"
        && typeof message.content === "string" && message.content.includes(rule))) return;
    messages.push({ role: "system", content: rule, _debugMeta: { marker: "moments_bilingual" } });
}
