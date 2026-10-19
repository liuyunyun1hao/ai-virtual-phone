import {
    loadChatSessions,
    pushChatMessage,
    saveChatSessions,
    type ChatMessage,
    type ChatSession,
} from "./chat-storage";

function cleanChatName(value: unknown): string {
    return Array.from(String(value || "").replace(/[\r\n\[\]]+/g, " ").replace(/\s+/g, " ").trim()).slice(0, 40).join("");
}

export function applyAssistantChatRenameAction(options: {
    sessionId: string;
    actorId?: string;
    actorName: string;
    actionData: ChatMessage["mediaData"];
    responseBatchId?: string;
    responseRoundId?: string;
    liveSession?: ChatSession;
}): { event: ChatMessage; session: ChatSession } | null {
    const sessions = loadChatSessions();
    const index = sessions.findIndex(session => session.id === options.sessionId);
    if (index < 0) return null;
    const current = sessions[index];
    const value = cleanChatName(options.actionData?.chatRenameValue);
    if (!value) return null;

    const wantsGroupName = options.actionData?.chatRenameKind === "group_name";
    if (wantsGroupName) {
        if (!current.isGroup || !options.actorId || !(current.participantIds || []).includes(options.actorId)) return null;
    } else if (current.isGroup || (options.actorId && options.actorId !== current.contactId)) {
        return null;
    }

    const updated: ChatSession = wantsGroupName
        ? { ...current, groupName: value, updatedAt: new Date().toISOString() }
        : { ...current, alias: value, updatedAt: new Date().toISOString() };
    sessions[index] = updated;
    saveChatSessions(sessions);
    if (options.liveSession?.id === updated.id) Object.assign(options.liveSession, updated);

    const content = wantsGroupName
        ? `${options.actorName}将群聊名称改为“${value}”`
        : `${options.actorName}将备注改为“${value}”`;
    const event = pushChatMessage({
        sessionId: options.sessionId,
        role: "assistant",
        content,
        mediaType: wantsGroupName ? "group_name_action" : "private_alias_action",
        responseBatchId: options.responseBatchId,
        responseRoundId: options.responseRoundId,
        senderCharacterId: options.actorId,
        senderName: options.actorName,
        mediaData: {
            chatRenameKind: wantsGroupName ? "group_name" : "private_alias",
            chatRenameValue: value,
            chatRenameActorId: options.actorId,
            chatRenameActorName: options.actorName,
        },
    });
    return { event, session: updated };
}
