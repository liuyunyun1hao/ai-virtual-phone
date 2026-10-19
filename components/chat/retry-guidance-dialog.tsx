"use client";
import { useEffect, useRef, useState } from "react";

export function RetryGuidanceDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (guidance: string) => void }) {
    const [text, setText] = useState("");
    const form = useRef<HTMLFormElement>(null);
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        form.current?.querySelector("textarea")?.focus();
        return () => { if (previous?.isConnected) previous.focus(); };
    }, []);
    return <div className="chat-retry-overlay" onPointerDown={event => event.stopPropagation()} onClick={onCancel}>
        <form ref={form} className="chat-retry-dialog" role="dialog" aria-modal="true" aria-labelledby="retry-guidance-title" onClick={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); onConfirm(text); }} onKeyDown={event => {
            if (event.key === "Escape") { event.stopPropagation(); onCancel(); }
            if (event.key === "Tab") {
                const items = [...event.currentTarget.querySelectorAll<HTMLElement>("textarea,button")];
                const first = items[0], last = items.at(-1);
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
        }}>
            <h3 id="retry-guidance-title">重试指导</h3>
            <p>希望这次怎么改？仅指导本次重生成，可留空。</p>
            <textarea aria-label="重试指导" value={text} onChange={event => setText(event.target.value)} maxLength={2000} placeholder="例如：不要跳过我的问题，语气更自然一点……" />
            <small>确认后将重新生成所选回复及之后的内容；取消不会改动聊天记录。</small>
            <div className="chat-retry-actions"><button type="button" onClick={onCancel}>取消</button><button type="submit">开始重试</button></div>
        </form>
    </div>;
}
