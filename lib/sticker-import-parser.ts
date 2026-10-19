export interface StickerUrlRow { name: string; url: string }

export function stickerNameFromUrl(url: string, index = 0): string {
    try {
        const filename = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '');
        return filename.replace(/\.[^.]+$/, '').trim() || `表情${index + 1}`;
    } catch { return `表情${index + 1}`; }
}

function normalizeUrl(value: string): string | null {
    try {
        const url = new URL(value.trim());
        return /^https?:$/.test(url.protocol) && url.hostname && !url.username && !url.password ? url.href : null;
    } catch { return null; }
}

function cleanLabel(value: string): string {
    return value.trim()
        .replace(/^[\s,，;；|\[\]{}"'`!*#>]+/, '')
        .replace(/^\d+[.)、．]\s*/, '')
        .replace(/^[-–—]\s+/, '')
        .replace(/[\s:：=,，;；|\[\]{}"'`!(<]+$/, '')
        .replace(/\s*[-–—]{2,}\s*$/, '')
        .trim();
}

/** Extract pairs locally. Never fetch pasted URLs: CORS/hotlink failures aren't parse failures. */
export function parseStickerImport(text: string): { rows: StickerUrlRow[]; invalid: number; duplicates: number } {
    const rows: StickerUrlRow[] = [];
    const seen = new Set<string>();
    let invalid = 0, duplicates = 0;
    const add = (name: string, raw: string) => {
        const url = normalizeUrl(raw);
        if (!url) { invalid++; return; }
        if (seen.has(url)) { duplicates++; return; }
        seen.add(url);
        rows.push({ name: cleanLabel(name) || stickerNameFromUrl(url, rows.length), url });
    };
    const scan = (source: string, fallback = '') => {
        // Common packed lists use ASCII punctuation without spaces. Split only when a
        // following description + new HTTP URL makes the separator unambiguous.
        source = source.replace(/[,;|](?=[^,;|\r\n?&]{1,120}[:：=]\s*https?:\/\/)/gi, '\n');
        // Quotes and CJK separators are prose delimiters; retain URL queries, fragments and semicolons.
        const re = /https?:\/\/[^\s<>"'`，。；、｜]+/gi;
        let end = 0;
        for (const match of source.matchAll(re)) {
            let raw = match[0];
            // Remove unmatched Markdown/JSON closers, not balanced parentheses inside a URL.
            if (!/[?#]/.test(raw)) raw = raw.replace(/[.,;!]+$/, '');
            for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
                while (raw.endsWith(close) && raw.split(close).length > raw.split(open).length) raw = raw.slice(0, -1);
            }
            const prefix = source.slice(end, match.index);
            const lines = prefix.split(/\r?\n/).map(cleanLabel).filter(Boolean);
            const name = lines.at(-1) || fallback;
            add(name, raw);
            end = match.index! + match[0].length;
        }
    };
    const input = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let structured: unknown;
    try { structured = JSON.parse(input); } catch { /* Plain text/Markdown/CSV below. */ }
    const visit = (value: unknown, hint = '', depth = 0): void => {
        if (depth > 30) return;
        if (typeof value === 'string') { scan(value, hint); return; }
        if (Array.isArray(value)) {
            if (value.length === 2 && value.every(v => typeof v === 'string') && !/https?:\/\//i.test(value[0]) && /^https?:\/\//i.test(value[1])) {
                scan(value[1], value[0]);
            } else value.forEach(v => visit(v, hint, depth + 1));
            return;
        }
        if (!value || typeof value !== 'object') return;
        const obj = value as Record<string, unknown>;
        const nameKeys = ['name', 'description', 'desc', 'label', 'title', 'text', '名称', '描述', '表述', '表情'];
        const nameKey = nameKeys.find(k => typeof obj[k] === 'string');
        const name = nameKey ? String(obj[nameKey]) : hint;
        Object.entries(obj).forEach(([key, child]) => {
            const labelKey = typeof child === 'string' && !/^(url|src|uri|image_?url|图片链接|链接)$/i.test(key) ? key : '';
            if (key !== nameKey) visit(child, name || labelKey, depth + 1);
        });
    };
    if (structured !== undefined) visit(structured);
    else {
        const lines = input.split(/\r?\n/).filter(line => line.trim());
        let jsonLines: unknown[] | undefined;
        try { jsonLines = lines.map(line => JSON.parse(line)); } catch { /* Mixed prose. */ }
        if (jsonLines?.length) jsonLines.forEach(value => visit(value));
        else scan(input.replace(/https?:\\\/\\\//gi, s => s.replace(/\\/g, '')));
    }
    return { rows, invalid, duplicates };
}

/** Keep descriptions usable as sticker identifiers without blocking a whole batch on a collision. */
export function uniqueStickerNames(rows: StickerUrlRow[], existing: Iterable<string>): StickerUrlRow[] {
    const used = new Set(Array.from(existing, name => name.trim().toLowerCase()));
    return rows.map(row => {
        const base = row.name.trim() || '表情';
        let name = base, number = 2;
        while (used.has(name.toLowerCase())) name = `${base} (${number++})`;
        used.add(name.toLowerCase());
        return { ...row, name };
    });
}
