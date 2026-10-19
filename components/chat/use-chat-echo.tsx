import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { ChatMessage } from "@/lib/chat-storage";
import { hasEcho } from "@/lib/chat-echo";
import { hasLove } from "@/lib/chat-love";
import { hasFireworks } from "@/lib/chat-fireworks";
import { MessageEffectPlayback } from "./message-effect-playback";

type EchoDisplayMessage = ChatMessage & { echoPlaybackKey?: string; displaySourceId?: string };
type MessageScreenEffect = "echo" | "love" | "fireworks";
const playbackKey = (m: EchoDisplayMessage) => m.echoPlaybackKey || m.id;
const screenEffectOf = (m: EchoDisplayMessage): MessageScreenEffect | null => hasFireworks(m) ? "fireworks" : hasLove(m) ? "love" : hasEcho(m) ? "echo" : null;

export function useChatEcho(messages: EchoDisplayMessage[], sessionId: string, root: RefObject<HTMLDivElement | null>, enabled: boolean) {
    const seen = useRef(new Set<string>());
    const publishedMessages = useRef(new Map<string, EchoDisplayMessage>());
    const openedAt = useRef(Date.now());
    const [queue, setQueue] = useState<string[]>([]);
    const [active, setActive] = useState<{ source: HTMLElement; effect: MessageScreenEffect; messageId: string } | null>(null);
    useEffect(() => {
        seen.current.clear(); publishedMessages.current.clear(); openedAt.current = Date.now(); setQueue([]); setActive(null);
    }, [sessionId]);
    useEffect(() => {
        const fresh: string[] = [];
        for (const message of messages) {
            const key = playbackKey(message);
            publishedMessages.current.delete(key);
            if (message.sessionId !== sessionId || seen.current.has(key) || !screenEffectOf(message)) continue;
            seen.current.add(key);
            if (enabled && new Date(message.createdAt).getTime() >= openedAt.current) fresh.push(key);
        }
        if (fresh.length) setQueue(q => [...q, ...fresh]);
        if (!enabled) { setQueue([]); setActive(null); }
    }, [messages, sessionId, enabled]);
    const finish = useCallback(() => { setActive(null); setQueue(q => q.slice(1)); }, []);
    const id = queue[0];
    useEffect(() => {
        if (!id || !enabled || active) return;
        const message = messages.find(m => playbackKey(m) === id && m.sessionId === sessionId) || publishedMessages.current.get(id);
        const effect = message ? screenEffectOf(message) : null;
        if (!message || !effect) { finish(); return; }
        let frame = 0, attempts = 0;
        const locate = () => {
            const host = root.current;
            // Confirming a preview and publishing a bubble can happen in separate commits.
            // Do not start a hidden animation underneath the still-mounted preview.
            if (host?.querySelector(".echo-preview")) {
                frame = requestAnimationFrame(locate); return;
            }
            const messageNode = host && Array.from(host.querySelectorAll<HTMLElement>("[data-msg-id]")).find(n => n.dataset.msgId === message.id && !n.closest(".message-effect-live, .echo-preview"));
            const node = messageNode?.querySelector<HTMLElement>(".chat-quote-reply") || messageNode;
            if (node && host) {
                const r = node.getBoundingClientRect(), b = host.getBoundingClientRect();
                if (r.width && r.height && r.bottom > b.top && r.top < b.bottom) { setActive({ source: node, effect, messageId: message.displaySourceId || message.id }); return; }
            }
            // Wait for new-message layout/autoscroll, but never scroll the user's history for them.
            if (++attempts < 120) frame = requestAnimationFrame(locate); else finish();
        };
        frame = requestAnimationFrame(() => { frame = requestAnimationFrame(locate); });
        return () => cancelAnimationFrame(frame);
    }, [id, enabled, sessionId, messages, root, finish, active]);
    const replay = useCallback((messageId: string) => {
        const message = messages.find(m => m.id === messageId && !!screenEffectOf(m));
        if (!enabled || !message) return;
        const key = playbackKey(message);
        setQueue(q => q.includes(key) ? q : [...q, key]);
    }, [enabled, messages]);
    const published = useCallback((message: EchoDisplayMessage) => {
        if (!enabled || message.sessionId !== sessionId || !screenEffectOf(message)) return;
        const key = playbackKey(message);
        seen.current.add(key);
        publishedMessages.current.set(key, message);
        setQueue(q => q.includes(key) ? q : [...q, key]);
    }, [enabled, sessionId]);
    const overlay = enabled && active && id
        ? <MessageEffectPlayback key={`${sessionId}:${id}`} source={active.source} effect={active.effect} onDone={finish} sessionId={sessionId} messageId={active.messageId} />
        : null;
    return { replay, published, overlay };
}
