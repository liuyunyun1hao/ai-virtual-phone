import { useEffect, useRef, type ReactNode } from "react";

export function MentionAvatar({ children, onMention, onPoke, name }: { children: ReactNode; onMention?: () => void; onPoke: () => void; name: string }) {
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const start = useRef({ x: 0, y: 0 });
    const held = useRef(false);
    const cancel = () => { clearTimeout(timer.current); timer.current = undefined; };
    useEffect(() => cancel, []);
    return <div className="group-mention-avatar w-[40px] h-[40px] rounded-[20px] bg-[var(--c-input)] overflow-hidden cursor-pointer"
        role="button" tabIndex={0} aria-label={onMention ? `长按提及 ${name}，双击拍一拍` : `双击拍一拍 ${name}`}
        onPointerDown={e => {
            if (e.button !== 0 || !onMention) return;
            e.stopPropagation(); cancel(); held.current = false; start.current = { x: e.clientX, y: e.clientY };
            timer.current = setTimeout(() => { held.current = true; }, 450);
        }}
        onPointerMove={e => { if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) { cancel(); held.current = false; } }}
        onPointerUp={e => { cancel(); if (held.current) { e.preventDefault(); e.stopPropagation(); onMention?.(); } }}
        onPointerCancel={() => { cancel(); held.current = false; }} onPointerLeave={() => { cancel(); held.current = false; }}
        onContextMenu={e => { if (onMention) e.preventDefault(); }}
        onDoubleClick={e => { if (held.current) { e.preventDefault(); return; } onPoke(); }}
        onKeyDown={e => { if (onMention && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onMention(); } }}>
        {children}
    </div>;
}
