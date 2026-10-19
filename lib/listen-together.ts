import { assertIdentityActive, getCurrentIdentityId } from "./identity-runtime";
import { assertCharacterIdentityAccess, canCurrentIdentityInteract } from "./identity-access";
import { getMusicControlBridge } from "./music-control-bridge";
import { pushChatMessage, loadChatSessions, updateMessageMediaData, loadChatMessages, CHAT_REQUEST_REPLY_EVENT } from "./chat-storage";

export type ListeningRoom = {
    id: string; identityId: string | null; sessionId: string; characterId: string;
    status: "invited" | "joined" | "declined"; startedAt: number;
    initiator?: "user" | "character";
    invitationMessageId?: string;
    song?: { title?: string; artist?: string; coverUrl?: string };
};
// A live room belongs to this phone realm; reload/switch does not revive a stale invitation.
let room: ListeningRoom | null = null;
const listeners = new Set<() => void>();
function emit() { listeners.forEach(listener => listener()); }
function createInvitationId(): string {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    // getRandomValues remains available on LAN HTTP; the ID is a correlation token.
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}
export function subscribeListeningRoom(listener: () => void) {
    listeners.add(listener);
    window.addEventListener("settings-bindings-updated", listener);
    return () => { listeners.delete(listener); window.removeEventListener("settings-bindings-updated", listener); };
}
export function getListeningRoom(): ListeningRoom | null {
    if (!room || room.identityId !== getCurrentIdentityId()) return null;
    if (!canCurrentIdentityInteract(room.characterId)) { room = null; return null; }
    return room;
}
export function inviteListeningRoom(sessionId: string, characterId: string): ListeningRoom {
    assertIdentityActive(); assertCharacterIdentityAccess(characterId);
    const current = getListeningRoom();
    if (current && current.status !== "declined" && current.sessionId !== sessionId) throw new Error("请先结束当前的一起听");
    room = { id: createInvitationId(), identityId: getCurrentIdentityId(), sessionId, characterId, status: "invited", startedAt: Date.now() };
    emit(); return room;
}
export function leaveListeningRoom(sessionId: string) {
    assertIdentityActive();
    if (getListeningRoom()?.sessionId !== sessionId) return;
    room = null; emit();
}
export function listeningRoomPrompt(characterId: string, sessionId?: string): string {
    const current = getListeningRoom();
    if (!current || current.characterId !== characterId || current.sessionId !== sessionId || current.status === "declined") return "";
    if (current.status === "invited" && current.initiator === "character") return "你已向用户发出一起听邀请，正在等待用户接受或拒绝。不要代替用户接受，不重复邀请；正常继续对话。";
    if (current.status === "invited") return `用户邀请你一起听歌。按人设、关系与当前意愿接受或拒绝；自然回复后附[一起听:${current.id}:接受]或[一起听:${current.id}:拒绝]。`;
    const snapshot = getMusicControlBridge()?.getState();
    const track = snapshot?.identityId === current.identityId ? snapshot.currentTrack : null;
    return `你正在与用户一起听歌。${track ? `当前${snapshot!.isPlaying ? "播放" : "暂停"}：${track.title} · ${track.artist}。` : "尚未播放歌曲。"}换歌、歌曲结束或暂停不结束一起听，无需重新邀请；仅任一方主动退出才结束。具体歌词仅以用户分享的歌词卡或输入文字为准。继续当前对话；想结束时自然说明并附[一起听:${current.id}:退出]。`;
}
export function applyListeningRoomReply(text: string, sessionId: string): string {
    const cleaned = text.replace(/\[一起听邀请(?::([^\]\n]*))?\]/g, (_, song: string | undefined) => {
        const session = loadChatSessions().find(item => item.id === sessionId);
        if (!session || session.isGroup || !canCurrentIdentityInteract(session.contactId)) return "";
        const current = getListeningRoom();
        if (current && current.status !== "declined") {
            if (current.sessionId !== sessionId) {
                pushChatMessage({ sessionId, role: "system", content: "一起听邀请未创建：请先结束另一个聊天的一起听。" });
                window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId } }));
                return "";
            }
            // A repeated marker must not invalidate an unanswered character invitation.
            if (current.status === "invited" && current.initiator === "character") return "";
            // Same chat: an explicit new character invitation may replace the earlier
            // user invitation/listening session, but never grants consent on behalf of the user.
        }
        const invitation = inviteListeningRoom(sessionId, session.contactId);
        const snapshot = getMusicControlBridge()?.getState();
        const track = snapshot?.identityId === invitation.identityId ? (snapshot.currentTrack ?? snapshot.selectedTrack) : null;
        const [title, artist] = (song || "").split("|").map(value => value.trim());
        const matches = !title || (track?.title === title && (!artist || track.artist === artist));
        const metadata = { title: title || track?.title, artist: artist || (matches ? track?.artist : undefined), coverUrl: matches ? track?.coverUrl : undefined };
        const message = pushChatMessage({ sessionId, role: "assistant", content: "邀请你一起听歌。" + (metadata.title ? ` 歌曲：${metadata.title}${metadata.artist ? " · " + metadata.artist : ""}` : ""), mediaType: "listening_invite", mediaData: { listeningInvite: { roomId: invitation.id, initiator: "character", ...metadata } } });
        room = { ...invitation, initiator: "character", invitationMessageId: message.id, song: metadata };
        if (metadata.title && !metadata.coverUrl) {
            void import("./music-share-resolution").then(module => module.resolveSharedSong(metadata.title!, metadata.artist)).then(track => {
                if (!track?.coverUrl || getCurrentIdentityId() !== invitation.identityId) return;
                const saved = loadChatMessages(sessionId).find(item => item.id === message.id);
                if (!saved || saved.isRetracted || saved.mediaData?.listeningInvite?.roomId !== invitation.id) return;
                updateMessageMediaData(saved.id, { ...saved.mediaData, listeningInvite: { ...saved.mediaData.listeningInvite, coverUrl: track.coverUrl } });
                if (getListeningRoom()?.id === invitation.id) { room = { ...room!, song: { ...room!.song, coverUrl: track.coverUrl } }; emit(); }
                window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId } }));
            }).catch(() => { /* Keep the invitation usable when metadata lookup is unavailable. */ });
        }
        emit();
        window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId } }));
        return "";
    });
    return cleaned.replace(/\[一起听:([\w-]+):(接受|拒绝|退出)\]/g, (_, id: string, action: string) => {
        const current = getListeningRoom();
        if (!current || current.id !== id || current.sessionId !== sessionId) return "";
        assertIdentityActive();
        let notice = "";
        if (action === "退出") { room = null; notice = "对方结束了一起听。"; }
        else if (current.status === "invited" && current.initiator !== "character") {
            room = { ...current, status: action === "接受" ? "joined" : "declined", startedAt: Date.now() };
            notice = action === "接受" ? "对方加入了一起听。" : "对方拒绝了一起听邀请。";
        }
        if (notice) {
            pushChatMessage({ sessionId, role: "system", content: notice });
            window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId } }));
        }
        emit(); return "";
    }).trim();
}

export const CHARACTER_LISTENING_INVITE_PROTOCOL = "可因自己的兴趣或当前话题，自然用[音乐分享:准确歌名|歌手]分享歌曲，无需等待用户索要；音乐相关动作均为可选，不按轮次触发，避免重复推荐或牵强转向音乐。音乐分享只发送歌曲；一起听需要发起邀请并等待用户同意。判断用户在索要歌曲还是邀你共同聆听，再按人设与意愿决定。决定发起时，必须在本轮输出独立一行[一起听邀请:歌名|歌手]；未指定歌曲用[一起听邀请]。例如用户说‘你邀请我一起听’，若你愿意，就输出邀请标记并可附自然对白；仅说‘正式邀请你’或‘点进来’不会产生邀请。不要为同次邀请重复发音乐分享卡。用户未接受前不能宣称已共同聆听，也不能用接受标记替用户同意；已有待回应邀请不重复发。不愿意时自然拒绝，无需标记。";

const resolving = new Set<string>();
export async function respondToListeningInvitation(id: string, sessionId: string, accept: boolean): Promise<void> {
    assertIdentityActive();
    const current = getListeningRoom();
    if (!current || current.id !== id || current.sessionId !== sessionId || current.status !== "invited" || current.initiator !== "character") throw new Error("这份邀请已不在等待回应");
    if (resolving.has(id)) return;
    resolving.add(id);
    try {
        if (accept && current.song?.title) {
            const bridge = getMusicControlBridge();
            if (!bridge || bridge.getState().identityId !== current.identityId) throw new Error("音乐播放器尚未准备好，请重试");
            const state = bridge.getState();
            if (state.currentTrack?.title === current.song.title && (!current.song.artist || state.currentTrack.artist === current.song.artist)) bridge.resume();
            else {
                const result = await bridge.playByQuery(current.song.title, current.song.artist);
                if (!result.ok) throw new Error(result.message || "歌曲暂时无法播放，请重试");
            }
        }
        if (getListeningRoom()?.id !== id || current.identityId !== getCurrentIdentityId()) return;
        room = { ...current, status: accept ? "joined" : "declined", startedAt: Date.now() };
        const message = loadChatMessages(sessionId).find(item => item.id === current.invitationMessageId);
        if (message?.mediaData?.listeningInvite) updateMessageMediaData(message.id, { ...message.mediaData, listeningInvite: { ...message.mediaData.listeningInvite, response: accept ? "accepted" : "declined" } });
        pushChatMessage({ sessionId, role: "system", content: accept ? "用户已接受一起听邀请。" : "用户暂未接受一起听邀请。" });
        emit();
        window.dispatchEvent(new CustomEvent("chat-messages-updated", { detail: { sessionId } }));
        window.dispatchEvent(new CustomEvent(CHAT_REQUEST_REPLY_EVENT, { detail: { sessionId } }));
    } finally { resolving.delete(id); }
}
