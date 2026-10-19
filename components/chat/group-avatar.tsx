"use client";

import { useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";

type Member = { avatar?: string | null };

export function GroupAvatar({ src, members }: { src?: string; members: Member[] }) {
    if (src) return <img src={src} alt="群聊头像" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />;
    return <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 1, padding: 2, width: "100%", height: "100%", overflow: "hidden", borderRadius: "inherit", background: "#e9e9eb" }}>
        {Array.from({ length: 4 }, (_, index) => <span key={index} style={{ overflow: "hidden", minHeight: 0, background: "#f6f6f8" }}>
            {members[index]?.avatar ? <img src={members[index].avatar!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : members[index] ? <ChatFallbackAvatar /> : null}
        </span>)}
    </span>;
}

export function GroupAvatarPicker({ value, members, onChange, avatarOnly = false }: { value?: string; members: Member[]; onChange: (value: string) => void; avatarOnly?: boolean }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [expanded, setExpanded] = useState(false);
    const [urlMode, setUrlMode] = useState(false);
    const [draftUrl, setDraftUrl] = useState(value?.startsWith("http") ? value : "");
    const fileRef = useRef<HTMLInputElement>(null);
    const applyUrl = async () => {
        let url: URL;
        try {
            url = new URL(draftUrl.trim());
            if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error();
        } catch { setError("请输入有效的 http / https 图片链接"); return; }
        setBusy(true); setError("");
        try {
            await new Promise<void>((resolve, reject) => {
                const image = new Image();
                const timer = window.setTimeout(() => { image.onload = image.onerror = null; image.src = ""; reject(new Error("timeout")); }, 12000);
                image.onload = () => { clearTimeout(timer); resolve(); };
                image.onerror = () => { clearTimeout(timer); reject(new Error("image")); };
                image.src = url.href;
            });
            onChange(url.href);
            setExpanded(false);
        } catch { setError("图片无法加载，请检查链接或改用本地选择"); }
        finally { setBusy(false); }
    };
    return <div className={`group-avatar-picker${avatarOnly ? " group-avatar-profile-picker" : ""}`}>
        <button type="button" className={avatarOnly ? "chat-settings-avatar" : "group-avatar-setting-row"} aria-label="修改群聊头像" aria-expanded={expanded} onClick={() => setExpanded(open => !open)}>
            {avatarOnly ? <GroupAvatar src={value} members={members} /> : <>
            <span className="chat-info-icon" style={{ overflow: "hidden" }}><GroupAvatar src={value} members={members} /></span>
            <span className="menu-label-group"><span className="menu-label">群聊头像</span></span>
            <span className="menu-right"><span className="menu-desc">{busy ? "正在处理…" : value ? "已设置" : "默认"}</span><ChevronRight size={16} /></span>
            </>}
        </button>
            <input ref={fileRef} type="file" accept="image/*" aria-label="选择群聊头像" disabled={busy} style={{ display: "none" }} onChange={async event => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) { setError("请选择不超过 20 MB 的图片"); return; }
                setBusy(true); setError("");
                const url = URL.createObjectURL(file);
                try {
                    const image = new Image(); image.src = url; await image.decode();
                    const canvas = document.createElement("canvas");
                    canvas.width = canvas.height = 256;
                    const context = canvas.getContext("2d");
                    if (!context) throw new Error("Canvas unavailable");
                    const side = Math.min(image.naturalWidth, image.naturalHeight);
                    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
                    onChange(canvas.toDataURL("image/webp", .85));
                    setExpanded(false);
                } catch { setError("图片读取失败，请换一张图片"); }
                finally { URL.revokeObjectURL(url); setBusy(false); }
            }} />
        {expanded && <div className="group-avatar-options">
            <div className="group-avatar-methods">
                <button type="button" className="ui-btn ui-btn-ghost" disabled={busy} onClick={() => { setError(""); setUrlMode(false); fileRef.current?.click(); }}>本地选择</button>
                <button type="button" className="ui-btn ui-btn-ghost" disabled={busy} aria-expanded={urlMode} onClick={() => { setError(""); setUrlMode(true); setDraftUrl(value?.startsWith("http") ? value : ""); }}>图片 URL</button>
            </div>
            {urlMode && <div className="group-avatar-url">
                <input className="ui-input" type="url" aria-label="群聊头像图片 URL" placeholder="https://…" value={draftUrl} disabled={busy} onChange={event => setDraftUrl(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (!busy && draftUrl.trim()) void applyUrl(); } }} />
                <button type="button" className="ui-btn ui-btn-ghost" disabled={busy || !draftUrl.trim()} onClick={() => void applyUrl()}>{busy ? "正在验证…" : "应用"}</button>
            </div>}
            {value && <button type="button" className="ui-btn ui-btn-ghost" disabled={busy} onClick={() => { onChange(""); setDraftUrl(""); setError(""); setExpanded(false); }}>恢复默认头像</button>}
        </div>}
        {error && <span className="menu-desc" role="alert">{error}</span>}
    </div>;
}
