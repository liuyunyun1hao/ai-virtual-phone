import { useEffect, useRef, type CSSProperties } from "react";
import { echoLayout } from "@/lib/chat-echo-layout";

const noise = (n: number) => { const x = Math.sin(n * 127.1 + 31.7) * 43758.5453; return x - Math.floor(x); };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };

// Independent seeded positions avoid rows, rings and a mechanically rotating column.
export const ECHO_COPIES = Array.from({ length: 144 }, (_, i) => {
    const size = noise(i + 200);
    // Distinct size bands, not a compressed distribution around one medium size.
    const scale = i % 7 === 0 ? 1.25 + size * .6
        : i % 7 < 4 ? .65 + size * .5 : .18 + size * .26;
    return { x: (i % 2) * 48 + noise(i + 1) * 14, y: Math.floor(i % 8 / 2) * 23 + noise(i + 80) * 7,
        scale,
        delay: noise(i + 50) * .045 };
});

// Original 2026-09-13 orbit/layout; only the ending dissolves instead of gathering.
// Rotation belongs to the particles' positions, not the readable message glyphs.
export function echoOrbitFrames(index: number, width: number, height: number, origin = { x: width * .8, y: height * .85 }, sizeMultiplier = 1): Keyframe[] {
    const copy = ECHO_COPIES[index];
    const phase = noise(index + 400) * Math.PI * 2;
    const latitude = noise(index + 600) * 2 - 1;
    const radius = .25 + noise(index + 500) * .75;
    return Array.from({ length: 121 }, (_, step) => {
        const t = step / 120;
        const angle = phase + t * Math.PI * (2.1 + noise(index + 700) * .65);
        const depth = Math.sin(angle) * radius;
        const perspective = 1 / (1 - depth * .48);
        const spread = 1 - Math.pow(1 - clamp((t - copy.delay) / .18), 3);
        const fade = smooth((t - (.70 + noise(index + 800) * .07)) / .23);
        const extent = spread;
        const orbitX = Math.cos(angle) * width * .46 * radius;
        const orbitY = latitude * height * .42 + Math.sin(angle + phase) * height * .085;
        const tilt = .18 * Math.sin(t * 4);
        const swarmX = width * .5 + (orbitX - orbitY * tilt) * perspective;
        const swarmY = height * .53 + (orbitY + orbitX * tilt) * perspective - t * height * .07;
        const x = origin.x + (swarmX - origin.x) * extent;
        const y = origin.y + (swarmY - origin.y) * extent;
        const swarmScale = Math.max(.14, Math.min(2.25, copy.scale * perspective)) * sizeMultiplier;
        const scale = 1 + (swarmScale - 1) * spread;
        const entrance = t >= copy.delay ? 1 : 0;
        const exit = 1 - fade;
        return { offset: t, transform: `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) translate(-50%,-50%) scale(${scale.toFixed(3)})`,
            opacity: entrance * exit, zIndex: Math.round((depth + 1) * 100) };
    });
}

export function EchoPreview({ text, bubbleStyle, onClose, onSend }: { text: string; bubbleStyle?: CSSProperties; onClose: () => void; onSend?: () => void }) {
    const close = useRef<HTMLButtonElement>(null);
    const dialog = useRef<HTMLDivElement>(null);
    const field = useRef<HTMLDivElement>(null);
    const original = useRef<HTMLDivElement>(null);
    const dimmer = useRef<HTMLDivElement>(null);
    useEffect(() => { (close.current || dialog.current)?.focus({ preventScroll: true }); }, []);
    useEffect(() => {
        const host = field.current;
        if (!host) return;
        const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        let animations: Animation[] = [];
        const play = () => {
            animations.forEach(a => a.cancel()); animations = [];
            if (motion.matches) return;
            const bounds = host.getBoundingClientRect();
            const { width, height } = bounds;
            const source = original.current?.getBoundingClientRect();
            const origin = source ? { x: source.left + source.width / 2 - bounds.left, y: source.top + source.height / 2 - bounds.top } : undefined;
            const layout = echoLayout(text, original.current?.offsetWidth || 120, original.current?.offsetHeight || 40);
            host.querySelectorAll<HTMLElement>(".echo-copy").forEach((node, i) => {
                node.style.display = i < layout.count ? "" : "none";
                if (i < layout.count) animations.push(node.animate(echoOrbitFrames(i, width, height, origin, layout.scale), { duration: 4800, easing: "linear", fill: "both" }));
            });
            if (dimmer.current) animations.push(dimmer.current.animate([
                { opacity: 0, offset: 0 }, { opacity: .42, offset: .12 },
                { opacity: .42, offset: .72 }, { opacity: 0, offset: 1 },
            ], { duration: 4800, fill: "both" }));
        };
        const resize = new ResizeObserver(play); resize.observe(host);
        motion.addEventListener("change", play); play();
        return () => { resize.disconnect(); motion.removeEventListener("change", play); animations.forEach(a => a.cancel()); };
    }, [text]);
    // Very long drafts remain intact in the composer; only their visual sample is bounded.
    const sample = Array.from(text).slice(0, 160).join("") + (Array.from(text).length > 160 ? "…" : "");
    const bubble = <div className="echo-pill chat-bubble-role-user"><span className="imessage-bubble-surface" aria-hidden="true" /><span>{sample}</span></div>;
    return <div ref={dialog} className="echo-preview" role="dialog" aria-modal="true" aria-label="回声特效预览" tabIndex={-1} style={bubbleStyle}
        onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}
        onClick={e => {
            e.stopPropagation();
            if (!(e.target as HTMLElement).closest("button, .echo-original, .echo-preview-heading")) onClose();
        }}
        onKeyDown={e => {
            e.stopPropagation();
            if (e.key === "Escape") { e.preventDefault(); onClose(); }
            if (e.key === "Tab") {
                const controls = [...(dialog.current?.querySelectorAll<HTMLButtonElement>("button") || [])];
                const next = (controls.indexOf(document.activeElement as HTMLButtonElement) + (e.shiftKey ? -1 : 1) + controls.length) % controls.length;
                e.preventDefault(); controls[next]?.focus();
            }
        }}>
        <div ref={dimmer} className="echo-dimmer" aria-hidden="true" />
        <div className="echo-preview-heading"><span>发送特效</span><strong>回声</strong><small>{onSend ? "预览中 · 确认后发送" : "仅预览 · 不会发送消息"}</small></div>
        <div ref={original} className="echo-original">{bubble}</div>
        <div ref={field} className="echo-field" aria-hidden="true">
            {ECHO_COPIES.map((copy, i) => <div key={i} className="echo-copy" style={{ "--echo-rest-x": `${copy.x}%`, "--echo-rest-y": `${copy.y}%`,
                "--echo-scale": copy.scale } as CSSProperties}>{bubble}</div>)}
        </div>
        <div className="echo-preview-controls">
            {onSend && <button ref={close} type="button" className="echo-confirm-send" onClick={onSend}>发送</button>}
        </div>
    </div>;
}
