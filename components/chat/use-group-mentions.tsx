import { useEffect, useId, useRef, useState, type RefObject, type KeyboardEvent } from "react";
import { mentionQuery, rebaseMentions, type DraftMention, type MentionMember } from "@/lib/group-mentions";

export function useGroupMentions(text: string, setText: (text: string) => void, textarea: RefObject<HTMLTextAreaElement | null>, members: MentionMember[], enabled: boolean) {
    const listId = useId();
    const [caret, setCaret] = useState(0);
    const [closed, setClosed] = useState(false);
    const [active, setActive] = useState(0);
    const [composing, setComposing] = useState(false);
    const tracked = useRef<{ text: string; mentions: DraftMention[] }>({ text: "", mentions: [] });
    const sync = (next: string) => {
        tracked.current = { text: next, mentions: rebaseMentions(tracked.current.text, next, tracked.current.mentions) };
    };
    useEffect(() => { sync(text); }, [text]);
    const rawQuery = enabled && !closed && !composing ? mentionQuery(text, caret) : null;
    const query = rawQuery && tracked.current.mentions.some(m => m.start === rawQuery.start && caret > m.end && text[m.end] === " ") ? null : rawQuery;
    const matches = query ? members.filter(m => m.name.toLocaleLowerCase().includes(query.query.toLocaleLowerCase())) : [];
    const open = Boolean(query);
    const index = Math.min(active, Math.max(0, matches.length - 1));
    const insert = (member: MentionMember, replaceQuery = true) => {
        const ta = textarea.current;
        if (ta?.disabled || !members.some(m => m.id === member.id)) return;
        const current = ta?.value ?? text;
        sync(current);
        const position = ta?.selectionStart ?? current.length;
        const q = replaceQuery ? mentionQuery(current, position) : null;
        const start = q?.start ?? position, end = q?.end ?? ta?.selectionEnd ?? position;
        const separator = start > 0 && !/[\s，。！？、：；（(]$/.test(current.slice(0, start)) ? " " : "";
        const token = `@${member.name}`;
        const suffix = current.slice(end);
        const next = current.slice(0, start) + separator + token + (suffix.startsWith(" ") ? "" : " ") + suffix;
        sync(next);
        tracked.current.mentions.push({ characterId: member.id, name: member.name, start: start + separator.length, end: start + separator.length + token.length });
        const nextCaret = start + separator.length + token.length + 1;
        // Focus during the user gesture; iOS can reject focus deferred to a timer.
        ta?.focus();
        setText(next); setCaret(nextCaret); setClosed(true);
        requestAnimationFrame(() => {
            if (!ta || ta.value !== next) return;
            ta.setSelectionRange(nextCaret, nextCaret);
            ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
        });
    };
    return {
        open, insert, listId, activeOptionId: open && matches[index] ? `${listId}-${index}` : undefined,
        change: (next: string, position: number) => { sync(next); setCaret(position); setClosed(false); setActive(0); },
        select: (position: number) => setCaret(position),
        close: () => setClosed(true),
        composition: setComposing,
        identities: (sent: string) => {
            sync(text);
            // Plugins may rewrite content; never keep identities for removed tokens.
            return tracked.current.mentions.filter(m => sent.includes(`@${m.name}`) && members.some(c => c.id === m.characterId))
                .filter((m, i, all) => all.findIndex(n => n.characterId === m.characterId) === i)
                .map(({ characterId, name }) => ({ characterId, name }));
        },
        keyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => {
            if (!open || e.nativeEvent.isComposing || composing || e.keyCode === 229) return false;
            if (e.key === "Escape") { setClosed(true); e.preventDefault(); return true; }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault(); setActive((index + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % (matches.length || 1)); return true;
            }
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); if (matches[index]) insert(matches[index]); return true; }
            return false;
        },
        panel: open ? <div id={listId} className="group-mention-panel" role="listbox" aria-label="选择要提及的群成员">
            <div className="group-mention-heading">提及群成员</div>
            {!matches.length && <div className="group-mention-empty">没有匹配的群成员</div>}
            {matches.map((m, i) => <button id={`${listId}-${i}`} type="button" role="option" aria-selected={i === index} key={m.id}
                onPointerDown={e => e.preventDefault()} onClick={() => insert(m)}>
                {m.avatar ? <img src={m.avatar} alt="" /> : <span className="group-mention-fallback">{m.name.slice(0, 1)}</span>}
                <span>{m.name}{members.filter(c => c.name === m.name).length > 1 && <small> · {m.id.slice(-6)}</small>}</span>
                <span className="group-mention-at">@</span>
            </button>)}
        </div> : null,
    };
}
