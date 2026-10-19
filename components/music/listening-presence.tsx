"use client";
import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { getListeningRoom, subscribeListeningRoom, leaveListeningRoom } from "@/lib/listen-together";
import { loadCharacters } from "@/lib/character-storage";
import { loadChatSessions, pushChatMessage } from "@/lib/chat-storage";
import { resolveUserIdentity } from "@/lib/settings-storage";
import { getChatCharacterAvatar } from "@/lib/chat-session-avatar";
import { getChatImageFromIndexedDB } from "@/lib/chat-asset-storage";
import { useMusicControlsOptional } from "@/lib/music-context";
import { X } from "lucide-react";
const serverSnapshot = () => null;
export function useListeningPresence() {
    const [, refresh] = useState(0);
    useEffect(() => {
        const update = () => refresh(value => value + 1);
        const events = ["chat-session-avatars-updated", "chat-characters-updated", "settings-bindings-updated"];
        events.forEach(event => window.addEventListener(event, update));
        return () => events.forEach(event => window.removeEventListener(event, update));
    }, []);
    const room = useSyncExternalStore(subscribeListeningRoom, getListeningRoom, serverSnapshot);
    const character = room ? loadCharacters().find(c => c.id === room.characterId) : null;
    const session = room ? loadChatSessions().find(s => s.id === room.sessionId) : null;
    const user = resolveUserIdentity();
    return { room: room?.status === "declined" ? null : room, name: session?.alias || character?.name || "对方", avatar: getChatCharacterAvatar(session, character), userName: user?.name || "你", userAvatar: user?.avatarUrl };
}
export function ListeningAvatar({ src, name }: { src?: string | null; name: string }) {
    const [resolved, setResolved] = useState<string | null>(null);
    useEffect(() => {
        let alive = true; setResolved(null);
        if (src) {
            if (/^(https?:|data:|blob:|\/)/.test(src)) setResolved(src);
            else getChatImageFromIndexedDB(src.replace(/^asset:\/\//, "")).then(value => { if (alive) setResolved(value); }).catch(() => {});
        }
        return () => { alive = false; };
    }, [src]);
    return resolved ? <img src={resolved} alt="" draggable={false} onError={() => setResolved(null)} /> : <span>{name.slice(0, 1)}</span>;
}
// Decorative spectrum: fixed radial bars change length; neither the ring nor color rotates.
const spectrumBars = Array.from({ length: 64 }, (_, index) => {
    const angle = index * Math.PI * 2 / 64;
    return {
        rotation: index * 360 / 64,
        length: 3 + 5 * (.5 + .5 * Math.sin(angle * 3 + .8)) ** 2,
        delay: -.7 * (.5 + .5 * Math.sin(angle * 2)) - .21 * Math.cos(angle * 5),
        duration: 1.1 + .25 * (.5 + .5 * Math.cos(angle * 3)),
    };
});
function ListeningWaveRing() {
    return <svg className="listening-ring" viewBox="0 0 88 88" fill="none">
        <circle className="listening-ring-base" cx="44" cy="44" r="34" />
        <g className="listening-wave-window listening-spectrum">
            {spectrumBars.map((bar, index) => <g key={index} transform={"translate(44 44) rotate(" + bar.rotation + ") translate(0 -32)"}>
                <line className="listening-spectrum-bar" x1="0" y1="0" x2="0" y2={-bar.length}
                    style={{ "--spectrum-delay": bar.delay + "s", "--spectrum-duration": bar.duration + "s" } as CSSProperties} />
            </g>)}
        </g>
    </svg>;
}

export function ListeningPlanets({ presence, playing }: { presence: ReturnType<typeof useListeningPresence>; playing: boolean }) {
    if (!presence.room) return null;
    return <div className="listening-planets" aria-hidden="true" data-orbiting={presence.room.status === "joined" && playing ? "true" : "false"}>
        <ListeningWaveRing />
        <span className="listening-orbit listening-orbit-user"><span className="listening-planet"><ListeningAvatar src={presence.userAvatar} name={presence.userName} /></span></span>
        <span className="listening-orbit listening-orbit-char"><span className="listening-planet"><ListeningAvatar src={presence.avatar} name={presence.name} /></span></span>
    </div>;
}
export function ListeningPlayerPresence() {
    const presence = useListeningPresence();
    const player = useMusicControlsOptional();
    const [open, setOpen] = useState(false);
    const room = presence.room;
    useEffect(() => setOpen(false), [room?.id]);
    if (!room) return null;
    const label = room.status === "invited" ? `等待${presence.name}加入` : `正在和${presence.name}一起听`;
    return <>
        <button className="listening-player-presence" onClick={() => setOpen(true)} aria-label={label + "，查看成员"}>
            <span className="listening-avatar-pair"><span><ListeningAvatar src={presence.userAvatar} name={presence.userName} /></span><span><ListeningAvatar src={presence.avatar} name={presence.name} /></span></span>
            <span>{label}</span>
        </button>
        {open && <div className="listening-members-overlay" onClick={() => setOpen(false)} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}>
            <div className="listening-members" role="dialog" aria-modal="true" aria-label="一起听成员" onClick={e => e.stopPropagation()} onKeyDown={e => {
                if (e.key !== "Tab") return;
                const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>("button");
                const first = buttons[0], last = buttons[buttons.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }}>
                <header><strong>一起听</strong><button autoFocus aria-label="关闭成员面板" onClick={() => setOpen(false)}><X size={20} /></button></header>
                <div className="listening-member"><span className="listening-member-avatar"><ListeningAvatar src={presence.userAvatar} name={presence.userName} /></span><span>{presence.userName}<small>你</small></span></div>
                <div className="listening-member"><span className="listening-member-avatar"><ListeningAvatar src={presence.avatar} name={presence.name} /></span><span>{presence.name}<small>{room.status === "invited" ? "邀请中" : player?.isPlaying ? "一起听中" : "音乐已暂停"}</small></span></div>
                <button className="listening-end" onClick={() => {
                    if (getListeningRoom()?.id !== room.id) return;
                    leaveListeningRoom(room.sessionId);
                    pushChatMessage({ sessionId: room.sessionId, role: "system", content: room.status === "invited" ? "用户取消了一起听邀请。" : "用户结束了一起听。" });
                    window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId: room.sessionId } }));
                    setOpen(false);
                }}>{room.status === "invited" ? "取消邀请" : "结束一起听"}</button>
            </div>
        </div>}
    </>;
}
