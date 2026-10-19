// components/music/music-float.tsx — Floating music control widget (draggable vinyl)
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMusicControlsOptional } from "@/lib/music-context";
import { useListeningPresence, ListeningPlanets } from "./listening-presence";
import { MusicMarquee } from "@/components/widgets/music-marquee";

const DRAG_START_THRESHOLD = 6;
const SWIPE_DISMISS_EDGE_X = 4;
const SWIPE_DISMISS_SPEED = 1.5; // px/ms
const SWIPE_DISMISS_ARMING_X = 88;
const SWIPE_INERTIA_MS = 140;
const SWIPE_VELOCITY_RECENT_MS = 180;

export default function MusicFloat({ hidden }: { hidden?: boolean }) {
    const player = useMusicControlsOptional();
    const presence = useListeningPresence();
    const [dismissedListeningId, setDismissedListeningId] = useState<string | null>(null);
    const showListening = presence.room?.status === "joined" && presence.room.id !== dismissedListeningId;
    const floatRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ x: 310, y: 680 });
    const dragRef = useRef<{
        pointerId: number | null; active: boolean;
        startX: number; startY: number; origX: number; origY: number;
        lastX: number; lastTime: number;
        lastLeftSpeed: number; lastLeftSpeedTime: number;
        moved: boolean; startedOnInfo: boolean;
    }>({
        pointerId: null,
        active: false,
        startX: 0,
        startY: 0,
        origX: 0,
        origY: 0,
        lastX: 0,
        lastTime: 0,
        lastLeftSpeed: 0,
        lastLeftSpeedTime: 0,
        moved: false,
        startedOnInfo: false,
    });
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [dismissing, setDismissing] = useState(false);

    useEffect(() => {
        if (!expanded || hidden) return;
        const onOutsidePointerDown = (event: PointerEvent) => {
            if (dragRef.current.active || !floatRef.current || floatRef.current.contains(event.target as Node)) return;
            setExpanded(false);
        };
        document.addEventListener("pointerdown", onOutsidePointerDown, true);
        return () => document.removeEventListener("pointerdown", onOutsidePointerDown, true);
    }, [expanded, hidden]);

    const clampPos = useCallback((x: number, y: number) => {
        const el = floatRef.current;
        const parent = el?.closest("[data-ui='phone-screen']") as HTMLElement | null;
        if (!el || !parent) return { x, y };
        const pw = parent.clientWidth;
        const ph = parent.clientHeight;
        const ew = el.offsetWidth;
        const eh = el.offsetHeight;
        return {
            x: Math.max(0, Math.min(x, pw - ew)),
            y: Math.max(0, Math.min(y, ph - eh)),
        };
    }, []);

    const dismissFloat = useCallback(() => {
        if (!player) return;
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
        setDismissing(true);
        dismissTimerRef.current = setTimeout(() => {
            if (presence.room?.status === "joined") setDismissedListeningId(presence.room.id);
            player.dismissFloat();
            setDismissing(false);
            setExpanded(false);
            dismissTimerRef.current = null;
        }, 250);
    }, [player, presence.room]);

    useEffect(() => () => {
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    }, []);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        const target = e.target as HTMLElement;
        // Let transport buttons keep their native click behavior.
        if (target.closest("button")) return;
        e.preventDefault();
        e.stopPropagation();
        floatRef.current?.setPointerCapture?.(e.pointerId);
        const now = performance.now();
        dragRef.current = {
            pointerId: e.pointerId,
            active: true,
            startX: e.clientX, startY: e.clientY,
            origX: pos.x, origY: pos.y,
            lastX: e.clientX,
            lastTime: now,
            lastLeftSpeed: 0,
            lastLeftSpeedTime: 0,
            moved: false,
            startedOnInfo: Boolean(target.closest(".music-float-info")) || (expanded && Boolean(target.closest(".music-float-cover-wrap"))),
        };
    }, [pos, expanded]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        const d = dragRef.current;
        if (!d.active || d.pointerId !== e.pointerId) return;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (Math.abs(dx) > DRAG_START_THRESHOLD || Math.abs(dy) > DRAG_START_THRESHOLD) d.moved = true;
        if (d.moved) {
            const nextPos = clampPos(d.origX + dx, d.origY + dy);
            const now = performance.now();
            const dt = Math.max(1, now - d.lastTime);
            const stepDx = e.clientX - d.lastX;
            const leftSpeed = stepDx < 0 ? Math.abs(stepDx) / dt : 0;
            if (leftSpeed > 0) {
                d.lastLeftSpeed = leftSpeed;
                d.lastLeftSpeedTime = now;
            }
            d.lastX = e.clientX;
            d.lastTime = now;
            setPos(nextPos);
        }
    }, [clampPos]);

    const finishPointer = useCallback((e: React.PointerEvent) => {
        const d = dragRef.current;
        if (!d.active || d.pointerId !== e.pointerId) return;
        if (floatRef.current?.hasPointerCapture?.(e.pointerId)) {
            floatRef.current.releasePointerCapture(e.pointerId);
        }
        d.active = false;
        d.pointerId = null;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        const finalPos = clampPos(d.origX + dx, d.origY + dy);
        const now = performance.now();
        const dt = Math.max(1, now - d.lastTime);
        const stepDx = e.clientX - d.lastX;
        const leftSpeed = stepDx < 0 ? Math.abs(stepDx) / dt : 0;
        const recentMoveSpeed = now - d.lastLeftSpeedTime <= SWIPE_VELOCITY_RECENT_MS ? d.lastLeftSpeed : 0;
        const effectiveLeftSpeed = Math.max(leftSpeed, recentMoveSpeed);
        const inertialX = finalPos.x - effectiveLeftSpeed * SWIPE_INERTIA_MS;
        const shouldDismiss = d.moved
            && finalPos.x <= SWIPE_DISMISS_ARMING_X
            && effectiveLeftSpeed >= SWIPE_DISMISS_SPEED
            && inertialX <= SWIPE_DISMISS_EDGE_X;

        if (shouldDismiss) {
            dismissFloat();
            return;
        }

        if (d.moved) {
            setPos(finalPos);
            return;
        }

        if (!d.moved && player) {
            if (d.startedOnInfo) {
                setExpanded(false);
                player.openFullPlayer();
                return;
            }

            setExpanded(prev => {
                requestAnimationFrame(() => setPos(p => clampPos(p.x, p.y)));
                return !prev;
            });
        }
    }, [player, clampPos, dismissFloat]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => finishPointer(e), [finishPointer]);
    const handlePointerCancel = useCallback(() => {
        dragRef.current.active = false;
        dragRef.current.pointerId = null;
    }, []);

    // Re-clamp after the expanded width settles, including on viewport resize.
    useEffect(() => {
        const element = floatRef.current;
        if (!element) return;
        const observer = new ResizeObserver(() => setPos(p => clampPos(p.x, p.y)));
        observer.observe(element);
        const parent = element.closest("[data-ui='phone-screen']");
        if (parent) observer.observe(parent);
        return () => observer.disconnect();
    }, [clampPos, expanded, hidden, player?.floatEnabled, player?.floatDismissed, player?.currentTrack?.id, showListening]);

    if (!player || hidden || (!showListening && (!player.currentTrack || player.floatDismissed || !player.floatEnabled))) return null;

    const track = player.currentTrack ?? { title: "一起听", artist: "等待选歌", coverUrl: undefined };

    return (
        <div
            ref={floatRef}
            className="music-float"
            data-together={presence.room?.status}
            {...(expanded ? { "data-expanded": "" } : {})}
            {...(dismissing ? { "data-dismissing": "" } : {})}
            style={{ left: pos.x, top: pos.y }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
        >
            <div className="music-float-inner">
                <ListeningPlanets presence={presence} playing={player.isPlaying} />
                {/* Cover art */}
                <div className="music-float-cover-wrap" role="button" tabIndex={0} aria-label={expanded ? "打开播放器" : "展开音乐控制"}
                    onKeyDown={e => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        e.stopPropagation();
                        if (expanded) { setExpanded(false); player.openFullPlayer(); }
                        else setExpanded(true);
                    }} {...(player.isPlaying ? { "data-playing": "" } : {})}>
                    <div className="music-float-vinyl-groove music-float-vinyl-groove-1" />
                    <div className="music-float-vinyl-groove music-float-vinyl-groove-2" />
                    <div className="music-float-vinyl-center">
                        {track.coverUrl ? (
                            <img src={track.coverUrl} alt="" className="music-float-cover-img" draggable={false} />
                        ) : (
                            <div className="music-float-cover-placeholder">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                                </svg>
                            </div>
                        )}
                    </div>
                </div>

                {/* Track Info */}
                <div className="music-float-info">
                    <div className="music-float-title"><MusicMarquee text={track.title} /></div>
                    <div className="music-float-artist"><MusicMarquee text={track.artist} /></div>
                    {presence.room && <div className="music-float-together"><MusicMarquee text={presence.room.status === "invited" ? `等待${presence.name}加入` : `正在和${presence.name}一起听`} /></div>}
                </div>

                {/* Compact Controls */}
                <div className="music-float-controls">
                    <button tabIndex={expanded ? 0 : -1} aria-label="上一首" className="music-float-btn" onClick={(e) => { e.stopPropagation(); player.prev(); }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                        </svg>
                    </button>
                    <button tabIndex={expanded ? 0 : -1} aria-label={player.isPlaying ? "暂停" : "播放"} className="music-float-btn music-float-btn-play" onClick={(e) => { e.stopPropagation(); player.togglePlay(); }}>
                        {player.isPlaying ? (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
                            </svg>
                        ) : (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        )}
                    </button>
                    <button tabIndex={expanded ? 0 : -1} aria-label="下一首" className="music-float-btn" onClick={(e) => { e.stopPropagation(); player.next(); }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 18l8.5-6L6 6v12zm8.5 0h2V6h-2v12z" />
                        </svg>
                    </button>
                </div>
                {expanded && <button className="music-float-btn music-float-hide" aria-label="关闭浮窗，继续播放" title="关闭浮窗，继续播放（可在音乐设置中开启）" onClick={() => { if (presence.room?.status === "joined") setDismissedListeningId(presence.room.id); player.setFloatEnabled(false); }}>×</button>}
            </div>
        </div>
    );
}
