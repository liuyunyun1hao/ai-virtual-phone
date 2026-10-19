"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronLeft, Eraser, User, Users, ListOrdered } from "lucide-react";
import type { Character } from "@/lib/character-types";
import type { ChatMessage, ChatSession } from "@/lib/chat-storage";
import { kvGet, kvSet, kvRemove } from "@/lib/kv-db";
import { drawBoard, drawingSummary, DRAWING_PALETTE, DRAWING_MAX_WIDTH, type DrawingBrush, type DrawingDraft, type DrawingPoint, type DrawingStroke, type DrawingComment, type DrawingSnapshot } from "@/lib/chat-drawing";
import { requestDrawingTurn } from "@/lib/chat-drawing-model";
import { requestGroupDrawingRound } from "@/lib/chat-drawing-group";
import { abortableDelay } from "@/lib/abort-utils";

export function DrawingGlyph() {
    return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" clipRule="evenodd" d="M12.275 4.832c-2.377 1.839-5.679 5.22-10.484 10.197A1 1 0 0 1 .35 13.64C5.108 8.714 8.53 5.2 11.05 3.25c1.252-.968 2.401-1.649 3.471-1.86c.557-.111 1.112-.099 1.647.082c.534.18.98.507 1.356.925c.674.751.643 1.716.423 2.515c-.223.81-.695 1.69-1.27 2.568c-1.155 1.77-2.911 3.81-4.614 5.726c-1.696 1.908-2.781 3.418-3.263 4.516c-.242.55-.284.893-.263 1.079c.015.123.052.197.196.284c.122.074.362.131.845-.026c.48-.155 1.05-.479 1.666-.923c1.205-.87 2.373-2.042 3.093-2.766l.04-.04c.278-.279.562-.59.871-.928l.453-.492c.472-.508.994-1.047 1.527-1.478c.513-.414 1.156-.83 1.873-.926c.829-.113 1.578.219 2.136.93c.7.892.502 1.95.214 2.719c-.287.767-.789 1.586-1.229 2.304l-.036.059c-.479.782-.89 1.461-1.116 2.058c-.232.615-.158.85-.092.949c.09.134.153.153.251.156c.164.006.441-.057.83-.259c.77-.399 1.599-1.14 2.128-1.723a1 1 0 0 1 1.48 1.346c-.61.67-1.624 1.601-2.687 2.153c-.528.273-1.165.505-1.822.482c-.723-.026-1.388-.36-1.844-1.046c-.618-.926-.414-1.973-.114-2.765c.3-.795.812-1.63 1.257-2.357l.024-.039c.48-.785.883-1.45 1.097-2.02c.22-.589.116-.744.086-.781c-.16-.205-.236-.194-.286-.186l-.009.001c-.16.022-.45.15-.884.5c-.414.335-.854.784-1.319 1.284l-.407.443a35 35 0 0 1-1.03 1.093c-.71.713-1.975 1.984-3.315 2.95c-.689.498-1.453.956-2.218 1.205c-.761.247-1.675.331-2.496-.164c-.658-.397-1.06-1.01-1.149-1.764c-.081-.692.11-1.418.418-2.116c.614-1.4 1.88-3.106 3.6-5.04c1.712-1.927 3.37-3.864 4.434-5.492c.536-.82.875-1.494 1.015-2.004c.141-.513.03-.636.018-.649c-.191-.212-.36-.316-.51-.366c-.148-.05-.341-.07-.616-.016c-.594.118-1.437.554-2.636 1.481" /></svg>;
}

const palette = DRAWING_PALETTE;
function readDraft(key: string): DrawingDraft | null {
    try { const d = JSON.parse(kvGet(key) || "null"); return d && Array.isArray(d.strokes) ? d : null; } catch { return null; }
}

/** Model control points become a sampled, gently curved pen trajectory. */
function penTrajectory(points: DrawingPoint[]): DrawingPoint[] {
    const out: DrawingPoint[] = [];
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[Math.max(0, i - 1)], b = points[i], c = points[i + 1], d = points[Math.min(points.length - 1, i + 2)];
        const steps = Math.max(2, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / 3));
        for (let j = 0; j < steps; j++) {
            const t = j / steps;
            const f = (k: number) => .5 * (2*b[k] + (-a[k]+c[k])*t + (2*a[k]-5*b[k]+4*c[k]-d[k])*t*t + (-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t);
            out.push([Math.max(0, Math.min(600, f(0))), Math.max(0, Math.min(800, f(1))), b[2] + (c[2] - b[2]) * t]);
        }
    }
    out.push(points[points.length - 1]); return out;
}

export function DrawingBoard({ session, history, characters, onClose, onSend }: {
    session: ChatSession; history: ChatMessage[]; characters: Character[];
    onClose: () => void; onSend: (image: string, summary: string, process: DrawingSnapshot) => boolean;
}) {
    const key = `chat-drawing-draft:${session.id}`;
    const initial = useRef<DrawingDraft | null | undefined>(undefined);
    if (initial.current === undefined) initial.current = readDraft(key);
    const strokes = useRef<DrawingStroke[]>(initial.current?.strokes || []);
    const comments = useRef<DrawingComment[]>(initial.current?.comments || []);
    const [comment, setComment] = useState<DrawingComment | null>(comments.current.at(-1) || null);
    const [commentVisible, setCommentVisible] = useState(false);
    const commentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hideComment = () => { if (commentTimer.current) clearTimeout(commentTimer.current); commentTimer.current = null; setCommentVisible(false); };
    const [mode, setMode] = useState<"solo" | "together">(initial.current?.mode || "solo");
    const [characterId, setCharacterId] = useState(initial.current?.characterId || characters[0]?.id || "");
    const [painterIds, setPainterIds] = useState<string[]>(() => (initial.current?.painterIds || [initial.current?.characterId || characters[0]?.id]).filter((id): id is string => !!id && characters.some(c => c.id === id)));
    const [pickerOpen, setPickerOpen] = useState(false);
    const pickerOpenRef = useRef(false);
    const memberPanel = useRef<HTMLElement>(null);
    const [activePainter, setActivePainter] = useState<string | null>(null);
    const [color, setColor] = useState(palette[0]);
    const [width, setWidth] = useState(4);
    const [brush, setBrush] = useState<DrawingBrush>("pen");
    const [opacity, setOpacity] = useState(1);
    const [colorOpen, setColorOpen] = useState(false);
    const colorOpenRef = useRef(false);
    const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingHandoff = useRef(false);
    const toolsActive = useRef(false);
    const clearIdle = () => { if (idleTimer.current) clearTimeout(idleTimer.current); idleTimer.current = null; };
    const [phase, setPhase] = useState<"user" | "waiting" | "drawing">("user");
    const [error, setError] = useState("");
    const [count, setCount] = useState(strokes.current.length);
    const canvas = useRef<HTMLCanvasElement>(null), workspace = useRef<HTMLDivElement>(null);
    const frame = useRef<HTMLDivElement>(null);
    const activePointer = useRef<number | null>(null);
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const view = useRef({ scale: 1, x: 0, y: 0 });
    const pinch = useRef<{ distance: number; scale: number; anchorX: number; anchorY: number } | null>(null);
    const gesturing = useRef(false);
    const applyView = () => {
        if (!canvas.current || !frame.current) return;
        const limitX = Math.max(0, (canvas.current.offsetWidth * view.current.scale - frame.current.clientWidth) / 2);
        const limitY = Math.max(0, (canvas.current.offsetHeight * view.current.scale - frame.current.clientHeight) / 2);
        view.current.x = Math.max(-limitX, Math.min(limitX, view.current.x));
        view.current.y = Math.max(-limitY, Math.min(limitY, view.current.y));
        canvas.current.style.transform = `translate3d(${view.current.x}px,${view.current.y}px,0) scale(${view.current.scale})`;
    };
    const beginPinch = () => {
        const pair = [...pointers.current.values()].slice(0, 2), box = frame.current?.getBoundingClientRect();
        if (pair.length < 2 || !box) { pinch.current = null; return; }
        const x = (pair[0].x + pair[1].x) / 2 - box.left - box.width / 2;
        const y = (pair[0].y + pair[1].y) / 2 - box.top - box.height / 2;
        pinch.current = { distance: Math.max(1, Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y)), scale: view.current.scale,
            anchorX: (x - view.current.x) / view.current.scale, anchorY: (y - view.current.y) / view.current.scale };
    };
    const request = useRef<AbortController | null>(null);
    const mounted = useRef(true), sending = useRef(false);
    const draftState = useRef({ mode, characterId, painterIds }); draftState.current = { mode, characterId, painterIds };
    const selected = characters.find(c => c.id === characterId) || characters[0];
    const paintFrame = useRef<number | null>(null);
    const cancelPaint = () => {
        if (paintFrame.current !== null) cancelAnimationFrame(paintFrame.current);
        paintFrame.current = null;
    };
    // Immediate paint also flushes queued input before snapshots or gesture changes.
    const repaint = () => {
        cancelPaint();
        if (canvas.current) drawBoard(canvas.current, strokes.current);
    };
    const schedulePaint = () => {
        if (paintFrame.current !== null) return;
        paintFrame.current = requestAnimationFrame(() => { paintFrame.current = null; repaint(); });
    };
    const persist = () => kvSet(key, JSON.stringify({ ...draftState.current, strokes: strokes.current, comments: comments.current }));
    const stop = () => { clearIdle(); hideComment(); pointers.current.clear(); pinch.current = null; gesturing.current = false; pendingHandoff.current = false; request.current?.abort(); request.current = null; activePointer.current = null; };
    useLayoutEffect(() => {
        repaint();
        const resize = new ResizeObserver(() => {
            const box = workspace.current?.getBoundingClientRect(); if (!box || !frame.current) return;
            const w = Math.min(box.width, box.height * .75);
            frame.current.style.width = `${w}px`; frame.current.style.height = `${w / .75}px`;
            applyView();
        });
        if (workspace.current) resize.observe(workspace.current);
        return () => resize.disconnect();
    }, []);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; cancelPaint(); stop(); if (!sending.current) persist(); };
    }, []);

    const animateStroke = (stroke: DrawingStroke, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
        if (signal.aborted || !mounted.current) { reject(new DOMException("Aborted", "AbortError")); return; }
        setPhase("drawing");
        setActivePainter(stroke.author);
        const points = penTrajectory(stroke.points), start = performance.now();
        const duration = Math.min(2600, Math.max(650, points.length * 12));
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        const partial = { ...stroke, points: [points[0]] };
        strokes.current.push(partial);
        let frame = 0;
        const abort = () => { cancelAnimationFrame(frame); signal.removeEventListener("abort", abort); reject(new DOMException("Aborted", "AbortError")); };
        signal.addEventListener("abort", abort, { once: true });
        const step = (now: number) => {
            if (signal.aborted || !mounted.current) { abort(); return; }
            const progress = reduced ? 1 : Math.min(1, (now - start) / duration);
            partial.points = points.slice(0, Math.max(1, Math.ceil(points.length * progress)));
            repaint();
            if (progress < 1) frame = requestAnimationFrame(step);
            else { signal.removeEventListener("abort", abort); setCount(strokes.current.length); persist(); resolve(); }
        };
        frame = requestAnimationFrame(step);
    });
    const charTurn = async () => {
        if (!mounted.current || !selected || request.current || !canvas.current || pointers.current.size || activePointer.current !== null) return;
        pendingHandoff.current = false;
        const controller = new AbortController(); request.current = controller;
        setPhase("waiting"); setError("");
        try {
            if (session.isGroup) {
                const painters = mode === "together" ? painterIds.filter(id => characters.some(c => c.id === id)) : [];
                if (mode === "together" && !painters.length) throw new Error("请选择至少一位共画角色。");
                await requestGroupDrawingRound({ session, painterIds: painters, history, image: canvas.current.toDataURL("image/png"), strokes: [...strokes.current], comments: [...comments.current], signal: controller.signal,
                    onStroke: stroke => animateStroke(stroke, controller.signal),
                    onComment: async (author, name, text) => {
                        if (controller.signal.aborted || !mounted.current || request.current !== controller) return;
                        const next = { author, name, text, atStroke: strokes.current.length, createdAt: Date.now() };
                        comments.current = [...comments.current, next]; hideComment(); setComment(next); setCommentVisible(true); persist();
                        await abortableDelay(Math.min(5000, Math.max(2000, text.length * 85)), controller.signal);
                        if (!controller.signal.aborted && mounted.current) setCommentVisible(false);
                    } });
                return;
            }
            await requestDrawingTurn({ session, characterId: selected.id, history, image: canvas.current.toDataURL("image/png"),
                strokes: [...strokes.current], signal: controller.signal, mode, comments: comments.current,
                onComment: text => {
                    if (controller.signal.aborted || !mounted.current || request.current !== controller) return;
                    const next = { author:selected.id, name:selected.name, text, atStroke:strokes.current.length, createdAt:Date.now() };
                    comments.current = [...comments.current, next]; hideComment(); setComment(next); setCommentVisible(true); persist();
                    commentTimer.current = setTimeout(() => { commentTimer.current = null; if (mounted.current) setCommentVisible(false); }, Math.min(8000, Math.max(3500, text.length * 100)));
                },
                onStroke: stroke => animateStroke(stroke, controller.signal) });
        } catch (err) {
            if (!controller.signal.aborted && mounted.current) setError(err instanceof Error ? err.message : "绘图失败，现在轮到你。");
        } finally {
            if (request.current === controller) {
                request.current = null;
                if (mounted.current) { setPhase("user"); setActivePainter(null); setCount(strokes.current.length); persist(); }
            }
        }
    };
    const latestTurn = useRef(charTurn); latestTurn.current = charTurn;
    const armHandoff = () => {
        clearIdle();
        if (!pendingHandoff.current || pointers.current.size || toolsActive.current || colorOpenRef.current || pickerOpenRef.current || !selected) return;
        idleTimer.current = setTimeout(() => {
            idleTimer.current = null;
            if (pendingHandoff.current && !colorOpenRef.current && !pickerOpenRef.current && activePointer.current === null) void latestTurn.current();
        }, 3000);
    };
    const latestArm = useRef(armHandoff); latestArm.current=armHandoff;
    useEffect(() => {
        if (!pickerOpen) return;
        const previous = document.activeElement as HTMLElement | null;
        memberPanel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
        const trap = (e: KeyboardEvent) => {
            if (e.key !== "Tab") return;
            const nodes = [...(memberPanel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || [])];
            if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes.at(-1)?.focus(); }
            else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0]?.focus(); }
        };
        document.addEventListener("keydown", trap);
        return () => { document.removeEventListener("keydown", trap); previous?.focus(); };
    }, [pickerOpen]);
    useEffect(() => {
        const finishTools = () => { if(toolsActive.current) { toolsActive.current=false; latestArm.current(); } };
        window.addEventListener("pointerup",finishTools); window.addEventListener("pointercancel",finishTools);
        return () => { window.removeEventListener("pointerup",finishTools); window.removeEventListener("pointercancel",finishTools); };
    }, []);
    const point = (event: { clientX: number; clientY: number; pressure: number; pointerType: string }): DrawingPoint => {
        const rect = canvas.current!.getBoundingClientRect();
        return [Math.max(0, Math.min(600, (event.clientX - rect.left) / rect.width * 600)), Math.max(0, Math.min(800, (event.clientY - rect.top) / rect.height * 800)), event.pointerType === "pen" && event.pressure > 0 ? event.pressure : .5];
    };
    const release = (cancelled: boolean) => {
        if (activePointer.current === null) return;
        activePointer.current = null; persist(); setCount(strokes.current.length);
        if (!cancelled && selected) { pendingHandoff.current = true; armHandoff(); }
        else { clearIdle(); pendingHandoff.current = false; }
    };
    const changeMode = (next: "solo" | "together") => {
        stop(); setPhase("user"); setActivePainter(null); setError(""); setMode(next);
        draftState.current.mode = next; persist();
    };
    const send = () => {
        if (!strokes.current.length || !canvas.current || sending.current) return;
        stop(); setPhase("user"); repaint();
        const names = Object.fromEntries(characters.map(c => [c.id, c.name]));
        const remarks = comments.current.length ? ` 绘画期间的评论：${comments.current.slice(-8).map(c => `${c.name}：${c.text}`).join("；")}` : "";
        const process: DrawingSnapshot = { version:1, createdAt:Date.now(), mode, painterIds: session.isGroup ? [...painterIds] : undefined, strokes:JSON.parse(JSON.stringify(strokes.current)), comments:comments.current.map(c=>({...c})) };
        if (onSend(canvas.current.toDataURL("image/png"), drawingSummary(strokes.current, names) + remarks, process)) {
            sending.current = true; kvRemove(key); onClose();
        } else setError("尚未发送，画板已保留，请稍后再试。");
    };
    return <section className="chat-drawing-board" style={pickerOpen ? { touchAction: "auto" } : undefined} role="dialog" aria-modal="true" aria-label="绘图白板" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape") { stop(); persist(); onClose(); } }}>
        <header className="drawing-header">
            <div className="drawing-header-actions">
                <button type="button" aria-label="返回并保留草稿" onClick={() => { stop(); persist(); onClose(); }}><ChevronLeft /></button>
                <button type="button" aria-label="发送画板" disabled={!count} onClick={send}><Check /></button>
            </div>
            <div className="drawing-mode" aria-label="绘画人数">
                <button type="button" aria-label="单人绘图" aria-pressed={mode === "solo"} onClick={() => changeMode("solo")}><User /></button>
                <button type="button" aria-label="与角色共画" aria-pressed={mode === "together"} disabled={!characters.length} onClick={() => changeMode("together")}><Users /></button>
            </div>
            {session.isGroup && mode === "together" && <button type="button" aria-label="选择共画成员与顺序" aria-expanded={pickerOpen} onClick={() => { clearIdle(); pickerOpenRef.current = true; setPickerOpen(true); }}><ListOrdered /></button>}
        </header>
        <div className="drawing-conversation">
        <div className="drawing-status" aria-live="polite">
            {!session.isGroup && characters.length > 1 && <select aria-label="选择共画角色" value={selected?.id} onChange={e => { stop(); setPhase("user"); setCharacterId(e.target.value); draftState.current.characterId = e.target.value; persist(); }}>{characters.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select>}
            <span>{phase === "waiting" ? session.isGroup ? "大家在看画板" : `${selected?.name || "对方"}在看` : phase === "drawing" ? `${characters.find(c => c.id === activePainter)?.name || selected?.name || "对方"}在画` : "你在画"}</span>
        </div>
        {commentVisible && comment && <div className="drawing-comment" role="status" aria-live="polite" aria-label="角色画板评论">{characters.find(c => c.id === comment.author)?.avatar && <img className="drawing-comment-avatar" src={characters.find(c => c.id === comment.author)!.avatar!} alt="" />}<strong>{comment.name}</strong><span>{comment.text}</span></div>}
        </div>
        {pickerOpen && <div className="drawing-members-overlay" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); pickerOpenRef.current = false; setPickerOpen(false); armHandoff(); } }}>
            <section ref={memberPanel} className="drawing-members" role="dialog" aria-modal="true" aria-label="共画成员与顺序">
                <header><strong>一起画</strong><button type="button" disabled={!painterIds.length} aria-label="完成成员选择" onClick={() => { pickerOpenRef.current = false; setPickerOpen(false); persist(); armHandoff(); }}><Check /></button></header>
                <p>你 → {painterIds.map(id => characters.find(c => c.id === id)?.name).filter(Boolean).join(" → ") || "选择共画成员"} → 你</p>
                <div className="drawing-member-list">{characters.map(c => <button type="button" key={c.id} aria-pressed={painterIds.includes(c.id)} onClick={() => { const next = painterIds.includes(c.id) ? painterIds.filter(id => id !== c.id) : [...painterIds, c.id]; setPainterIds(next); draftState.current.painterIds = next; persist(); }}>
                    {c.avatar && <img src={c.avatar} alt="" />}<span>{c.name}</span><i>{painterIds.includes(c.id) ? painterIds.indexOf(c.id) + 1 : ""}</i>
                </button>)}</div>
            </section>
        </div>}
        <div ref={workspace} className="drawing-workspace"
                onPointerDown={e => {
                    if (e.button !== 0) return;
                    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                    clearIdle(); e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
                    if (pointers.current.size >= 2) {
                        if (activePointer.current !== null) { strokes.current.pop(); activePointer.current = null; setCount(strokes.current.length); repaint(); persist(); }
                        gesturing.current = true; beginPinch(); return;
                    }
                    if (request.current || gesturing.current || activePointer.current !== null || e.target !== canvas.current) return;
                    hideComment(); activePointer.current = e.pointerId; setError("");
                    const seed = Date.now(); strokes.current.push({ id: `user-${seed}`, author: "user", color, width, brush, opacity, seed, points: [point(e)] });
                    setCount(strokes.current.length); repaint();
                }}
                onPointerMove={e => {
                    if (!pointers.current.has(e.pointerId)) return;
                    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                    if (pinch.current && frame.current) {
                        e.preventDefault();
                        const pair = [...pointers.current.values()].slice(0, 2), box = frame.current.getBoundingClientRect();
                        if (pair.length < 2) return;
                        const scale = Math.max(.5, Math.min(4, pinch.current.scale * Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) / pinch.current.distance));
                        view.current = { scale, x: (pair[0].x + pair[1].x) / 2 - box.left - box.width / 2 - pinch.current.anchorX * scale,
                            y: (pair[0].y + pair[1].y) / 2 - box.top - box.height / 2 - pinch.current.anchorY * scale };
                        applyView(); return;
                    }
                    if (activePointer.current !== e.pointerId || request.current) return;
                    e.preventDefault(); const stroke = strokes.current[strokes.current.length - 1];
                    const events = e.nativeEvent.getCoalescedEvents?.() || [e.nativeEvent];
                    for (const event of events.length ? events : [e.nativeEvent]) {
                        const p = point(event), prev = stroke.points[stroke.points.length - 1];
                        if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) > .5 && stroke.points.length < 6000) stroke.points.push(p);
                    }
                    schedulePaint();
                }}
                onPointerUp={e => {
                    pointers.current.delete(e.pointerId);
                    if (activePointer.current === e.pointerId) release(false);
                    beginPinch();
                    if (!pointers.current.size) { gesturing.current = false; armHandoff(); }
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
                }}
                onLostPointerCapture={e => {
                    if (!pointers.current.delete(e.pointerId)) return;
                    if (activePointer.current === e.pointerId) release(true);
                    beginPinch(); if (!pointers.current.size) { gesturing.current = false; armHandoff(); }
                }}
                onPointerCancel={e => {
                    pointers.current.delete(e.pointerId); if (activePointer.current === e.pointerId) release(true);
                    beginPinch(); if (!pointers.current.size) { gesturing.current = false; armHandoff(); }
                }}>
            <div ref={frame} className="drawing-viewport">
                <canvas ref={canvas} width={600} height={800} role="img" aria-label="竖屏白色画板" aria-busy={phase !== "user"} />
            </div>
        </div>
        {error && <p className="drawing-error" role="alert">{error}</p>}
        <footer className="drawing-tools" onPointerDown={() => { toolsActive.current=true; clearIdle(); }} onPointerUp={() => { toolsActive.current=false; armHandoff(); }} onPointerCancel={() => { toolsActive.current=false; armHandoff(); }}>
            <div className="drawing-brushes">{([["pen","手绘"],["pencil","铅笔"],["watercolor","水彩"]] as const).map(([value,label]) => <button type="button" key={value} aria-label={`${label}笔刷`} aria-pressed={brush === value} onClick={() => { setBrush(value); armHandoff(); }}>{label}</button>)}
                <button type="button" aria-label="撤回上一笔" disabled={phase !== "user" || !count} onClick={() => { clearIdle(); pendingHandoff.current=false; strokes.current.pop(); setCount(strokes.current.length); persist(); repaint(); }}><Eraser size={19} /></button>
            </div>
            <div className="drawing-palette">{palette.map(c => <button key={c} type="button" style={{ "--drawing-color": c } as React.CSSProperties} aria-label={`画笔颜色 ${c}`} aria-pressed={c === color} onClick={() => { setColor(c); armHandoff(); }}><i /></button>)}
                <button type="button" className="drawing-spectrum-button" aria-label="光谱选色" aria-expanded={colorOpen} onClick={() => { const open=!colorOpen; colorOpenRef.current=open; setColorOpen(open); if(open) clearIdle(); else armHandoff(); }}><i /></button>
            </div>
            {colorOpen && <DrawingSpectrum color={color} onChange={setColor} />}
            <label className="drawing-slider"><span>粗细</span><input aria-label="画笔粗细" type="range" min={1} max={DRAWING_MAX_WIDTH} value={width} onChange={e => { setWidth(Number(e.target.value)); armHandoff(); }} /><output>{width}</output></label>
            <label className="drawing-slider"><span>不透明度</span><input aria-label="画笔不透明度" type="range" min={5} max={100} value={Math.round(opacity*100)} onChange={e => { setOpacity(Number(e.target.value)/100); armHandoff(); }} /><output>{Math.round(opacity*100)}%</output></label>
        </footer>
    </section>;
}

function hsvHex(h: number, s: number, v: number) {
    const f = (n: number) => { const k=(n+h/60)%6; return Math.round((v-v*s*Math.max(0,Math.min(k,4-k,1)))*255).toString(16).padStart(2,"0"); };
    return `#${f(5)}${f(3)}${f(1)}`;
}
function DrawingSpectrum({color,onChange}:{color:string;onChange:(color:string)=>void}) {
    const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255), max=Math.max(...rgb), min=Math.min(...rgb), d=max-min;
    const hue=d===0?0:((max===rgb[0]?(rgb[1]-rgb[2])/d: max===rgb[1]?(rgb[2]-rgb[0])/d+2:(rgb[0]-rgb[1])/d+4)*60+360)%360;
    const [h,setH]=useState(hue), [s,setS]=useState(max?d/max:0), [v,setV]=useState(max);
    useEffect(()=>{if(d>0)setH(hue);setS(max?d/max:0);setV(max);},[color]);
    const active=useRef<number|null>(null);
    const choose=(e:React.PointerEvent<HTMLDivElement>)=>{const r=e.currentTarget.getBoundingClientRect();const ns=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),nv=1-Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));setS(ns);setV(nv);onChange(hsvHex(h,ns,nv));};
    return <div className="drawing-spectrum">
        <div className="drawing-sv" style={{backgroundColor:`hsl(${h} 100% 50%)`}} aria-label="饱和度与明度色谱" onPointerDown={e=>{if(!e.isPrimary)return;active.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);choose(e);}} onPointerMove={e=>{if(active.current===e.pointerId)choose(e);}} onPointerUp={()=>{active.current=null;}} onPointerCancel={()=>{active.current=null;}}><i style={{left:`${s*100}%`,top:`${(1-v)*100}%`}} /></div>
        <input className="drawing-hue" aria-label="色相" type="range" min={0} max={359} value={h} onChange={e=>{const nh=Number(e.target.value);setH(nh);onChange(hsvHex(nh,s,v));}} />
        <div className="drawing-color-values"><output aria-label="颜色十六进制">{color}</output><label>饱和度<input aria-label="饱和度" type="range" min={0} max={100} value={s*100} onChange={e=>{const n=+e.target.value/100;setS(n);onChange(hsvHex(h,n,v));}} /></label><label>明度<input aria-label="明度" type="range" min={0} max={100} value={v*100} onChange={e=>{const n=+e.target.value/100;setV(n);onChange(hsvHex(h,s,n));}} /></label></div>
    </div>;
}
