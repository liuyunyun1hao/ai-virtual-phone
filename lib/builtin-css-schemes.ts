/**
 * 内置 CSS 主题方案。
 *
 * 风格：极简黑白（参考原生简约风）
 * 作用范围：chat_app —— 联系人列表 + 朋友圈 + 所有聊天室的默认样式
 *
 * 为什么做成内置方案而不是让用户粘贴一段 CSS：
 * 这套有 7KB 左右，在手机上选中复制再粘到手写框里很容易漏字符。
 * 做成方案后用户点一下「方案 → 载入」就套上了。
 *
 * ── 这套设计的六条规则 ──
 *
 * 1. 没有渐变。上一版翻车就翻在这 —— 珠光渐变 + 彩色顶栏 + 手绘描边
 *    叠在一起太吵。极简的做法是每屏只留一种「表面」：
 *    白底 + 浅灰卡片，靠层次而不是靠颜色区分。
 *
 * 2. 没有描边、没有阴影。卡片和气泡的边界全靠填充色的明度差表达。
 *    只在顶栏/输入栏这种需要切分的地方留一条 1px 的极淡分隔线。
 *
 * 3. 我方气泡也是浅灰底 + 黑字。默认主题里它是微信绿配白字；
 *    极简风里两侧都是灰调，只靠左右对齐区分。
 *
 * 4. 强调色是黑，不是绿也不是蓝。所以 --c-success（开关打开时的颜色）
 *    和 --c-action-blue 都要覆写成墨色，否则会漏出绿色的开关和蓝色按钮。
 *
 * 5. 分区标签做成大写 + 宽字距 + 极小字号（PROFILE / DISPLAY 那种）。
 *    这是这套视觉最容易被忽略、但最能出味道的地方。
 *
 * 6. 层级靠字重和字距做，不靠颜色：标题 600、正文常规、次级信息小字浅灰。
 *
 * 暗色模式跟随系统（应用本身没有暗色开关，prefers-color-scheme 是唯一
 * 不改应用代码的做法）。
 */

export type BuiltinCssScheme = {
    id: string;
    name: string;
    /** 说明，显示在方案列表里 */
    desc: string;
    target: string;
    css: string;
};

type Mono = {
    pageBg: string;
    headerBg: string;
    cardBg: string;
    fieldBg: string;
    bubbleSelf: string;
    bubbleOther: string;
    ink: string;
    inkDim: string;
    inkFaint: string;
    hairline: string;
};

const MONO: Record<string, Mono> = {
    plain: {
        pageBg: "#FFFFFF", headerBg: "#FFFFFF", cardBg: "#F5F5F7", fieldBg: "#F2F2F5",
        bubbleSelf: "#E8E8EC", bubbleOther: "#F6F6F8",
        ink: "#111114", inkDim: "#8A8A91", inkFaint: "#B4B4BB", hairline: "#EDEDF0",
    },
    warm: {
        pageBg: "#FBFAF8", headerBg: "#FBFAF8", cardBg: "#F4F2EE", fieldBg: "#F1EFEB",
        bubbleSelf: "#E7E4DE", bubbleOther: "#F5F3F0",
        ink: "#1A1816", inkDim: "#8C8880", inkFaint: "#B6B1A8", hairline: "#ECE9E4",
    },
    cool: {
        pageBg: "#FBFCFD", headerBg: "#FBFCFD", cardBg: "#F1F3F6", fieldBg: "#EEF1F5",
        bubbleSelf: "#E4E8EE", bubbleOther: "#F3F5F8",
        ink: "#12151A", inkDim: "#848B96", inkFaint: "#AEB5BF", hairline: "#E9ECF1",
    },
    paper: {
        pageBg: "#FAFAF9", headerBg: "#FAFAF9", cardBg: "#F2F2F0", fieldBg: "#EFEFEC",
        bubbleSelf: "#E6E6E2", bubbleOther: "#F4F4F1",
        ink: "#17171A", inkDim: "#88888C", inkFaint: "#B2B2B5", hairline: "#EAEAE7",
    },
};

/** 把配色灌进样式骨架 */
function skin(p: Mono): string {
    return `/* ═══ 极简黑白 ═══ */
/* 白底、浅灰卡片、黑色强调、无描边无阴影无渐变。 */

:root {
  --c-header-bg: ${p.headerBg};
  --c-page-body-bg: ${p.pageBg};

  --c-card: ${p.cardBg};
  --c-card-border: transparent;
  --c-panel: ${p.headerBg};
  --c-panel-border: transparent;

  --c-text-title: ${p.ink};
  --c-text: ${p.inkDim};
  --c-icon: ${p.inkFaint};
  --c-icon-active: ${p.ink};

  --c-input: ${p.fieldBg};
  --c-input-border: transparent;

  /* 我方气泡也是浅灰底 —— 极简风靠左右对齐区分，不靠颜色 */
  --c-bubble-self: ${p.bubbleSelf};
  --c-bubble-other: ${p.bubbleOther};

  /* 强调色一律压成墨色。不覆写的话开关会是绿的、按钮会是蓝的，
     跟这套黑白完全不搭。 */
  --c-success: ${p.ink};
  --c-action-blue: ${p.ink};
  --c-warning: ${p.inkDim};

  --mn-ink: ${p.ink};
  --mn-dim: ${p.inkDim};
  --mn-faint: ${p.inkFaint};
  --mn-card: ${p.cardBg};
  --mn-field: ${p.fieldBg};
  --mn-hair: ${p.hairline};
}

/* ══ 1. 背景：纯色，不要渐变 ══ */
.chat-app,
.chat-room-wrapper,
.chat-app .page-body {
  background: ${p.pageBg};
  background-image: none;
}

/* ══ 2. 顶栏：白底黑字 + 一条发丝线 ══
   参考里顶栏跟页面同色，只靠一条极淡的线切开。 */
.page-header {
  background: ${p.headerBg};
  background-image: none;
  backdrop-filter: none;
  border-bottom: 1px solid ${p.hairline};
  border-radius: 0;
  box-shadow: none;
}

.page-title,
.page-back-btn,
.page-header-content button {
  color: ${p.ink};
  text-shadow: none;
}

/* 参考里页面标题是宽字距的（"CONTACT PROFILE" / "CHAT SETTINGS"）。
   中文不受 text-transform 影响，但会吃到字距，看起来也更松弛。 */
.page-title {
  font-weight: 600;
  letter-spacing: 1px;
}

/* ══ 3. 气泡：浅灰填充，无描边无阴影 ══ */
.chat-bubble-role-assistant,
.chat-bubble-role-user,
.chat-stream-bubble {
  border: none;
  box-shadow: none;
  border-radius: 18px;
}

.chat-bubble-role-assistant {
  background: ${p.bubbleOther};
  color: ${p.ink};
}

/* 注意是黑字 —— 默认主题里我方气泡是绿底白字，这里背景浅了，字必须压深 */
.chat-bubble-role-user {
  background: ${p.bubbleSelf};
  color: ${p.ink};
}

/* ══ 4. 头像：圆形，无描边 ══ */
.chat-msg-avatar,
.chat-contact-avatar,
.chat-contact-card-avatar {
  border: none;
  border-radius: 50%;
  box-shadow: none;
}

.chat-group-sender-name,
.chat-contact-name {
  color: ${p.ink};
  font-weight: 500;
}

/* ══ 5. 输入栏 ══ */
.chat-input-bar {
  background: ${p.headerBg};
  backdrop-filter: none;
  border-top: 1px solid ${p.hairline};
  border-radius: 0;
  box-shadow: none;
}

.chat-input-bar textarea,
.chat-input-bar input {
  background: ${p.fieldBg};
  border: none;
  border-radius: 18px;
  color: ${p.ink};
}

.chat-input-bar textarea:focus,
.chat-input-bar input:focus {
  border: none;
  box-shadow: none;
  outline: none;
}

/* ══ 6. 标签栏 / 分段控件 ══ */
.chat-tab-bar {
  background: ${p.headerBg};
  backdrop-filter: none;
  border-top: 1px solid ${p.hairline};
  border-radius: 0;
}

.chat-tab {
  color: ${p.inkFaint};
}

.chat-tab-active,
.chat-tab[data-active] {
  background: transparent;
  color: ${p.ink};
  border-radius: 0;
  box-shadow: none;
}

/* 顶部分段胶囊（Chats / Group / Friends 那种）：容器浅灰，选中项浮白 */
.chat-list-tab {
  background: ${p.fieldBg};
  border: none;
  border-radius: 999px;
  color: ${p.inkDim};
}

.chat-list-tab[data-active],
.chat-list-tab.is-active {
  background: ${p.headerBg};
  color: ${p.ink};
  box-shadow: 0 1px 3px rgba(0,0,0,0.07);
}

/* ══ 7. 卡片：浅灰填充，无描边无阴影 ══ */
.chat-contact-card,
.chat-app-card,
.chat-thought-card,
.chat-system-instruction-card,
.feed-post,
.feed-profile {
  background: ${p.cardBg};
  border: none;
  box-shadow: none;
  border-radius: 20px;
}

/* ══ 8. 开关：黑色，不是绿色 ══ */
.ui-toggle {
  background: ${p.fieldBg};
}

.ui-toggle[data-checked] {
  background: ${p.ink};
}

.ui-toggle-knob {
  box-shadow: 0 1px 2px rgba(0,0,0,0.14);
}

/* ══ 9. 按钮 ══ */
.ui-btn-primary,
.ui-btn-action,
.ui-btn-success {
  background: ${p.ink};
  color: ${p.headerBg};
  border: none;
  border-radius: 999px;
  box-shadow: none;
}

.ui-btn-outline,
.ui-btn-ghost,
.ui-btn-soft-action,
.ui-btn-bordered-ghost {
  background: ${p.fieldBg};
  color: ${p.ink};
  border: none;
  border-radius: 999px;
  box-shadow: none;
}

/* ══ 10. 分区标签：大写 + 宽字距 + 极小字号 ══
   参考里 PROFILE / DISPLAY / AVATAR SIZE 那种。这是这套视觉最出味道的地方，
   也最容易被忽略 —— 不加这一条，整体会显得普通。 */
.chat-app-card-section-title,
.menu-desc {
  text-transform: uppercase;
  letter-spacing: 1.2px;
  font-size: calc(10.5px * var(--app-text-scale, 1));
  color: ${p.inkFaint};
  font-weight: 500;
}

/* ══ 11. 搜索框 ══ */
.chat-search-bar,
.chat-search-input {
  background: ${p.fieldBg};
  border: none;
  border-radius: 999px;
  color: ${p.ink};
}

/* ══ 12. 语音条：波形和时长用墨色 ══ */
.voice-msg-bubble {
  background: ${p.bubbleSelf};
  border: none;
  box-shadow: none;
  border-radius: 18px;
}

.voice-msg-bar {
  background: ${p.ink};
  border-radius: 2px;
}

.voice-msg-dur {
  color: ${p.inkDim};
}

/* 时间分隔 / 系统消息：不要胶囊底色 */
.chat-sys-msg > * {
  background: transparent;
  border: none;
  color: ${p.inkFaint};
}

/* ══ 13. 暗黑模式（跟随系统）══ */
@media (prefers-color-scheme: dark) {
  :root {
    --c-header-bg: #0E0E10;
    --c-page-body-bg: #0E0E10;
    --c-card: #1C1C1F;
    --c-panel: #0E0E10;
    --c-text-title: #F2F2F4;
    --c-text: #8E8E95;
    --c-icon: #6E6E75;
    --c-icon-active: #F2F2F4;
    --c-input: #1C1C1F;
    --c-bubble-self: #2C2C31;
    --c-bubble-other: #1C1C1F;
    --c-success: #F2F2F4;
    --c-action-blue: #F2F2F4;
    --mn-ink: #F2F2F4;
    --mn-dim: #8E8E95;
    --mn-faint: #6E6E75;
    --mn-card: #1C1C1F;
    --mn-field: #1C1C1F;
    --mn-hair: #26262A;
  }

  .chat-app,
  .chat-room-wrapper,
  .chat-app .page-body {
    background: #0E0E10;
    background-image: none;
  }

  .page-header,
  .chat-input-bar,
  .chat-tab-bar {
    background: #0E0E10;
    border-color: #26262A;
  }

  .chat-bubble-role-assistant {
    background: #1C1C1F;
    color: #F2F2F4;
  }

  .chat-bubble-role-user {
    background: #2C2C31;
    color: #F2F2F4;
  }

  .chat-input-bar textarea,
  .chat-input-bar input,
  .chat-search-bar,
  .chat-search-input,
  .chat-list-tab {
    background: #1C1C1F;
    color: #F2F2F4;
  }

  .chat-contact-card,
  .chat-app-card,
  .chat-thought-card,
  .chat-system-instruction-card,
  .feed-post,
  .feed-profile {
    background: #1C1C1F;
    color: #F2F2F4;
  }

  .ui-btn-primary,
  .ui-btn-action,
  .ui-btn-success {
    background: #F2F2F4;
    color: #0E0E10;
  }

  .ui-btn-outline,
  .ui-btn-ghost,
  .ui-btn-soft-action {
    background: #1C1C1F;
    color: #F2F2F4;
  }

  .voice-msg-bar {
    background: #F2F2F4;
  }
}
`;
}

export const BUILTIN_CHAT_APP_SCHEMES: BuiltinCssScheme[] = [
    { id: "mn-plain", name: "极简 · 纯白", desc: "参考图那套：纯白底 + 浅灰卡片 + 黑色强调", target: "chat_app", css: skin(MONO.plain) },
    { id: "mn-warm", name: "极简 · 暖白", desc: "偏暖的米白，长时间看眼睛舒服一点", target: "chat_app", css: skin(MONO.warm) },
    { id: "mn-cool", name: "极简 · 冷灰", desc: "偏冷的灰白，更数码感", target: "chat_app", css: skin(MONO.cool) },
    { id: "mn-paper", name: "极简 · 纸白", desc: "微灰纸面，对比最柔和", target: "chat_app", css: skin(MONO.paper) },
];

/** 按 target 取内置方案（其他 target 暂时没有内置的） */
export function getBuiltinSchemes(target: string): BuiltinCssScheme[] {
    return BUILTIN_CHAT_APP_SCHEMES.filter(s => s.target === target);
}
