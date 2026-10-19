"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, Headphones, Music2, Pause, Play, ChevronDown, X } from "lucide-react";
import MusicApp from "./music-app";
import { useMusicControlsOptional } from "@/lib/music-context";
import { getMusicControlBridge } from "@/lib/music-control-bridge";
import { getListeningRoom, subscribeListeningRoom } from "@/lib/listen-together";
import { loadPhoneSnapshot } from "@/lib/checkphone-storage";
import type { CheckPhoneMusicPayload, CheckPhoneMusicTrack } from "@/lib/checkphone-config";
import { assertCharacterIdentityAccess, canCurrentIdentityInteract } from "@/lib/identity-access";
import { loadChatMessages } from "@/lib/chat-storage";
import styles from "./chat-music-panel.module.css";

const serverRoom = () => null;
export function useListeningRoom() { return useSyncExternalStore(subscribeListeningRoom, getListeningRoom, serverRoom); }

export function ListeningStatus({ sessionId, name, avatar, onOpen }: { sessionId: string; name: string; avatar?: string; onOpen: () => void }) {
    const room = useListeningRoom();
    const player = useMusicControlsOptional();
    const [collapsed, setCollapsed] = useState(false);
    const statusRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
    const drag = useRef<{ id: number; x: number; y: number; left: number; top: number; scale: number; moved: boolean } | null>(null);
    const suppressClick = useRef(false);
    const clampPosition = (x: number, y: number, snap = false) => {
        const node = statusRef.current;
        const parent = node?.offsetParent as HTMLElement | null;
        if (!node || !parent) return { x, y };
        const maxX = Math.max(12, parent.clientWidth - node.offsetWidth - 12);
        const maxY = Math.max(12, parent.clientHeight - node.offsetHeight - 12);
        return { x: snap ? (x + node.offsetWidth / 2 < parent.clientWidth / 2 ? 12 : maxX) : Math.max(12, Math.min(maxX, x)), y: Math.max(12, Math.min(maxY, y)) };
    };
    useEffect(() => {
        const node = statusRef.current;
        const parent = node?.offsetParent as HTMLElement | null;
        if (!node || !parent) return;
        const observer = new ResizeObserver(() => setPosition(current => current ? clampPosition(current.x, current.y, true) : current));
        observer.observe(parent); observer.observe(node);
        return () => observer.disconnect();
    }, [room?.sessionId, room?.status, sessionId]);
    if (room?.sessionId !== sessionId || room.status === "declined") return null;
    return <div ref={statusRef} className={styles.status} style={position ? { left: position.x, top: position.y, right: "auto" } : undefined}
        onPointerDown={event => {
            event.stopPropagation();
            if (!event.isPrimary || event.button !== 0) return;
            const node = event.currentTarget;
            const parent = node.offsetParent as HTMLElement | null;
            suppressClick.current = false;
            drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: node.offsetLeft, top: node.offsetTop, scale: parent?.clientWidth ? parent.getBoundingClientRect().width / parent.clientWidth : 1, moved: false };
        }}
        onPointerMove={event => {
            const start = drag.current;
            if (!start || start.id !== event.pointerId) return;
            const dx = (event.clientX - start.x) / start.scale, dy = (event.clientY - start.y) / start.scale;
            if (!start.moved && Math.hypot(dx, dy) < 6) return;
            start.moved = true; suppressClick.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            setPosition(clampPosition(start.left + dx, start.top + dy));
        }}
        onPointerUp={event => {
            const start = drag.current;
            if (!start || start.id !== event.pointerId) return;
            if (start.moved) setPosition(clampPosition(start.left + (event.clientX - start.x) / start.scale, start.top + (event.clientY - start.y) / start.scale, true));
            drag.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { drag.current = null; setPosition(current => current ? clampPosition(current.x, current.y, true) : current); }}
        onLostPointerCapture={() => { drag.current = null; }}
        onClickCapture={event => { if (suppressClick.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}
        onDragStart={event => event.preventDefault()}>
        <button type="button" onClick={onOpen} aria-label={`打开与${name}的一起听`}>
            {avatar ? <img src={avatar} alt="" /> : <Headphones size={20} />}
            {!collapsed && <span><strong>{room.status === "invited" ? `等待${name}加入` : `和${name}一起听`}</strong><small>{player?.currentTrack ? `${player.isPlaying ? "" : "已暂停 · "}${player.currentTrack.title}` : "选一首歌吧"}</small></span>}
        </button>
        <button type="button" aria-label={collapsed ? "展开一起听状态" : "收起一起听状态"} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}><ChevronDown size={16} style={{ transform: collapsed ? "rotate(180deg)" : undefined }} /></button>
    </div>;
}

type Props = { sessionId: string; characterId?: string; name: string; avatar?: string; busy: boolean; onClose: () => void; onInvite: () => void; onLeave: () => void; onRetry: () => void };
export default function ChatMusicPanel({ sessionId, characterId, name, avatar, busy, onClose, onInvite, onLeave, onRetry }: Props) {
    const room = useListeningRoom();
    const mine = room?.sessionId === sessionId ? room : null;
    const player = useMusicControlsOptional();
    const [tab, setTab] = useState<"music" | "character">("music");
    const [payload, setPayload] = useState<CheckPhoneMusicPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [notice, setNotice] = useState("");
    const [playing, setPlaying] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const verify = () => { if (characterId && !canCurrentIdentityInteract(characterId)) onClose(); };
        verify();
        window.addEventListener("settings-bindings-updated", verify);
        return () => window.removeEventListener("settings-bindings-updated", verify);
    }, [characterId, onClose]);
    useEffect(() => {
        let cancelled = false;
        if (!characterId) { setLoading(false); return; }
        if (!canCurrentIdentityInteract(characterId)) { setLoading(false); return; }
        loadPhoneSnapshot<CheckPhoneMusicPayload>(characterId, "music").then(snapshot => {
            if (!cancelled) { assertCharacterIdentityAccess(characterId); setPayload(snapshot?.payload ?? null); }
        }).catch(() => { if (!cancelled) setNotice("暂时无法读取角色歌单"); }).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [characterId]);
    useEffect(() => {
        const node = root.current;
        const previous = document.activeElement as HTMLElement | null;
        const siblings = Array.from(node?.parentElement?.children ?? []).filter(item => item !== node) as HTMLElement[];
        const saved = siblings.map(item => item.inert);
        siblings.forEach(item => { item.inert = true; });
        node?.focus();
        return () => { siblings.forEach((item, i) => { item.inert = saved[i]; }); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
    }, []);
    const play = async (title: string, artist?: string) => {
        if (playing) return;
        setPlaying(true); setNotice("正在查找歌曲…");
        try {
            if (characterId) assertCharacterIdentityAccess(characterId);
            const result = await getMusicControlBridge()?.playByQuery(title, artist);
            setNotice(result?.message ?? "播放器未就绪");
        } catch { setNotice("暂时无法播放，请稍后重试"); }
        finally { setPlaying(false); }
    };
    const controls = <div className={styles.accessory}>
        {characterId && <div className={styles.invitation}>
            {avatar ? <img src={avatar} alt="" /> : <span className={styles.avatar}><Headphones size={22} /></span>}
            <span><strong>{mine?.status === "joined" ? `和${name}一起听` : mine?.status === "invited" ? "邀请已发出" : `邀请${name}一起听`}</strong><small>{mine?.status === "invited" ? "等待对方回复" : mine?.status === "declined" ? "对方这次没有加入" : "让音乐留在你们的对话里"}</small></span>
            {mine && mine.status !== "declined" ? <>
                {mine.status === "invited" && !busy && <button type="button" onClick={onRetry}>等回复</button>}
                <button type="button" onClick={onLeave} aria-label={mine.status === "joined" ? "结束一起听" : "取消邀请"}><X size={18} /></button>
            </> : <button type="button" disabled={busy || !!(room && room.status !== "declined")} onClick={() => {
                setNotice("");
                try { onInvite(); }
                catch (error) { setNotice(error instanceof Error ? error.message : "邀请失败，请重试"); }
            }}>{busy ? "正在回复" : "邀请"}</button>}
        </div>}
        {room && !mine && room.status !== "declined" && <p className={styles.note}>已有一起听会话，请先回原聊天结束。</p>}
        <nav className={styles.tabs} aria-label="音乐内容">
            <button type="button" aria-current={tab === "music" ? "page" : undefined} onClick={() => setTab("music")}>音乐</button>
            {characterId && <button type="button" aria-current={tab === "character" ? "page" : undefined} onClick={() => setTab("character")}>{name}的歌单</button>}
        </nav>
    </div>;
    const tracks = [...(payload?.recentTracks ?? []), ...(payload?.likedTracks ?? [])];
    const unique = [...new Map(tracks.map(track => [track.id, track])).values()];
    const song = (track: Pick<CheckPhoneMusicTrack, "id" | "title" | "artist">) => <button className={styles.song} type="button" key={track.id} disabled={playing} onClick={() => void play(track.title, track.artist)}><span className={styles.songIcon}><Music2 size={20} /></span><span><strong>{track.title}</strong><small>{track.artist}</small></span><Play size={16} /></button>;
    const shared = characterId ? loadChatMessages(sessionId).filter(msg => msg.role === "assistant" && msg.mediaType === "music_share" && msg.mediaData?.musicTitle).map(msg => ({ id: msg.id, title: msg.mediaData!.musicTitle!, artist: msg.mediaData?.musicArtist ?? "" })) : [];
    return <div ref={root} className={styles.panel} onPointerDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="音乐与一起听" tabIndex={-1} onKeyDown={event => {
        if (event.key === "Escape") { event.stopPropagation(); onClose(); }
        if (event.key === "Tab") {
            const items = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), summary, input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []).filter(item => item.getClientRects().length);
            const first = items[0], last = items.at(-1);
            if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { event.preventDefault(); first?.focus(); }
        }
    }}>
        {tab === "music" ? <MusicApp onClose={onClose} headerAccessory={controls} /> : <>
            <header className={styles.header}><button type="button" onClick={onClose} aria-label="返回聊天"><ArrowLeft size={22} /></button><h2>音乐</h2></header>
            {controls}
            <div className={styles.library}>
                <h2>{name}的音乐</h2>
                {loading && <p>正在读取歌单…</p>}
                {payload?.playlists?.map(list => <details key={list.id} className={styles.playlist}><summary><Music2 size={22} /><span><strong>{list.title}</strong><small>{list.subtitle}</small></span><ChevronDown size={16} /></summary><p>{list.curatorNote}</p>{list.trackIds.map(id => unique.find(track => track.id === id)).filter((track): track is CheckPhoneMusicTrack => !!track).map(song)}{!list.trackIds.length && <p>这份歌单还没有曲目</p>}</details>)}
                {!!unique.length && <section><h3>最近听过与喜欢</h3>{unique.map(song)}</section>}
                {!!shared.length && <section><h3>分享给你的歌</h3>{shared.map(song)}</section>}
                {!loading && !unique.length && !payload?.playlists?.length && !shared.length && <p className={styles.empty}>这里还没有{name}的音乐记录。查手机中已有的歌单、以及对方在聊天里分享的歌，会出现在这里。</p>}
            </div>
            {player?.currentTrack && <div className={styles.now}><button type="button" onClick={player.openFullPlayer}><Music2 size={20} /><span>{player.currentTrack.title}</span></button><button type="button" onClick={player.togglePlay} aria-label={player.isPlaying ? "暂停" : "播放"}>{player.isPlaying ? <Pause size={20} /> : <Play size={20} />}</button></div>}
        </>}
        {notice && <button type="button" className={styles.notice} onClick={() => setNotice("")} role="status">{notice}</button>}
    </div>;
}
