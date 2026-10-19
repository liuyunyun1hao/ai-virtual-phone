import type { ChatMessage } from './chat-storage';
import { canUseEcho } from './chat-echo';

export const canUseFireworks = canUseEcho;
export function hasFireworks(message: Parameters<typeof canUseEcho>[0]) {
    return message.mediaData?.screenEffect === 'fireworks' && canUseFireworks(message);
}
export function fireworksHistoryText(message: Pick<ChatMessage,'content'|'mediaType'|'mediaData'>,body:string) {
    return hasFireworks(message) ? `${body}\n[本条使用烟花全屏特效：火星升空，多色烟花错峰绽放，最后连续盛放并散成金色余烬。可能用于庆祝、浪漫、热情，也可能是反讽的庆祝、自嘲或黑色幽默；结合原文、发送者、上下文、背景和关系判断，不自动代表真心祝贺或固定承诺。]` : body;
}
export function buildFireworksPrompt(){
    return `【文字消息：烟花与全屏视觉】
你和用户都可发送烟花。在选定的一条文字前输出 [Fireworks]，如：[Fireworks]这一刻，想和你一起庆祝。
火星从屏幕底部升空，金色与红蓝紫烟花错峰绽放，最后连续盛放，余烬飘散。按你的性格、关系和语境自主决定，不要求用户先下指令，不机械跟随或为展示功能而刷屏。
烟花可用于庆祝、浪漫、热情、惊喜，也可用于反讽的“黑色庆祝”：把微不足道的进步、尴尬的结果或自己的小失败，故作隆重地当成盛事庆祝，利用盛大画面与真实处境的反差制造黑色幽默。这样的庆祝既可能带着亲昵，也可能是挖苦或自嘲，按角色与上下文决定，不预设一定善意。
这些是可选表达方法，不是任务或触发规则；不要照搬固定笑话，不要一遇到失误或进步就自动放烟花，也不要把带烟花的反话一律当成真心祝贺。
回声、Love 爱心、烟花三者合计每轮最多一条；近期已用过任一种，默认不连续使用。仅作用于该段的首个文字气泡，下一段不继承，不能给图片、语音、卡片、HTML或动作指令加特效。群聊放在你自己的 [角色名]: 发言段内。
这些是覆盖聊天页面的全屏效果，不是孤立的图标或气泡装饰。请结合本轮提供的当前背景视觉、消息、头像/按钮与合成快照理解整体构图和氛围；任何背景都可搭配，不限定星空、照片或其他主题。
提供的是关键帧而非实时录像；快照属于当时的页面，不能当成当前背景。未提供快照/视觉时只知道特效机制，不得虚构看见背景内容或颜色。是否评论画面由你自主决定，不必每次播报。`;
}
