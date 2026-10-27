"use client";

// 全局聊天提示音设置：新消息 / 发送消息 / 来电 / 致电 / 挂断。
// 存在 ChatAppSettings.globalChatSounds 里；私聊可以在「聊天信息」里给单个角色覆盖。

import { useState, type CSSProperties } from "react";
import { BellRing } from "lucide-react";
import { ContentDialog } from "@/components/ui/modal";
import { Toggle } from "@/components/ui/form";
import {
    loadChatAppSettings,
    saveChatAppSettings,
    type ChatSoundConfig,
    type ChatSoundKind,
    type ChatSoundsConfig,
} from "@/lib/chat-storage";
import { previewChatSound } from "@/lib/chat-sound";
import { ChatSoundSourceEditor, SOUND_ITEMS } from "./chat-sound-editor";

export function ChatGlobalSoundsDialog({ onClose }: { onClose: () => void }) {
    const [sounds, setSounds] = useState<ChatSoundsConfig>(() => loadChatAppSettings().globalChatSounds || {});

    const persist = (next: ChatSoundsConfig) => {
        setSounds(next);
        const settings = loadChatAppSettings();
        saveChatAppSettings({ ...settings, globalChatSounds: next });
    };

    const patch = (kind: ChatSoundKind, patchValue: Partial<ChatSoundConfig>) => {
        persist({ ...sounds, [kind]: { ...(sounds[kind] || {}), ...patchValue } });
    };

    const sourceChanged = (kind: ChatSoundKind, patchValue: Partial<ChatSoundConfig>) => {
        // 选好音频就把开关一起打开，省一次点击；清除音频时保留开关状态
        const turningOn = Boolean(patchValue.value ?? patchValue.sourceType);
        patch(kind, turningOn ? { ...patchValue, enabled: true } : patchValue);
    };

    const clearSubToggle = (kind: ChatSoundKind, key: "muteActiveChat" | "notifyOncePerBurst") => {
        const own: ChatSoundConfig = { ...(sounds[kind] || {}) };
        delete own[key];
        persist({ ...sounds, [kind]: own });
    };

    return (
        <ContentDialog
            title="聊天提示音"
            confirmLabel=""
            cancelLabel="完成"
            onConfirm={onClose}
            onCancel={onClose}
        >
            <div className="flex flex-col gap-3 pb-2">
                <p className="ts-12 leading-relaxed text-[var(--c-text)] opacity-80">
                    这里设置全局默认音效；私聊里还能给单个角色单独换音频或不播。最多支持 8MB 的音频文件，也可以直接填音频 URL。
                </p>
                <div className="menu-group">
                    {SOUND_ITEMS.map(({ kind, icon: Icon, label, desc }) => {
                        const config: ChatSoundConfig = sounds[kind] || {};
                        const hasSource = Boolean(config.value);
                        const enabled = config.enabled === true && hasSource;
                        return (
                            <div key={kind} className="chat-sound-block">
                                <div className="menu-item">
                                    <span className="chat-info-icon" style={{ "--icon-color": "var(--c-accent, #6b7280)" } as CSSProperties}>
                                        <Icon size={22} strokeWidth={1.75} />
                                    </span>
                                    <div className="menu-label-group">
                                        <span className="menu-label">{label}</span>
                                        <span className="menu-desc">{hasSource ? desc : `${desc}（先选音频）`}</span>
                                    </div>
                                    <div className="menu-right">
                                        <Toggle
                                            checked={config.enabled === true}
                                            onChange={checked => patch(kind, { enabled: checked })}
                                        />
                                    </div>
                                </div>
                                {config.enabled === true || hasSource ? (
                                    <div className="chat-sound-editor">
                                        <ChatSoundSourceEditor
                                            config={config}
                                            canPreview={hasSource}
                                            onPatch={next => sourceChanged(kind, next)}
                                            onPreview={() => void previewChatSound(kind)}
                                        />
                                        {kind === "newMessage" ? (
                                            <>
                                                <div className="chat-sound-subtoggles">
                                                    <div className="chat-sound-subtoggle">
                                                        <div className="menu-label-group">
                                                            <span className="menu-label">实时聊天不通知</span>
                                                            <span className="menu-desc">正打开该聊天时，角色新消息不播放音效</span>
                                                        </div>
                                                        <div className="menu-right gap-2">
                                                            <Toggle
                                                                checked={config.muteActiveChat === true}
                                                                onChange={checked => patch(kind, { muteActiveChat: checked })}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="chat-sound-subtoggle">
                                                        <div className="menu-label-group">
                                                            <span className="menu-label">多条消息只通知1次</span>
                                                            <span className="menu-desc">同一角色连续多条消息只在第一条时播放</span>
                                                        </div>
                                                        <div className="menu-right gap-2">
                                                            {config.notifyOncePerBurst !== undefined ? (
                                                                <button type="button" className="chat-sound-subreset" onClick={() => clearSubToggle(kind, "notifyOncePerBurst")}>恢复默认</button>
                                                            ) : null}
                                                            <Toggle
                                                                checked={config.notifyOncePerBurst === true}
                                                                onChange={checked => patch(kind, { notifyOncePerBurst: checked })}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                                {enabled ? (
                                                    <div className="chat-sound-editor-row chat-sound-test-row">
                                                        <button className="ui-btn ui-btn-outline chat-sound-file-btn" onClick={() => void previewChatSound("newMessage")}>
                                                            <BellRing size={14} /> 试听新消息音效
                                                        </button>
                                                        <span className="chat-sound-source">试听不受「实时聊天不通知」影响</span>
                                                    </div>
                                                ) : null}
                                            </>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </div>
        </ContentDialog>
    );
}
