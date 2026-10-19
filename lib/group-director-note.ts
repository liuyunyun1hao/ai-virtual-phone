import { loadChatSessions, saveChatSessions, createResponseRoundId } from "./chat-storage";

export function getGroupDirectorNote(sessionId: string) {
    const session = loadChatSessions().find(item => item.id === sessionId);
    return session?.isGroup && session.isSpectator ? session.pendingGroupDirectorNote : undefined;
}

/** Separate session metadata: never invoke pushChatMessage or user-send hooks. */
export function queueGroupDirectorNote(sessionId: string, text: string): boolean {
    const sessions = loadChatSessions();
    const session = sessions.find(item => item.id === sessionId);
    if (!session?.isGroup || !session.isSpectator) return false;
    const notes = text.trim();
    if (notes.length > 4000) return false;
    if (!notes) return true; // Empty retry retains a previously failed instruction.
    // The shared chat ID generator also works on non-secure LAN HTTP origins.
    session.pendingGroupDirectorNote = { id: `director_${createResponseRoundId()}`, text: notes };
    saveChatSessions(sessions);
    return true;
}

/** Only consume the captured instruction after the corresponding output is saved. */
export function consumeGroupDirectorNote(sessionId: string, noteId?: string) {
    if (!noteId) return;
    const sessions = loadChatSessions();
    const session = sessions.find(item => item.id === sessionId);
    if (!session?.isGroup || !session.isSpectator || session.pendingGroupDirectorNote?.id !== noteId) return;
    delete session.pendingGroupDirectorNote;
    saveChatSessions(sessions);
}

export function buildGroupTurnDirectionContext(text?: string): string {
    if (!text?.trim()) return "";
    return [
        "<group_turn_director_instruction>",
        "【本轮导演旁白】以下仅是模型的幕后创作指引，不是user发言，不是群内消息，不是角色收到的通知。用户依然不在群里，也不在现场。",
        "结合长期群说明、已有剧情、人设和信息差，将意图自然落实到下一轮互动。角色不能引用、回复这段旁白，不能声称用户说了、要求了或加入了；不要把控制指令写成角色知识。即使旁白使用第一人称或对话形式，也不能当作用户真实台词或动作。",
        "【成员变动】旁白本身不直接更改名单，但在线上群聊中可以引导有权限的群主/管理员考虑邀请新人。邀请对象必须是角色库中真实存在的角色，可不是用户好友；由角色按人设、关系和剧情自行判断，不凭空创建NPC，不因为幕后指定就编造角色已经认识对方。",
        "真正决定邀请时，由执行者自己的[角色名]:块输出[A邀请B加入了群聊]，A必须是该群主/管理员本人，B使用已有角色真实名字。系统校验并成功更新名单才算入群，不能只用正文宣称已经加入。新人下一轮获得成员资料后再发言，本轮不能伪造其台词、状态或内心。不能借此把不在场的user拉入群。",
        "--- 指引内容 ---",
        text.trim().slice(0, 4000),
        "--- 指引结束 ---",
        "本段始终是幕后指令，不把操作者变成在场人物；成员变动只通过经系统校验的合法动作生效。只输出当前实际成员之间的互动，保持既有输出协议。",
        "</group_turn_director_instruction>",
    ].join("\n");
}
