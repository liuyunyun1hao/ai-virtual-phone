export type MentionMember = { id: string; name: string; avatar?: string | null };
export type DraftMention = { characterId: string; name: string; start: number; end: number };

export function mentionQuery(text: string, caret: number) {
    const prefix = text.slice(0, caret);
    const match = /(?:^|[\s\p{Script=Han}，。！？、：；（(])@([^@\n，。！？：；]*)$/u.exec(prefix);
    if (!match) return null;
    return { start: caret - match[1].length - 1, end: caret, query: match[1] };
}

// Keep identity only while the selected token survives an edit intact.
export function rebaseMentions(before: string, after: string, mentions: DraftMention[]): DraftMention[] {
    let start = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) start++;
    let oldEnd = before.length, newEnd = after.length;
    while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
    return mentions.flatMap(m => {
        if (m.end <= start) return [m];
        if (m.start >= oldEnd) return [{ ...m, start: m.start + newEnd - oldEnd, end: m.end + newEnd - oldEnd }];
        return [];
    }).filter(m => after.slice(m.start, m.end) === `@${m.name}`);
}
