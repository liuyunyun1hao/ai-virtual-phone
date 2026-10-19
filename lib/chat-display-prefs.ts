"use client";

/**
 * 聊天显示偏好（localStorage + 事件通知）。
 *
 * 为什么不用 settings 那套存储：这个开关只影响渲染，不需要参与
 * 配置导入导出，也不需要跟角色绑定。用 localStorage + 事件最轻，
 * 而且聊天列表里几十个气泡能通过一次事件统一重渲染。
 */

import { useSyncExternalStore } from "react";

const HIDE_TAGS_KEY = "ai_phone_hide_audio_tags_v1";

/** 开关变化时广播，气泡列表据此重渲染 */
export const CHAT_DISPLAY_PREFS_EVENT = "chat-display-prefs-changed";

/**
 * 是否在聊天框里隐藏方括号语气标签。
 * 默认开 —— 角色被提示词教着输出 [whispers] 之后，气泡里露出来很难看。
 * 想要看到原始文本（比如调试提示词）就关掉。
 */
const DEFAULT_HIDE_AUDIO_TAGS = true;

export function getHideAudioTags(): boolean {
    if (typeof window === "undefined") return DEFAULT_HIDE_AUDIO_TAGS;
    try {
        const raw = window.localStorage.getItem(HIDE_TAGS_KEY);
        if (raw == null) return DEFAULT_HIDE_AUDIO_TAGS;
        return raw === "1";
    } catch {
        return DEFAULT_HIDE_AUDIO_TAGS;
    }
}

export function setHideAudioTags(on: boolean): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(HIDE_TAGS_KEY, on ? "1" : "0");
        window.dispatchEvent(new CustomEvent(CHAT_DISPLAY_PREFS_EVENT, { detail: { hideAudioTags: on } }));
    } catch {
        /* localStorage 不可用就算了，下次渲染还是老值 */
    }
}

/** 订阅开关变化，返回取消订阅函数 */
export function onChatDisplayPrefsChange(cb: (hideAudioTags: boolean) => void): () => void {
    if (typeof window === "undefined") return () => {};
    const handler = (e: Event) => {
        const detail = (e as CustomEvent<{ hideAudioTags?: boolean }>).detail;
        cb(typeof detail?.hideAudioTags === "boolean" ? detail.hideAudioTags : getHideAudioTags());
    };
    window.addEventListener(CHAT_DISPLAY_PREFS_EVENT, handler);
    return () => window.removeEventListener(CHAT_DISPLAY_PREFS_EVENT, handler);
}

/**
 * React 订阅钩子：开关一变，用到它的组件自动重渲染。
 * 用 useSyncExternalStore 而不是 useState+useEffect，避免首帧闪一下旧值
 * （气泡列表几十个节点，闪一下很明显）。
 */
export function useHideAudioTags(): boolean {
    return useSyncExternalStore(
        (cb) => onChatDisplayPrefsChange(() => cb()),
        getHideAudioTags,
        () => DEFAULT_HIDE_AUDIO_TAGS,
    );
}
