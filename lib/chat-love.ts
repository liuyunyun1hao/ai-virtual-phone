import type { ChatMessage } from "./chat-storage";
import { canUseEcho } from "./chat-echo";

type LoveMessage = Pick<ChatMessage, "content" | "mediaType" | "mediaData"> & Partial<Pick<ChatMessage, "role" | "isRetracted">>;

export function canUseLove(message: LoveMessage): boolean {
    return canUseEcho(message);
}

export function hasLove(message: LoveMessage): boolean {
    return message.mediaData?.screenEffect === "love" && canUseLove(message);
}

export function loveHistoryText(message: LoveMessage, body: string): string {
    return hasLove(message)
        ? `${body}\n[本条使用了 Love 爱心气球屏幕特效：一颗反光的心形气球从这条气泡中充气、轻摆并上浮。可能表达爱意、珍视，也可能是反话、戏谑或黑色幽默；须结合原文、角色关系和上下文理解，不自动代表真心赞美、固定关系或承诺。]`
        : body;
}

export function buildLovePrompt(): string {
    return `【文字消息：Love 爱心气球特效】
你和用户都可以使用 Love：一颗反光心形气球会从当前文字气泡中充气长大，轻轻摆动后向上浮走。
Love 可用于爱意、珍视、重逢、纪念、告白或温柔，也可利用甜蜜外观与文字的反差表达反话、戏谑、挖苦或黑色幽默，不必总是真诚示爱。
黑色幽默用法：被调侃、吐槽或拆台后，可以故作感动地夸对方“真会关心人”，配一个郑重的爱心，表达与字面相反的意思。是否这样回应取决于你的性格、关系与上下文；这只是用法说明，不是固定台词，更不是被吐槽就必须触发。
认真配合、玩笑反击或不用特效都由你自行判断，不强制温柔、恶搞或恋爱关系；不要为了展示功能而使用。
Love、回声与烟花合计每轮回复最多使用一条。如果最近几轮已经使用过任一种屏幕特效，本轮默认不用；不要因为用户用了特效就机械跟随。
决定使用时，在该条文字前紧贴输出 [Love]，例如：[Love]你回来就好，我真的很想你。
只作用于当前段的一条文字气泡，空行分开的下一条不继承。仅支持文字（可含手机原生 emoji）；不能给表情包、图片、语音、音乐、卡片、HTML 或动作指令加特效。
群聊时把 [Love] 放在你自己的 [角色名]: 发言段内，不替其他成员决定。不要口头说“发送了特效”却省略标记。`;
}
