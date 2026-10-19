import type { ChatMessage } from "./chat-storage";

/** Request-local instruction: never write retry feedback into persistent chat history. */
export function withRetryGuidance(history: ChatMessage[], sessionId: string, guidance: string): ChatMessage[] {
    const text = guidance.trim().slice(0, 2000);
    if (!text) return history;
    return [...history, { id: `retry-guidance-${Date.now()}`, sessionId, role: "system", mediaType: "system_instruction",
        status: "sent", createdAt: new Date().toISOString(), content: `本次重生成指导（只用于这一轮，不是角色收到的新聊天消息）：\n${text}\n请结合以上聊天上下文和角色设定重新生成。直接给出新的回复，不复述指导，不声称已执行未发生的动作。` }];
}
