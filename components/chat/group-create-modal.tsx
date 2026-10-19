"use client";

import { useState } from "react";
import { loadChatContacts } from "@/lib/chat-storage";
import { loadChatAppCharacters as loadCharacters } from "@/lib/chat-app-characters";
import { resolveUserIdentity } from "@/lib/settings-storage";
import { Character } from "@/lib/character-types";
import { Input, Textarea } from "@/components/ui/form";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";
import { GroupAvatarPicker } from "./group-avatar";

type GroupCreateModalProps = {
    onClose: () => void;
    onCreate: (groupName: string, participantIds: string[], isSpectator: boolean, groupAvatar?: string, groupDescription?: string) => void;
};

export function GroupCreateModal({ onClose, onCreate }: GroupCreateModalProps) {
    const [step, setStep] = useState<"pick" | "name">("pick");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [groupName, setGroupName] = useState("");
    const [groupAvatar, setGroupAvatar] = useState("");
    const [groupDescription, setGroupDescription] = useState("");
    const [isSpectator, setIsSpectator] = useState(false);

    const contacts = loadChatContacts();
    const chars = loadCharacters();

    const friendIds = new Set(contacts.map(contact => contact.characterId));
    const availableChars = isSpectator ? chars : chars.filter(char => friendIds.has(char.id));
    const changeSpectatorMode = () => {
        if (isSpectator) setSelectedIds(prev => new Set([...prev].filter(id => friendIds.has(id))));
        setIsSpectator(prev => !prev);
    };

    const toggle = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const selectedChars = [...selectedIds]
        .map(id => chars.find(c => c.id === id))
        .filter(Boolean) as Character[];

    const userIdentity = resolveUserIdentity(undefined, "group_chat");
    const userName = userIdentity?.name || "我";
    const defaultName = isSpectator
        ? selectedChars.map(c => c.name).join("、")
        : [...selectedChars.map(c => c.name), userName].join("、");

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-dialog" onClick={e => e.stopPropagation()}>
                {step === "pick" ? (
                    <>
                        <span className="modal-header-title">选择群成员</span>
                        <label className="flex items-start gap-2 w-full cursor-pointer">
                            <input type="checkbox" checked={isSpectator} onChange={changeSpectatorMode} className="mt-[3px] shrink-0" />
                            <span className="ts-13 text-[var(--c-text)]">围观模式<span className="block ts-12 text-[var(--c-icon)]">我不加入，可选非好友角色</span></span>
                        </label>
                        {availableChars.length === 0 ? (
                            <span className="menu-desc">{isSpectator ? "暂无角色，请先创建角色" : "暂无联系人，请先添加好友"}</span>
                        ) : (
                            <div className="chat-contact-list">
                                {availableChars.map(c => {
                                    const isSelected = selectedIds.has(c.id);
                                    return (
                                        <div
                                            key={c.id}
                                            className="chat-contact-item"
                                            onClick={() => toggle(c.id)}
                                        >
                                            <div className="chat-contact-avatar" style={isSelected ? { outline: "3px solid var(--c-success)", outlineOffset: "2px" } : undefined}>
                                                {c.avatar ? (
                                                    <img src={c.avatar} alt="" />
                                                ) : (
                                                    <ChatFallbackAvatar />
                                                )}
                                            </div>
                                            <span className="chat-contact-name">{c.name}{!friendIds.has(c.id) && <span className="menu-desc ml-2">未加好友</span>}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {selectedIds.size >= 2 && (
                            <button
                                onClick={() => setStep("name")}
                                className="ui-btn ui-btn-success w-full"
                            >
                                下一步 ({selectedIds.size} 人)
                            </button>
                        )}
                        {selectedIds.size === 1 && (
                            <p className="ts-12 text-[var(--c-icon)] text-center m-0">至少选择 2 位成员</p>
                        )}
                    </>
                ) : (
                    <>
                        <span className="modal-header-title">群聊名称</span>
                        <div className="w-full">
                            <Input
                                autoFocus
                                value={groupName}
                                onChange={e => setGroupName(e.target.value)}
                                placeholder={defaultName || "请输入群名"}
                                className="ui-input w-full"
                            />
                        </div>
                        <div className="chat-contact-list">
                            {selectedChars.map(c => (
                                <div key={c.id} className="chat-contact-item">
                                    <div className="chat-contact-avatar">
                                        {c.avatar ? (
                                            <img src={c.avatar} alt="" />
                                        ) : (
                                            <ChatFallbackAvatar />
                                        )}
                                    </div>
                                    <span className="chat-contact-name">{c.name}</span>
                                </div>
                            ))}
                        </div>
                        <GroupAvatarPicker value={groupAvatar} members={[...(!isSpectator && userIdentity ? [{ avatar: userIdentity.avatarUrl }] : []), ...selectedChars]} onChange={setGroupAvatar} />
                        <label
                            className="flex items-start gap-2 w-full cursor-pointer select-none"
                        >
                            <input
                                type="checkbox"
                                checked={isSpectator}
                                onChange={changeSpectatorMode}
                                className="mt-[3px] shrink-0"
                            />
                            <span className="ts-13 text-[var(--c-text)]">
                                围观模式
                                <span className="block ts-12 text-[var(--c-icon)]">我不加入群聊</span>
                            </span>
                        </label>
                        <label className="w-full flex flex-col gap-2">
                            <span className="ts-13 text-[var(--c-text)]">群说明（仅 AI 可见）</span>
                            <Textarea value={groupDescription} onChange={e => setGroupDescription(e.target.value)} rows={3} maxLength={4000} placeholder="背景、话题或发展方向（选填）" className="w-full" />
                        </label>
                        <div className="flex gap-2 w-full">
                            <button
                                onClick={() => setStep("pick")}
                                className="ui-btn ui-btn-ghost flex-1"
                            >
                                返回
                            </button>
                            <button
                                disabled={selectedChars.length < 2}
                                onClick={() => onCreate(groupName.trim() || defaultName, [...selectedIds], isSpectator, groupAvatar, groupDescription)}
                                className="ui-btn ui-btn-success flex-1"
                            >
                                创建
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
