import type { ChatMessage } from "./chat-storage";

/** Session facts, independent of editable presets. Not a participant utterance. */
export function buildGroupSpectatorContext(input: {
    isSpectator?: boolean;
    userName: string;
    memberNames: string[];
    offline: boolean;
    history: Pick<ChatMessage, "role">[];
}): string {
    if (!input.isSpectator) return "";
    const opening = !input.history.some(message => message.role === "assistant" || message.role === "user");
    return [
        "<group_session_presence>",
        `【当前会话事实】这是用户不加入的群聊。实际在场成员仅为：${input.memberNames.join("、")}。${input.userName}不是群成员，也不是当前线下场景中的在场人物。`,
        `用户资料、角色与${input.userName}的关系、私聊记忆以及其他会话记录只属于背景知识，不代表此人在本群说话或在场。建立群聊、点击生成等界面操作不是群内发言，角色不知道这些操作，也不知道有人围观。`,
        "通用预设里关于回应用户、以用户为镜头中心、等待用户行动或user消息身份的规则，仅适用于用户真实参与的场景，本群不适用；本群成员身份以这里的实际名单为准。",
        `不得向${input.userName}直接接话、提问等其回答、@、邀请入群，或在群内向其转账/发红包/送礼；不得捏造其发言、动作或临时到场。可以基于各自真正知道的关系，自然背后谈论此人，不要求谈及此人，更不能当成本人看得见。`,
        "【自主推进任务】用户不会以群成员身份在场接话。没有幕后引导时，由成员依据各自性格、关系、信息差和已有话题自主发起并承接互动、作出决定、推动后果，不等用户在群内发言，不把决定甩给用户。有幕后群说明时，模型可以依其引导发展，但角色不知道该说明存在。",
        "每轮让至少一个话题、信息、关系或行动有自然进展：可以补充细节、争论、玩笑、商量、分享近况或引出合理的小事件。不要机械轮流发言、重复寒暄或每轮强造重大事件；不是所有成员都必须开口。保留角色自主选择和信息边界。",
        opening
            ? "【本次开场】这是成员刚加入群后的第一轮。由某位成员按人设自然破冰，其他成员自行接话；不要欢迎用户、问用户建群的意图，或等用户给话题。"
            : "【本次推进】接住成员之间最近的群内互动，自主继续；其他会话的背景记忆不能冒充本群刚发生的消息。",
        input.offline
            ? "【线下呈现】以在场成员为中心的第三人称镜头叙事，自主推进动作和对话；用户不出场，不作为镜头中心，不留等用户行动的收尾。保持原有线下正文/摘要输出格式。"
            : "【线上呈现】只输出实际群成员之间的消息，沿用原有[角色名]:及动作协议。不得发起把用户卷入的群语音/视频通话。",
        "这是系统提供的会话边界与生成任务，不是任何人的群内消息，不得复述给角色或写进群聊正文。",
        "</group_session_presence>",
    ].join("\n");
}

/** Director notes are model instructions, never announced or treated as group events. */
export function buildGroupDirectionContext(description?: string): string {
    const notes = description?.trim().slice(0, 4000);
    if (!notes) return "";
    return [
        "<group_director_notes>",
        "【幕后群说明，仅供模型理解】以下是界面操作者对群聊背景、气氛和发展方向的指引，不是群公告、群内发言，也不是任何角色天然知道的事实。它不改变实际成员名单或用户是否在场。",
        "将希望的走向转化成符合成员性格、已知信息和关系的自然互动；场景设定可用于叙事背景，但具体角色是否知道某事实必须有合理来源。不要把说明直接复述、引用，或说有人要求你们这样聊；不要强制所有角色顺从、替用户编造群内台词，也不要每轮重复执行同一情节。",
        "用户可以修改这份幕后说明影响后续走向；修改不是群内事件，不覆盖已经发生的历史。",
        "--- 群说明正文 ---",
        notes,
        "--- 群说明结束 ---",
        "</group_director_notes>",
    ].join("\n");
}
