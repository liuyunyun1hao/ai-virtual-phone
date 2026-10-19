"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { kvGet, kvSet, registerKvMigration } from "@/lib/kv-db";
import { settleMenuRows } from "@/lib/menu-reorder-animation";

const keys = { group: "chat_plus_order_group_v1", private: "chat_plus_order_private_v1" };
Object.values(keys).forEach(registerKvMigration);
type Item = { icon: ReactNode; label: string; onClick: () => void; active?: boolean };
type Drag = { id: string; from: number; to: number; y: number; startY: number; scroll: number; rows: HTMLElement[]; tops: number[]; height: number; ids: string[] };

export function SortablePlusMenu({ items, isGroup }: { items: Item[]; isGroup: boolean }) {
    const key = isGroup ? keys.group : keys.private;
    const [order, setOrder] = useState<string[]>(() => {
        try { const value = JSON.parse(kvGet(key) || "[]"); return Array.isArray(value) ? value.filter(x => typeof x === "string") : []; } catch { return []; }
    });
    const root = useRef<HTMLDivElement>(null);
    const drag = useRef<Drag | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const frame = useRef(0);
    const start = useRef({ x: 0, y: 0 });
    const suppressClick = useRef(false);
    const pendingSettle = useRef<{ tops: Map<HTMLElement, number>; scroll: number } | null>(null);
    const cancelSettle = useRef<(() => void) | null>(null);
    const [settleVersion, setSettleVersion] = useState(0);
    const identified = items.map((item, index) => ({ ...item, id: `${item.label}:${items.slice(0, index).filter(x => x.label === item.label).length}` }));
    const sorted = [...identified].sort((a, b) => {
        const rank = (id: string) => order.includes(id) ? order.indexOf(id) : order.length + identified.findIndex(x => x.id === id);
        return rank(a.id) - rank(b.id);
    });
    const clearTimer = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
    const paint = () => {
        const d = drag.current, node = root.current;
        if (!d || !node) return;
        const box = node.getBoundingClientRect();
        node.scrollTop += d.y < box.top + 35 ? -5 : d.y > box.bottom - 35 ? 5 : 0;
        const delta = d.y - d.startY + node.scrollTop - d.scroll;
        const center = d.tops[d.from] + d.height / 2 + delta;
        d.to = d.tops.reduce((best, top, i) => Math.abs(top + d.rows[i].offsetHeight / 2 - center) < Math.abs(d.tops[best] + d.rows[best].offsetHeight / 2 - center) ? i : best, d.from);
        d.rows.forEach((row, i) => {
            const shift = i === d.from ? delta : d.to > d.from && i > d.from && i <= d.to ? -d.height : d.to < d.from && i >= d.to && i < d.from ? d.height : 0;
            row.style.transform = `translate3d(0,${shift}px,0)`;
        });
        frame.current = requestAnimationFrame(paint);
    };
    const finish = (commit: boolean) => {
        clearTimer(); cancelAnimationFrame(frame.current);
        const d = drag.current; drag.current = null;
        if (!d) return;
        pendingSettle.current = { tops: new Map(d.rows.map(row => [row, row.getBoundingClientRect().top])), scroll: root.current?.scrollTop ?? 0 };
        d.rows.forEach(row => {
            row.style.transition = 'none';
            row.style.removeProperty("transform");
            if (row.hasAttribute('data-dragging')) row.setAttribute('data-settling', '');
            row.removeAttribute("data-dragging");
        });
        setSettleVersion(value => value + 1);
        if (commit && d.from !== d.to) {
            const ids = [...d.ids]; ids.splice(d.from, 1); ids.splice(d.to, 0, d.id);
            setOrder(ids); kvSet(key, JSON.stringify(ids));
        }
    };
    useLayoutEffect(() => {
        const pending = pendingSettle.current, node = root.current;
        if (!pending || !node) return;
        pendingSettle.current = null;
        node.scrollTop = pending.scroll;
        cancelSettle.current = settleMenuRows(Array.from(node.querySelectorAll<HTMLElement>('.chat-plus-sort-row')), pending.tops, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }, [order, settleVersion]);
    useEffect(() => {
        const node = root.current;
        const preventPan = (e: TouchEvent) => { if (drag.current && e.cancelable) e.preventDefault(); };
        node?.addEventListener("touchmove", preventPan, { passive: false });
        return () => { clearTimer(); cancelAnimationFrame(frame.current); cancelSettle.current?.(); node?.removeEventListener("touchmove", preventPan); };
    }, []);
    return <div ref={root} className="chat-plus-menu" onContextMenu={e => e.preventDefault()}>
        {sorted.map((item, index) => <div key={item.id} className="chat-plus-sort-row">
            <button type="button" className="chat-plus-menu-item cursor-pointer" data-active={item.active || undefined}
                onPointerDown={e => {
                    if (e.button !== 0) return;
                    cancelSettle.current?.(); cancelSettle.current = null;
                    clearTimer(); suppressClick.current = false; start.current = { x: e.clientX, y: e.clientY };
                    const button = e.currentTarget, pointerId = e.pointerId;
                    timer.current = setTimeout(() => {
                        const node = root.current; if (!node) return;
                        const rows = Array.from(node.querySelectorAll<HTMLElement>(".chat-plus-sort-row"));
                        drag.current = { id: item.id, from: index, to: index, y: start.current.y, startY: start.current.y, scroll: node.scrollTop, rows, tops: rows.map(row => row.offsetTop), height: rows[index].offsetHeight, ids: sorted.map(x => x.id) };
                        rows[index].setAttribute("data-dragging", "");
                        suppressClick.current = true;
                        try { button.setPointerCapture(pointerId); } catch { finish(false); return; }
                        frame.current = requestAnimationFrame(paint);
                    }, 350);
                }}
                onPointerMove={e => {
                    if (!drag.current) { if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) { clearTimer(); suppressClick.current = true; } return; }
                    e.preventDefault(); drag.current.y = e.clientY;
                }}
                onPointerUp={e => { if (drag.current) { cancelAnimationFrame(frame.current); drag.current.y = e.clientY; paint(); } finish(true); }} onPointerCancel={() => { finish(false); suppressClick.current = true; }}
                onLostPointerCapture={() => finish(false)}
                onKeyDown={e => {
                    if (!e.altKey || !["ArrowUp", "ArrowDown"].includes(e.key)) return;
                    e.preventDefault();
                    const to = index + (e.key === "ArrowUp" ? -1 : 1); if (to < 0 || to >= sorted.length) return;
                    const ids = sorted.map(x => x.id); ids.splice(index, 1); ids.splice(to, 0, item.id);
                    setOrder(ids); kvSet(key, JSON.stringify(ids));
                }}
                onClick={() => { if (!suppressClick.current) item.onClick(); }}>
                <div className="chat-plus-icon-box">{item.icon}</div><span className="chat-plus-menu-label">{item.label}</span>
            </button>
        </div>)}
    </div>;
}
