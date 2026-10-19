import { useEffect, useRef } from "react";
import { ECHO_COPIES, echoOrbitFrames } from "./echo-preview";
import { echoLayout } from "@/lib/chat-echo-layout";

/** Clones the rendered, styled bubble: sender colour, tail, typography and emoji stay intact. */
export function EchoPlayback({ source, onDone }: { source: HTMLElement; onDone: () => void }) {
    const layer = useRef<HTMLDivElement>(null);
    const done = useRef(onDone); done.current = onDone;
    useEffect(() => {
        const host = layer.current;
        if (!host) return;
        const motion = matchMedia("(prefers-reduced-motion: reduce)");
        if (motion.matches) { done.current(); return; }
        const style = getComputedStyle(source);
        const template = source.cloneNode(true) as HTMLElement;
        const row = source.closest<HTMLElement>(".chat-msg-wrapper");
        if (row?.hasAttribute("data-imessage-tail")) template.setAttribute("data-echo-tail", "");
        template.setAttribute("data-echo-role", row?.dataset.role || (source.classList.contains("chat-bubble-role-user") ? "user" : "assistant"));
        template.querySelectorAll("button, .imessage-tapback-badge, [data-tapback], .echo-replay-message").forEach(n => n.remove());
        [template, ...template.querySelectorAll<HTMLElement>("*")].forEach(n => {
            n.removeAttribute("id"); n.removeAttribute("data-msg-id"); n.removeAttribute("data-active");
            n.removeAttribute("autofocus"); n.setAttribute("tabindex", "-1");
        });
        for (const prop of Array.from(style)) if (prop.startsWith("--")) template.style.setProperty(prop, style.getPropertyValue(prop));
        for (const prop of ["color", "font", "line-height", "letter-spacing", "background-color", "border-radius", "border", "padding", "box-shadow", "text-align"]) {
            template.style.setProperty(prop, style.getPropertyValue(prop));
        }
        template.style.margin = "0";
        template.style.maxWidth = "none";
        template.style.pointerEvents = "none";
        const field = host.querySelector<HTMLElement>(".echo-live-field")!;
        const anchor = host.querySelector<HTMLElement>(".echo-live-original")!;
        anchor.append(template.cloneNode(true));
        const layout = echoLayout(source.textContent || "", source.offsetWidth, source.offsetHeight);
        const nodes = ECHO_COPIES.slice(0, layout.count).map(() => {
            const node = document.createElement("div"); node.className = "echo-copy";
            node.append(template.cloneNode(true)); field.append(node); return node;
        });
        let animations: Animation[] = [];
        const update = () => {
            // Later replies can replace projected DOM nodes. Keep this animation's
            // captured bubble and last origin until its own timeline finishes.
            if (!source.isConnected) return;
            const r = source.getBoundingClientRect(), bounds = host.getBoundingClientRect();
            if (!bounds.width || !bounds.height || !r.width || !r.height) return;
            const sx = host.clientWidth / bounds.width, sy = host.clientHeight / bounds.height;
            const x = (r.left + r.width / 2 - bounds.left) * sx, y = (r.top + r.height / 2 - bounds.top) * sy;
            anchor.style.left = `${x}px`; anchor.style.top = `${y}px`;
            [anchor, ...nodes].forEach(n => {
                (n.firstElementChild as HTMLElement).style.width = `${r.width * sx}px`;
            });
            nodes.forEach((node, i) => {
                const frames = echoOrbitFrames(i, host.clientWidth, host.clientHeight, { x, y }, layout.scale);
                if (animations[i]) (animations[i].effect as KeyframeEffect).setKeyframes(frames);
                else animations.push(node.animate(frames, { duration: 4800, easing: "linear", fill: "both" }));
            });
        };
        update();
        const dimmer = host.querySelector<HTMLElement>(".echo-dimmer")!;
        const dim = dimmer.animate([{ opacity: 0, offset: 0 }, { opacity: .42, offset: .12 }, { opacity: .42, offset: .72 }, { opacity: 0, offset: 1 }], { duration: 4800, fill: "both" });
        const timer = setTimeout(() => done.current(), 4900);
        // Autoscroll/new replies can move the actual source while the effect is playing.
        let frame = 0;
        const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
        const resize = new ResizeObserver(schedule); resize.observe(host); resize.observe(source);
        const stop = () => done.current();
        host.parentElement?.addEventListener("scroll", schedule, true);
        motion.addEventListener("change", stop);
        return () => {
            clearTimeout(timer); cancelAnimationFrame(frame); resize.disconnect();
            host.parentElement?.removeEventListener("scroll", schedule, true);
            motion.removeEventListener("change", stop);
            animations.forEach(a => a.cancel()); dim.cancel(); field.replaceChildren(); anchor.replaceChildren();
        };
    }, [source]);
    return <div ref={layer} className="echo-live" onPointerDown={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape") done.current(); }}>
        <div className="echo-dimmer" aria-hidden="true" />
        <div className="echo-live-field" aria-hidden="true" inert />
        <div className="echo-live-original" aria-hidden="true" inert />
        <button type="button" className="echo-live-skip" onClick={onDone}>跳过特效</button>
    </div>;
}
