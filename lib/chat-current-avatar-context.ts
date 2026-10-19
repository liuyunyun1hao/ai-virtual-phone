import type { UserIdentity } from "@/components/settings/user-identity";
import { loadInteractableCharacters as loadCharacters } from "./character-storage";
import { loadChatSessions } from "./chat-storage";
import { getChatCharacterAvatar } from "./chat-session-avatar";
import { getCharacterWorldGroup } from "./character-world-storage";
import { kvGet, kvSet, registerDynamicPrefix } from "./kv-db";

const CURRENT_AVATAR_SNAPSHOT_PREFIX = "ai_phone_chat_current_avatar_snapshot_v1:";
registerDynamicPrefix(CURRENT_AVATAR_SNAPSHOT_PREFIX);

export type CurrentAvatarSubject = {
    id: string;
    name: string;
    kind: "user" | "character";
    avatarUrl: string | null;
    changed: boolean;
    scope: "conversation" | "related";
};

type StoredSnapshot = Record<string, string | null>;

function readSnapshot(key: string): StoredSnapshot {
    try {
        const parsed = JSON.parse(kvGet(key) || "{}");
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as StoredSnapshot : {};
    } catch {
        return {};
    }
}

function normalizeAvatar(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Current conversation participants plus explicitly related one-hop characters. */
export function buildCurrentAvatarSnapshot(params: {
    sessionId: string;
    viewerCharacterId?: string;
    participantIds?: string[];
    userIdentity?: UserIdentity | null;
}): CurrentAvatarSubject[] {
    const characters = loadCharacters();
    const session = loadChatSessions().find(item => item.id === params.sessionId);
    const byId = new Map(characters.map(character => [character.id, character]));
    const conversationIds = new Set((params.participantIds?.length
        ? params.participantIds
        : params.viewerCharacterId ? [params.viewerCharacterId] : []).filter(Boolean));
    const relatedIds: string[] = [];
    if (!params.participantIds?.length && params.viewerCharacterId) {
        const world = getCharacterWorldGroup(params.viewerCharacterId);
        if (world) {
            for (const relation of world.relations) {
                if (relation.fromCharacterId === params.viewerCharacterId) relatedIds.push(relation.toCharacterId);
                else if (relation.toCharacterId === params.viewerCharacterId) relatedIds.push(relation.fromCharacterId);
            }
        }
    }

    const drafts: Omit<CurrentAvatarSubject, "changed">[] = [];
    if (params.userIdentity) drafts.push({
        id: `user:${params.userIdentity.id}`,
        name: params.userIdentity.name || "用户",
        kind: "user",
        avatarUrl: normalizeAvatar(params.userIdentity.avatarUrl),
        scope: "conversation",
    });
    for (const id of conversationIds) {
        const character = byId.get(id);
        if (character) drafts.push({ id: `character:${id}`, name: character.name, kind: "character", avatarUrl: normalizeAvatar(getChatCharacterAvatar(session, character)), scope: "conversation" });
    }
    for (const id of [...new Set(relatedIds)].slice(0, 4)) {
        if (conversationIds.has(id)) continue;
        const character = byId.get(id);
        if (character) drafts.push({ id: `character:${id}`, name: character.name, kind: "character", avatarUrl: normalizeAvatar(getChatCharacterAvatar(session, character)), scope: "related" });
    }

    const key = CURRENT_AVATAR_SNAPSHOT_PREFIX + params.sessionId;
    const previous = readSnapshot(key);
    const next: StoredSnapshot = {};
    const subjects = drafts.map(subject => {
        next[subject.id] = subject.avatarUrl;
        return { ...subject, changed: Object.prototype.hasOwnProperty.call(previous, subject.id) && previous[subject.id] !== subject.avatarUrl };
    });
    kvSet(key, JSON.stringify(next));
    return subjects;
}

export function formatCurrentAvatarTruth(subjects: CurrentAvatarSubject[], visibleSubjectIds: Set<string> = new Set()): string {
    const rows = subjects.map(subject => {
        const state = subject.avatarUrl ? "当前使用自定义头像" : "当前没有自定义头像（显示默认头像）";
        const changed = subject.changed ? "；自上次本会话请求后已更换" : "";
        const visibility = subject.avatarUrl && visibleSubjectIds.has(subject.id) ? "；本条后附的是当前头像图片" : subject.avatarUrl ? "；本轮未提供视觉图片，不得猜测画面内容" : "";
        const relation = subject.scope === "related" ? "；与当前角色有明确关系" : "";
        return `${subject.name}：${state}${changed}${visibility}${relation}`;
    });
    return [
        "### 当前头像事实（以本节为准）",
        "这里是生成本轮回复时的 current 状态。聊天历史里的头像候选、旧描述和‘以前看到过’只能当历史，不能覆盖本节。知道某人换了头像，不等于看清新头像；只有紧随姓名附带的视觉图片才可描述。不要为了展示能力主动评论头像。",
        ...rows,
    ].join("\n");
}
