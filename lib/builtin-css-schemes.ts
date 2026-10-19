/**
 * 内置 CSS 主题方案。
 *
 * 参考风格：iMessage 古早简约风（复古四色 + 暗黑模式）
 * 作用范围：chat_app —— 联系人列表 + 朋友圈 + 所有聊天室的默认样式
 *
 * 为什么做成内置方案而不是让用户粘贴：
 * 这套 CSS 有几百行，在手机上选中复制再粘贴到手写框里很容易出错。
 * 做成方案后，用户点一下「方案 → 载入」就套上了。
 *
 * ── 关于外观的几个设计决定 ──
 *
 * 1. 「手绘感」怎么来的：不是图片，是三件事叠出来的 ——
 *    不对称圆角（`22px 20px 24px 18px / 20px 24px 18px 22px`，横竖半径都不一样）、
 *    带墨色的细描边、以及偏移 1~2px 的硬阴影。三者合起来就像钢笔勾的框。
 *    没用 transform 旋转：气泡有 overflow:hidden 和测量逻辑，转一点点就可能被裁。
 *
 * 2. 顶栏的「光泽」：早期 iOS 那种塑料高光，用两层 linear-gradient 叠出来 ——
 *    上层是白色半透明从亮到透明的渐变（高光带），下层才是主色。
 *    比伪元素安全（.page-header 可能已经被别处用了 ::before/::after）。
 *
 * 3. 字体：引了 DotGothic16（Google Fonts 的像素风字体）。
 *    它的拉丁字母和数字是点阵的，中文会回落到系统字体 —— 正好，
 *    中文用点阵体会很难认。如果网络取不到这个字体，回落链也保证能用。
 *    @import 会被样式作用域器原样透传（css-scoper.ts 里专门放行了 @import）。
 *
 * 4. 暗黑模式用 prefers-color-scheme 跟随系统：这个应用本身没有暗色主题开关，
 *    跟随系统是唯一不需要改应用代码的做法。
 */

export type BuiltinCssScheme = {
    id: string;
    name: string;
    /** 说明，显示在方案列表里 */
    desc: string;
    target: string;
    css: string;
};

type Palette = {
    /** 页面渐变的三段色（浅→中→深） */
    bgA: string;
    bgB: string;
    bgC: string;
    /** 顶栏渐变 */
    barA: string;
    barB: string;
    /** 我方气泡渐变 */
    meA: string;
    meB: string;
    /** 对方气泡底色 */
    other: string;
    /** 墨色（描边用） */
    ink: string;
    /** 强调色 */
    accent: string;
    /** 纸感卡片底色 */
    card: string;
    /** 卡片描边 */
    line: string;
    /** 主要文字 */
    textTitle: string;
    /** 次要文字 */
    text: string;
};

const PALETTES: Record<string, Palette> = {
    mist: {
        bgA: "#EDE9F8", bgB: "#DFE6F8", bgC: "#F2ECF7",
        barA: "#AFC9EA", barB: "#7FA6D6",
        meA: "#8FB6E8", meB: "#6E9BD4",
        other: "#FBFAF5",
        ink: "#4A4C63", accent: "#5B7FC7",
        card: "#FFFFFF", line: "#D9DAE8",
        textTitle: "#2F3145", text: "#7B7E93",
    },
    sakura: {
        bgA: "#FBE9EE", bgB: "#F7E3EC", bgC: "#FDF2F1",
        barA: "#F3B9C9", barB: "#E894AC",
        meA: "#F0A8BE", meB: "#E285A2",
        other: "#FFFAF8",
        ink: "#6A4A55", accent: "#D9748F",
        card: "#FFFFFF", line: "#F0D8DE",
        textTitle: "#4A3038", text: "#96808A",
    },
    mint: {
        bgA: "#E4F2EC", bgB: "#DCEEF0", bgC: "#F0F6EE",
        barA: "#A8D8C8", barB: "#7FC0AC",
        meA: "#96CFBB", meB: "#75BAA2",
        other: "#FBFBF6",
        ink: "#415C54", accent: "#5FAE95",
        card: "#FFFFFF", line: "#D5E6DE",
        textTitle: "#2C423B", text: "#77938A",
    },
    cocoa: {
        bgA: "#F5EDE3", bgB: "#EFE6DE", bgC: "#FAF4EC",
        barA: "#D8C0A4", barB: "#C0A281",
        meA: "#CBAA86", meB: "#B08F6B",
        other: "#FFFCF7",
        ink: "#5C4736", accent: "#A5794F",
        card: "#FFFFFF", line: "#E8DACB",
        textTitle: "#463527", text: "#97836F",
    },
};

/** 把调色板灌进样式骨架 */
function skin(p: Palette): string {
    return `/* ═══ 复古简约 · iMessage 古早风 ═══ */
@import url("https://fonts.googleapis.com/css2?family=DotGothic16&display=swap");

/* ── 调色板 ── */
:root {
  --c-header-bg: ${p.barA};
  --c-page-body-bg: ${p.bgB};

  --c-bubble-self: ${p.meA};
  --c-bubble-other: ${p.other};

  --c-text-title: ${p.textTitle};
  --c-text: ${p.text};
  --c-icon: ${p.text};
  --c-icon-active: ${p.accent};

  --c-input: ${p.card};
  --c-input-border: ${p.line};
  --c-card: ${p.card};
  --c-card-border: ${p.line};

  /* 这套皮肤自己的变量 */
  --rt-ink: ${p.ink};
  --rt-ink-soft: ${p.ink}33;
  --rt-accent: ${p.accent};
  --rt-line: ${p.line};
  --rt-font: "DotGothic16", -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;

  --app-font-family: var(--rt-font);
}

/* ══ 1. 背景：珍珠渐变 ══
   斜向三段渐变打底，叠一层从左上打下来的白光，做出"珠光纸"的感觉。 */
.chat-app,
.chat-room-wrapper,
.chat-app .page-body {
  background:
    radial-gradient(130% 80% at 12% -10%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0) 58%),
    radial-gradient(90% 60% at 100% 100%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 60%),
    linear-gradient(165deg, ${p.bgA} 0%, ${p.bgB} 46%, ${p.bgC} 100%);
  background-attachment: fixed;
}

/* ══ 2. 顶栏：早期 iOS 的塑料光泽 ══
   上层是白色高光带（上亮下透），下层是主色渐变。 */
.page-header {
  background:
    linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.30) 42%, rgba(255,255,255,0.04) 56%, rgba(255,255,255,0) 100%),
    linear-gradient(180deg, ${p.barA} 0%, ${p.barB} 100%);
  border-bottom: 1.5px solid var(--rt-ink-soft);
  border-radius: 0 0 16px 16px;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.9),
    0 3px 12px -2px ${p.ink}30;
  backdrop-filter: none;
}

.page-title,
.page-back-btn,
.page-header-content button {
  color: #fff;
  text-shadow: 0 1px 0 ${p.ink}45;
  letter-spacing: 0.4px;
}

/* 顶栏里的小胶囊按钮（返回/Messages/Edit 那种） */
.page-header button.ui-btn,
.page-header .ui-chip {
  background: rgba(255,255,255,0.30);
  border: 1px solid rgba(255,255,255,0.55);
  border-radius: 12px;
  color: #fff;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
}

/* ══ 3. 气泡：手绘感 ══
   不对称圆角 + 墨色描边 + 1~2px 硬阴影。 */
.chat-bubble-role-assistant,
.chat-bubble-role-user,
.chat-stream-bubble {
  border: 1.5px solid var(--rt-ink);
  font-family: var(--rt-font);
  letter-spacing: 0.2px;
  backdrop-filter: none;
  box-shadow:
    1.5px 2px 0 -0.5px var(--rt-ink-soft),
    inset 0 1px 0 rgba(255,255,255,0.6);
}

.chat-bubble-role-assistant {
  background: ${p.other};
  color: ${p.textTitle};
  border-radius: 20px 22px 19px 23px / 22px 19px 23px 20px;
}

.chat-bubble-role-user {
  background: linear-gradient(170deg, ${p.meA} 0%, ${p.meB} 100%);
  color: #fff;
  border-radius: 22px 19px 23px 20px / 19px 23px 20px 22px;
  box-shadow:
    1.5px 2px 0 -0.5px ${p.ink}40,
    inset 0 1px 0 rgba(255,255,255,0.45);
}

/* 流式生成中的气泡跟着对方气泡走 */
.chat-stream-bubble {
  border-radius: 20px 22px 19px 23px / 22px 19px 23px 20px;
}

/* ══ 4. 头像：复古描边框 ══ */
.chat-msg-avatar,
.chat-contact-avatar,
.chat-contact-card-avatar {
  border: 1.5px solid var(--rt-ink);
  border-radius: 10px 11px 9px 12px;
  box-shadow: 1px 1.5px 0 -0.5px var(--rt-ink-soft);
  overflow: hidden;
  background: ${p.card};
}

/* 群里的发言人名字 */
.chat-group-sender-name,
.chat-contact-name {
  font-family: var(--rt-font);
  color: var(--rt-ink);
  letter-spacing: 0.3px;
}

/* ══ 5. 输入栏：纸面输入框 ══ */
.chat-input-bar {
  background: rgba(255,255,255,0.78);
  backdrop-filter: blur(14px) saturate(1.2);
  border-top: 1.5px solid var(--rt-ink-soft);
  border-radius: 18px 18px 0 0;
  box-shadow: 0 -2px 12px -4px ${p.ink}30;
}

.chat-input-bar textarea,
.chat-input-bar input {
  background: ${p.card};
  border: 1.5px solid var(--rt-line);
  border-radius: 16px;
  color: var(--c-text-title, ${p.textTitle});
  font-family: var(--rt-font);
}

.chat-input-bar textarea:focus,
.chat-input-bar input:focus {
  border-color: var(--rt-accent);
  box-shadow: 0 0 0 2px ${p.accent}26;
}

/* ══ 6. 标签栏：分段胶囊 ══ */
.chat-tab-bar {
  background: rgba(255,255,255,0.72);
  backdrop-filter: blur(18px) saturate(1.3);
  border-top: 1.5px solid var(--rt-ink-soft);
  border-radius: 20px 20px 0 0;
}

.chat-tab {
  color: var(--c-text, ${p.text});
  font-family: var(--rt-font);
  transition: color .18s ease, background .18s ease;
}

.chat-tab-active,
.chat-tab[data-active] {
  color: var(--rt-accent);
  background: rgba(255,255,255,0.85);
  border-radius: 14px;
  box-shadow: 1px 1.5px 0 -0.5px var(--rt-ink-soft);
}

/* 顶部分段控件（Solitude / Epiphany / Nyota / Trouvaille 那种） */
.chat-list-tab {
  background: rgba(255,255,255,0.55);
  border: 1.5px solid var(--rt-ink-soft);
  border-radius: 999px;
  color: var(--c-text, ${p.text});
  font-family: var(--rt-font);
}

.chat-list-tab[data-active],
.chat-list-tab.is-active {
  background: ${p.card};
  color: var(--rt-ink);
  box-shadow: 1px 1.5px 0 -0.5px var(--rt-ink-soft);
}

/* ══ 7. 卡片 / 列表：毛玻璃纸片 ══ */
.chat-contact-card,
.chat-app-card,
.chat-thought-card,
.chat-system-instruction-card,
.feed-post,
.feed-profile {
  background: rgba(255,255,255,0.82);
  backdrop-filter: blur(16px) saturate(1.15);
  border: 1.5px solid var(--rt-ink-soft);
  border-radius: 20px 21px 19px 22px;
  box-shadow: 1.5px 2px 0 -0.5px var(--rt-ink-soft);
}

/* 搜索框 */
.chat-search-bar,
.chat-search-input {
  background: rgba(255,255,255,0.72);
  border: 1.5px solid var(--rt-line);
  border-radius: 999px;
  font-family: var(--rt-font);
}

/* ══ 8. 语音条 ══ */
.voice-msg-bubble {
  background: linear-gradient(170deg, ${p.meA} 0%, ${p.meB} 100%);
  border: 1.5px solid var(--rt-ink);
  border-radius: 20px 22px 19px 23px;
  box-shadow: 1.5px 2px 0 -0.5px var(--rt-ink-soft);
}

.voice-msg-bar {
  background: rgba(255,255,255,0.92);
  border-radius: 2px;
}

.voice-msg-dur {
  color: rgba(255,255,255,0.95);
  font-family: var(--rt-font);
}

/* 时间分隔条 */
.chat-time-divider,
.chat-sys-msg {
  font-family: var(--rt-font);
  color: var(--rt-ink);
}

.chat-sys-msg > * {
  background: rgba(255,255,255,0.78);
  border: 1px solid var(--rt-ink-soft);
  border-radius: 999px;
}

/* ══ 9. 暗黑模式（跟随系统）══
   应用本身没有暗色开关，跟随系统是唯一不改代码就能做到的方式。 */
@media (prefers-color-scheme: dark) {
  :root {
    --c-text-title: #E8E6F0;
    --c-text: #9C9AAD;
    --c-icon: #9C9AAD;
    --c-icon-active: #A8BCE8;
    --c-input: #2A2B38;
    --c-input-border: #3D3F50;
    --c-card: #2A2B38;
    --c-card-border: #3D3F50;
    --c-bubble-other: #2E2F3E;
    --rt-ink: #8E90A8;
    --rt-ink-soft: #8E90A833;
    --rt-line: #3D3F50;
  }

  .chat-app,
  .chat-room-wrapper,
  .chat-app .page-body {
    background:
      radial-gradient(130% 80% at 12% -10%, rgba(120,130,190,0.22) 0%, rgba(0,0,0,0) 58%),
      linear-gradient(165deg, #1B1C26 0%, #202130 46%, #24202C 100%);
    background-attachment: fixed;
  }

  .page-header {
    background:
      linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.03) 48%, rgba(255,255,255,0) 100%),
      linear-gradient(180deg, #3A3F55 0%, #2C3145 100%);
    border-bottom-color: #ffffff1f;
  }

  .chat-bubble-role-assistant {
    background: #2E2F3E;
    color: #E8E6F0;
  }

  .chat-input-bar,
  .chat-tab-bar {
    background: rgba(30,31,42,0.82);
    border-top-color: #ffffff1a;
  }

  .chat-input-bar textarea,
  .chat-input-bar input {
    background: #2A2B38;
    color: #E8E6F0;
  }

  .chat-contact-card,
  .chat-app-card,
  .chat-thought-card,
  .chat-system-instruction-card,
  .feed-post,
  .feed-profile {
    background: rgba(42,43,56,0.85);
    color: #E8E6F0;
  }

  .chat-search-bar,
  .chat-search-input {
    background: rgba(42,43,56,0.85);
    color: #E8E6F0;
  }

  .chat-sys-msg > * {
    background: rgba(46,47,62,0.9);
  }
}
`;
}

export const BUILTIN_CHAT_APP_SCHEMES: BuiltinCssScheme[] = [
    { id: "rt-mist", name: "复古简约 · 雾紫", desc: "原版配色：淡紫到淡蓝的珠光底，蓝色光泽顶栏", target: "chat_app", css: skin(PALETTES.mist) },
    { id: "rt-sakura", name: "复古简约 · 樱粉", desc: "樱花粉调，暖一点", target: "chat_app", css: skin(PALETTES.sakura) },
    { id: "rt-mint", name: "复古简约 · 薄荷", desc: "青绿调，最清爽", target: "chat_app", css: skin(PALETTES.mint) },
    { id: "rt-cocoa", name: "复古简约 · 奶咖", desc: "奶油咖啡调，最暖", target: "chat_app", css: skin(PALETTES.cocoa) },
];

/** 按 target 取内置方案（其他 target 暂时没有内置的） */
export function getBuiltinSchemes(target: string): BuiltinCssScheme[] {
    return BUILTIN_CHAT_APP_SCHEMES.filter(s => s.target === target);
}
