/**
 * 内置 CSS 主题方案。
 *
 * 风格：极简黑白（参考原生简约风）
 * 作用范围：chat_app —— 联系人列表 + 朋友圈 + 所有聊天室的默认样式
 *
 * ── 上一版为什么还不够 ──
 *
 * 第一版我把「极简」做成了「没颜色」，但参考图里其实有三样东西在撑：
 *
 *   1. 极淡的纸纹底（几乎看不见的点阵），不是纯白 —— 纯白显得空、像没加载完
 *   2. 气泡有小圆角和极淡投影 —— 全靠明度差会显得"贴平"，没有层次
 *   3. 顶栏/底栏是实心白，不是毛玻璃 —— 原样式是 color-mix 55% + blur，
 *      会把背后的壁纸（蓝色）透上来，看起来像"没盖上"
 *
 * 所以这一版用 !important 强制覆盖关键表面。用户主题的作用就是压过默认样式，
 * 靠选择器权重去赌顺序不可靠 —— 应用里同名选择器很多。
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
    /** 纸纹点阵的颜色 */
    dot: string;
};

const MONO: Record<string, Mono> = {
    plain: {
        pageBg: "#FFFFFF", headerBg: "#FFFFFF", cardBg: "#F4F4F6", fieldBg: "#F4F4F6",
        bubbleSelf: "#EAE8E4", bubbleOther: "#FFFFFF",
        ink: "#111114", inkDim: "#8E8E93", inkFaint: "#B8B8BE", hairline: "#ECECEF",
        dot: "rgba(0,0,0,0.028)",
    },
    warm: {
        pageBg: "#FBFAF8", headerBg: "#FBFAF8", cardBg: "#F4F1EC", fieldBg: "#F4F1EC",
        bubbleSelf: "#E9E4DC", bubbleOther: "#FFFFFF",
        ink: "#1A1816", inkDim: "#928C83", inkFaint: "#BBB5AB", hairline: "#EDE9E3",
        dot: "rgba(80,60,30,0.035)",
    },
    cool: {
        pageBg: "#FBFCFD", headerBg: "#FBFCFD", cardBg: "#F1F3F6", fieldBg: "#F1F3F6",
        bubbleSelf: "#E6EAEF", bubbleOther: "#FFFFFF",
        ink: "#12151A", inkDim: "#878E99", inkFaint: "#B2B8C2", hairline: "#E9ECF1",
        dot: "rgba(20,40,80,0.030)",
    },
    paper: {
        pageBg: "#FAFAF9", headerBg: "#FAFAF9", cardBg: "#F2F2F0", fieldBg: "#F2F2F0",
        bubbleSelf: "#E8E8E4", bubbleOther: "#FFFFFF",
        ink: "#17171A", inkDim: "#8B8B8F", inkFaint: "#B5B5B8", hairline: "#EAEAE7",
        dot: "rgba(0,0,0,0.032)",
    },
};

function skin(p: Mono): string {
    return `/* ═══ 极简黑白 ═══ */

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

  /* 我方是浅暖灰，对方是纯白 —— 参考图里靠这点明度差区分，不是靠颜色 */
  --c-bubble-self: ${p.bubbleSelf};
  --c-bubble-other: ${p.bubbleOther};

  /* 强调色压成墨色。不覆写的话开关会漏绿、按钮会漏蓝。 */
  --c-success: ${p.ink};
  --c-action-blue: ${p.ink};
  --c-warning: ${p.inkDim};

  --mn-ink: ${p.ink};
  --mn-dim: ${p.inkDim};
  --mn-faint: ${p.inkFaint};
  --mn-card: ${p.cardBg};
  --mn-field: ${p.fieldBg};
  --mn-hair: ${p.hairline};
  --mn-dot: ${p.dot};
}

/* ══ 1. 底：纯色 + 极淡纸纹点阵 ══
   纯白会显得空、像没加载完。加一层几乎看不见的点阵就有"纸"的感觉。 */
.chat-app,
.chat-app .page-body,
.chat-room-wrapper {
  background-color: ${p.pageBg} !important;
  background-image: radial-gradient(circle, var(--mn-dot) 1px, transparent 1px) !important;
  background-size: 20px 20px !important;
  backdrop-filter: none !important;
}

/* ══ 2. 顶栏：实心白 + 一条发丝线 ══
   原样式是 color-mix 55% + blur 20px，会把背后壁纸（蓝色）透上来，
   看起来像"顶部没盖住"。这里强制实心。 */
.page-header,
[data-ui="header"] {
  background: ${p.headerBg} !important;
  background-image: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border-bottom: 1px solid ${p.hairline} !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}

/* 状态栏后面那条也要实心，否则会漏出壁纸色 */
.page-header-safe-area {
  background: ${p.headerBg} !important;
}

.page-title,
.page-back-btn,
.page-header-content button {
  color: ${p.ink} !important;
  text-shadow: none !important;
}

/* 参考图里标题是常规字重、微微字距，不是加粗居中大字 */
.page-title {
  font-weight: 500 !important;
  letter-spacing: 0.4px !important;
  font-size: calc(16px * var(--app-text-scale, 1)) !important;
}

/* 顶栏里那个"上下文 2%"胶囊：改成透明底、细字 */
.page-header .ui-chip,
.page-header .chat-context-chip {
  background: transparent !important;
  border: 1px solid ${p.hairline} !important;
  color: ${p.inkDim} !important;
  box-shadow: none !important;
}

/* ══ 3. 气泡：小圆角 + 极淡投影 ══
   全靠明度差会显得"贴平"。参考图的气泡有很轻的投影，这就是层次感的来源。 */
.chat-bubble-role-assistant,
.chat-bubble-role-user,
.chat-stream-bubble {
  border: none !important;
  border-radius: 16px !important;
  padding: 9px 13px !important;
}

.chat-bubble-role-assistant {
  background: ${p.bubbleOther} !important;
  color: ${p.ink} !important;
  box-shadow: 0 1px 2px rgba(0,0,0,0.055), 0 0 0 0.5px rgba(0,0,0,0.035) !important;
}

.chat-bubble-role-user {
  background: ${p.bubbleSelf} !important;
  color: ${p.ink} !important;
  box-shadow: 0 1px 2px rgba(0,0,0,0.045) !important;
}

/* ══ 4. 头像：圆形无描边 ══ */
.chat-msg-avatar,
.chat-contact-avatar,
.chat-contact-card-avatar {
  border: none !important;
  border-radius: 50% !important;
  box-shadow: none !important;
}

.chat-group-sender-name,
.chat-contact-name {
  color: ${p.ink} !important;
  font-weight: 500 !important;
}

/* ══ 5. 底栏：实心白，胶囊输入框 ══
   参考图里底栏没有毛玻璃，输入框是个带细边的大圆角胶囊。 */
.chat-input-bar {
  background: ${p.headerBg} !important;
  background-image: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border-top: 1px solid ${p.hairline} !important;
  box-shadow: none !important;
}

.chat-input-bar .chat-input-textarea {
  background: ${p.headerBg} !important;
  border: 1px solid ${p.hairline} !important;
  border-radius: 22px !important;
  box-shadow: 0 1px 2px rgba(0,0,0,0.03) !important;
  color: ${p.ink} !important;
}

.chat-input-bar .chat-input-textarea:focus {
  border-color: ${p.inkFaint} !important;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06) !important;
  outline: none !important;
}

/* 底栏图标：灰，按下变墨 */
.chat-input-actions button,
.chat-input-bar button {
  color: ${p.inkDim} !important;
}

.chat-input-actions button:active,
.chat-input-bar button:active {
  color: ${p.ink} !important;
}

/* 发送按钮：墨色圆底 */
.chat-input-actions button[data-send],
.chat-input-bar .chat-send-btn {
  background: ${p.ink} !important;
  color: ${p.headerBg} !important;
  border-radius: 50% !important;
}

/* ══ 6. 标签栏 / 分段控件 ══ */
.chat-tab-bar {
  background: ${p.headerBg} !important;
  backdrop-filter: none !important;
  border-top: 1px solid ${p.hairline} !important;
  border-radius: 0 !important;
}

.chat-tab {
  color: ${p.inkFaint} !important;
}

.chat-tab-active,
.chat-tab[data-active] {
  background: transparent !important;
  color: ${p.ink} !important;
  box-shadow: none !important;
}

.chat-list-tab {
  background: ${p.fieldBg} !important;
  border: none !important;
  border-radius: 999px !important;
  color: ${p.inkDim} !important;
}

.chat-list-tab[data-active],
.chat-list-tab.is-active {
  background: ${p.headerBg} !important;
  color: ${p.ink} !important;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08) !important;
}

/* ══ 7. 卡片：浅灰填充，无描边 ══ */
.chat-contact-card,
.chat-app-card,
.chat-thought-card,
.chat-system-instruction-card,
.feed-post,
.feed-profile {
  background: ${p.cardBg} !important;
  border: none !important;
  box-shadow: none !important;
  border-radius: 18px !important;
}

/* ══ 8. 开关：黑色，不是绿色 ══ */
.ui-toggle {
  background: ${p.fieldBg} !important;
}

.ui-toggle[data-checked] {
  background: ${p.ink} !important;
}

.ui-toggle-knob {
  box-shadow: 0 1px 2px rgba(0,0,0,0.16) !important;
}

/* ══ 9. 按钮 ══ */
.ui-btn-primary,
.ui-btn-action,
.ui-btn-success {
  background: ${p.ink} !important;
  color: ${p.headerBg} !important;
  border: none !important;
  border-radius: 999px !important;
  box-shadow: none !important;
}

.ui-btn-outline,
.ui-btn-ghost,
.ui-btn-soft-action,
.ui-btn-bordered-ghost {
  background: ${p.fieldBg} !important;
  color: ${p.ink} !important;
  border: none !important;
  border-radius: 999px !important;
  box-shadow: none !important;
}

/* ══ 10. 分区标签：大写 + 宽字距 + 极小字号 ══
   参考图里 PROFILE / DISPLAY / AVATAR SIZE 那种。这是最出味道的一笔。 */
.chat-app-card-section-title,
.menu-desc {
  text-transform: uppercase;
  letter-spacing: 1.2px;
  font-size: calc(10.5px * var(--app-text-scale, 1)) !important;
  color: ${p.inkFaint} !important;
  font-weight: 500 !important;
}

/* ══ 11. 搜索框 ══ */
.chat-search-bar,
.chat-search-input {
  background: ${p.fieldBg} !important;
  border: none !important;
  border-radius: 999px !important;
  color: ${p.ink} !important;
}

/* ══ 12. 语音条 ══ */
.voice-msg-bubble {
  background: ${p.bubbleSelf} !important;
  border: none !important;
  box-shadow: 0 1px 2px rgba(0,0,0,0.045) !important;
  border-radius: 16px !important;
}

.voice-msg-bar {
  background: ${p.ink} !important;
  border-radius: 2px !important;
}

.voice-msg-dur {
  color: ${p.inkDim} !important;
}

/* 时间分隔 / 系统消息：去掉胶囊底色，只留浅灰小字 */
.chat-sys-msg > * {
  background: transparent !important;
  border: none !important;
  color: ${p.inkFaint} !important;
}

/* ══ 13. 暗黑模式（跟随系统）══ */
@media (prefers-color-scheme: dark) {
  :root {
    --c-header-bg: #0C0C0E;
    --c-page-body-bg: #0C0C0E;
    --c-card: #1B1B1E;
    --c-panel: #0C0C0E;
    --c-text-title: #F4F4F6;
    --c-text: #8E8E95;
    --c-icon: #6E6E75;
    --c-icon-active: #F4F4F6;
    --c-input: #1B1B1E;
    --c-bubble-self: #33333A;
    --c-bubble-other: #1B1B1E;
    --c-success: #F4F4F6;
    --c-action-blue: #F4F4F6;
    --mn-ink: #F4F4F6;
    --mn-dim: #8E8E95;
    --mn-faint: #6E6E75;
    --mn-card: #1B1B1E;
    --mn-field: #1B1B1E;
    --mn-hair: #242428;
    --mn-dot: rgba(255,255,255,0.030);
  }

  .chat-app,
  .chat-app .page-body,
  .chat-room-wrapper {
    background-color: #0C0C0E !important;
  }

  .page-header,
  [data-ui="header"],
  .page-header-safe-area,
  .chat-input-bar,
  .chat-tab-bar {
    background: #0C0C0E !important;
    background-image: none !important;
    border-color: #242428 !important;
  }

  .chat-bubble-role-assistant {
    background: #1B1B1E !important;
    color: #F4F4F6 !important;
    box-shadow: 0 1px 2px rgba(0,0,0,0.4) !important;
  }

  .chat-bubble-role-user {
    background: #33333A !important;
    color: #F4F4F6 !important;
    box-shadow: 0 1px 2px rgba(0,0,0,0.35) !important;
  }

  .chat-input-bar .chat-input-textarea,
  .chat-search-bar,
  .chat-search-input,
  .chat-list-tab {
    background: #1B1B1E !important;
    color: #F4F4F6 !important;
    border-color: #242428 !important;
  }

  .chat-contact-card,
  .chat-app-card,
  .chat-thought-card,
  .chat-system-instruction-card,
  .feed-post,
  .feed-profile,
  .voice-msg-bubble {
    background: #1B1B1E !important;
    color: #F4F4F6 !important;
  }

  .ui-btn-primary,
  .ui-btn-action,
  .ui-btn-success {
    background: #F4F4F6 !important;
    color: #0C0C0E !important;
  }

  .ui-btn-outline,
  .ui-btn-ghost,
  .ui-btn-soft-action {
    background: #1B1B1E !important;
    color: #F4F4F6 !important;
  }

  .voice-msg-bar {
    background: #F4F4F6 !important;
  }
}
`;
}

export const BUILTIN_CHAT_APP_SCHEMES: BuiltinCssScheme[] = [
    { id: "mn-plain", name: "极简 · 纯白", desc: "参考图那套：白底纸纹 + 浅灰卡片 + 黑色强调", target: "chat_app", css: skin(MONO.plain) },
    { id: "mn-warm", name: "极简 · 暖白", desc: "偏暖米白，久看舒服", target: "chat_app", css: skin(MONO.warm) },
    { id: "mn-cool", name: "极简 · 冷灰", desc: "偏冷灰白，更数码感", target: "chat_app", css: skin(MONO.cool) },
    { id: "mn-paper", name: "极简 · 纸白", desc: "微灰纸面，对比最柔和", target: "chat_app", css: skin(MONO.paper) },
];

/** 按 target 取内置方案（其他 target 暂时没有内置的） */
export function getBuiltinSchemes(target: string): BuiltinCssScheme[] {
    return BUILTIN_CHAT_APP_SCHEMES.filter(s => s.target === target);
}
