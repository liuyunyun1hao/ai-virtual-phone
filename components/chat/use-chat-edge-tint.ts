"use client";
import { useEffect, type RefObject } from "react";

export function useChatEdgeTint(scrollRef: RefObject<HTMLDivElement | null>) {
    useEffect(() => {
        const viewport = scrollRef.current;
        if (!viewport) return;
        let frame = 0;
        const visible = new Set<HTMLElement>();
        const update = () => {
            frame = 0;
            const box = viewport.getBoundingClientRect();
            const reserve = parseFloat(getComputedStyle(viewport).getPropertyValue("--chat-bottom-reserve")) || 104;
            for (const row of visible) {
                const rect = row.getBoundingClientRect();
                const center = (rect.top + rect.bottom) / 2;
                const top = Math.max(0, Math.min(1, (box.top + 190 - center) / 100));
                const bottom = Math.max(0, Math.min(1, (center - (box.bottom - reserve - 42)) / 65));
                row.style.setProperty("--chat-edge-lighten", `${Math.max(top, bottom) * 4}%`);
            }
        };
        const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
        const clearTint = (row: HTMLElement) => { row.style.removeProperty("--chat-edge-lighten"); };
        const observer = new IntersectionObserver(entries => { for (const entry of entries) { const row = entry.target as HTMLElement; if (entry.isIntersecting) visible.add(row); else { visible.delete(row); clearTint(row); } } schedule(); }, { root: viewport });
        const observed = new Set<HTMLElement>();
        const scan = () => {
            for (const row of observed) if (!viewport.contains(row)) { observer.unobserve(row); observed.delete(row); visible.delete(row); }
            viewport.querySelectorAll<HTMLElement>('.chat-msg-wrapper').forEach(row => { if (!observed.has(row)) { observed.add(row); observer.observe(row); } });
            schedule();
        };
        const mutation = new MutationObserver(scan);
        mutation.observe(viewport, { childList: true, subtree: true });
        const resize = new ResizeObserver(schedule); resize.observe(viewport);
        viewport.addEventListener("scroll", schedule, { passive: true });
        scan();
        return () => { cancelAnimationFrame(frame); observer.disconnect(); mutation.disconnect(); resize.disconnect(); viewport.removeEventListener("scroll", schedule); observed.forEach(clearTint); };
    }, [scrollRef]);
}
