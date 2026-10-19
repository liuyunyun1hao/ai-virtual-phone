"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { hydrateChatStorage, loadChatSessions, type ChatSession } from "@/lib/chat-storage";
import { getCurrentIdentityId } from "@/lib/identity-runtime";
import { canCurrentIdentityInteract } from "@/lib/identity-access";
import { kvGet } from "@/lib/kv-db";
import { ChatRoom } from "./chat-room";
import { SessionCustomCSS } from "@/components/ui/session-custom-css";
import styles from "./quick-reply-window.module.css";

export default function QuickReplyWindow({ sessionId, title, onClose, onExpand }: {
    sessionId: string; title: string; onClose: () => void; onExpand: () => void;
}) {
    const owner = useRef(getCurrentIdentityId());
    const [session, setSession] = useState<ChatSession | null>(null);
    const [error, setError] = useState("");
    const [chatCSS, setChatCSS] = useState(() => kvGet("chat-app-custom-css") || "");
    const panel = useRef<HTMLDivElement>(null);
    useEffect(() => {
        let alive = true;
        const sync = () => {
            if (!alive) return;
            const next = loadChatSessions().find(s => s.id === sessionId);
            const ids = next?.isGroup ? next.participantIds || [] : next ? [next.contactId] : [];
            if (owner.current !== getCurrentIdentityId() || !next || !ids.length || ids.some(id => !canCurrentIdentityInteract(id))) {
                setSession(null); setError("此对话已不可用"); return;
            }
            setSession(next); setError("");
        };
        const cssUpdate = () => setChatCSS(kvGet("chat-app-custom-css") || "");
        void hydrateChatStorage().then(sync).catch(() => { if (alive) setError("消息加载失败，请重新打开"); });
        window.addEventListener("chat-sessions-updated", sync);
        window.addEventListener("settings-bindings-updated", sync);
        window.addEventListener("chat-app-css-updated", cssUpdate);
        const previous = document.activeElement as HTMLElement | null;
        panel.current?.focus();
        return () => {
            alive = false;
            window.removeEventListener("chat-sessions-updated", sync);
            window.removeEventListener("settings-bindings-updated", sync);
            window.removeEventListener("chat-app-css-updated", cssUpdate);
            previous?.focus?.();
        };
    }, [sessionId]);
    return <div className={styles.overlay} onClick={onClose}>
        <section className={styles.panel} role="dialog" aria-modal="true" aria-label={`回复${title}`} tabIndex={-1} ref={panel}
            onClick={e => e.stopPropagation()} onKeyDown={e => {
                if (e.key === "Escape" && !e.defaultPrevented) { e.stopPropagation(); onClose(); }
                if (e.key === "Tab") {
                    const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea,input:not(:disabled),select,a[href],[tabindex="0"]') || []).filter(n => n.getClientRects().length > 0);
                    if (!nodes.length) return;
                    const first = nodes[0], last = nodes[nodes.length - 1];
                    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
                    else if (!e.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { e.preventDefault(); first.focus(); }
                }
            }}>
            <div className={styles.toolbar}><button className={styles.title} onClick={onExpand} aria-label={`进入${title}聊天室`}><strong>{title}</strong><ChevronRight size={18} /></button><button aria-label="关闭回复小窗" onClick={onClose}><X size={20} /></button></div>
            <div className={styles.content}>
                <div className="chat-app absolute inset-0 flex flex-col overflow-hidden z-10" data-room-active="">
                    {chatCSS && <SessionCustomCSS css={chatCSS} scope=".chat-app" />}
                    {session ? <ChatRoom session={session} onBack={onClose} onDeleted={onClose} /> : <p className={styles.hint} role="status">{error || "正在加载…"}</p>}
                </div>
            </div>
        </section>
    </div>;
}
