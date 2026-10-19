import type { ChatMessage } from "./chat-storage";

type EchoMessage = Pick<ChatMessage, "content" | "mediaType" | "mediaData"> & Partial<Pick<ChatMessage, "role" | "isRetracted">>;

export function canUseEcho(message: EchoMessage): boolean {
    return !message.isRetracted && message.role !== "system"
        && (!message.mediaType || message.mediaType === "quote")
        && !!message.content.trim()
        && !/<(?:[a-z][\w-]*)(?:\s[^>]*|\s*\/?)>/i.test(message.content)
        && !/!\[[^\]]*\]\(/.test(message.content);
}

export function hasEcho(message: EchoMessage): boolean {
    return message.mediaData?.screenEffect === "echo" && canUseEcho(message);
}

export function echoHistoryText(message: EchoMessage, body: string): string {
    return hasEcho(message) ? `${body}\n[本条使用了回声屏幕特效：气泡大量复制环绕。可能用于强烈情绪、强调、搞怪、反话或黑色幽默；真实意图须结合原文、角色关系和上下文理解，不由特效固定判定。]` : body;
}

export function buildEchoPrompt(): string {
    return `【文字消息：回声特效】
你和用户都可以使用回声：文字气泡的大量实心副本从屏幕左侧成群涌入，立体环绕、少量近景放大，最后向屏幕四周散去消失，不回到原气泡。
默认使用普通文字，回声是偶尔使用的强烈表达，不是常规聊天样式；可用于想念、表白、兴奋、夸张强调，也可用于搞怪、反话、挖苦、自嘲或黑色幽默，并不限定为恋爱表达。
黑色幽默用法：让一句故作郑重的评价、讽刺的赞美或自嘲铺满屏幕，用夸张重复放大文字与真实处境的反差；例如一次小失误之后夸张地自评“这操作，真是天才”。这是表达方法而非固定台词或触发条件，不照搬例子，不见到失误就自动嘲讽。
由你按角色性格、关系和当前语境自主决定是否使用、是在认真表达还是开玩笑；不要求用户下指令，不强行制造暧昧，也不强制善意或恶搞。特效不替你决定立场，不要为了展示功能而出戏。
回声、Love 爱心和烟花合计每轮最多一条，其余句子普通发送。最近几轮用过任一种特效，本轮默认不用；不因用户使用就跟随，宁可不用也不要刷屏。
决定使用时，在该条文字前紧贴输出 [Echo]，例如：[Echo]好想现在就抱住你🥺。
只作用于当前段的一条文字气泡，空行分开的下一条不继承。仅支持文字（可含手机原生 emoji）；不能给表情包、图片、语音、音乐、卡片、HTML或动作指令加特效。
群聊时把 [Echo] 放在你自己的 [角色名]: 发言段内，不代替其他成员决定。不要口头说“发送了特效”却省略标记。`;
}
