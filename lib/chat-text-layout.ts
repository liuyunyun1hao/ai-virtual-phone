/** Display-only cleanup for ordinary assistant text; never rewrites saved/API history. */
export function normalizeChatTextLayout(text: string): string {
    const normalized = text.replace(/\r\n?/g, "\n");
    // Structured/explicit line layouts are intentional, not chat soft wrapping.
    if (/\n\s*\n|```|~~~|<[^>]+>|\[[^\]]+\]| {2}\n|\\\n|(^|\n)\s*(?:[-*+]\s|\d+[.)]\s|>|#{1,6}\s)|\|/m.test(normalized)) return text;
    const lines = normalized.split("\n");
    // Preserve short multi-line verse even without explicit Markdown breaks.
    if (lines.length >= 3 && lines.every(line => line.trim().length <= 18)) return text;
    const softWrapped = normalized.replace(/\n[ \t]*(?=\S)/g, (breakText: string, offset: number) => {
        const left = normalized[offset - 1] ?? "";
        const right = normalized[offset + breakText.length] ?? "";
        const join = /[\u3400-\u9fff]/.test(left) && /[\u3400-\u9fff]/.test(right)
            || /[，。！？；：、）”’]/.test(right) || /[（“‘]/.test(left);
        return join ? "" : " ";
    });
    // Bind a short emoji suffix to the preceding word rather than strand it on
    // its own line. Display only; explicit Markdown/poetry above stays untouched.
    const laidOut = softWrapped.replace(/([^\s]) ([\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D]+)$/u, "$1\u00a0$2");
    // A short Chinese chat bubble already supplies the pause. Only trim its
    // trailing comma; keep sentence-internal punctuation and long prose intact.
    // This is display-only, shared by original/translation after bilingual split.
    if (/[\u3400-\u9fff]/.test(laidOut) && Array.from(laidOut.trim()).length <= 60) {
        return laidOut.replace(/[，,]+([ \t]*)$/, "$1");
    }
    return laidOut;
}
