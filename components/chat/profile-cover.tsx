"use client";
import { useEffect, useRef, useState } from "react";
import { kvGet, kvSet } from "@/lib/kv-db";
import { getChatImageFromIndexedDB, saveChatImageToIndexedDB } from "@/lib/chat-asset-storage";

/** Local profile decoration; does not upload to a remote service. */
export function ProfileCover() {
    const input = useRef<HTMLInputElement>(null);
    const alive = useRef(true);
    const [src, setSrc] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const key = "chat_profile_cover_asset_v1";
    useEffect(() => {
        alive.current = true;
        const id = kvGet(key);
        if (id) getChatImageFromIndexedDB(id).then(url => { if (alive.current) setSrc(url); }).catch(() => {});
        return () => { alive.current = false; };
    }, []);
    async function upload(file?: File) {
        if (!file || busy) return;
        if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) {
            setError("请选择 20MB 以内的图片"); return;
        }
        setBusy(true); setError("");
        const url = URL.createObjectURL(file);
        try {
            const img = new Image(); img.src = url; await img.decode();
            const scale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("canvas");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("image")), "image/webp", .85));
            const id = await saveChatImageToIndexedDB(blob);
            const next = await getChatImageFromIndexedDB(id);
            if (!next) throw new Error("storage");
            kvSet(key, id);
            if (alive.current) setSrc(next);
        } catch {
            if (alive.current) setError("图片读取或保存失败，请换一张图片重试");
        } finally {
            URL.revokeObjectURL(url);
            if (alive.current) setBusy(false);
        }
    }
    return <>
        {src && <div className="profile-cover-image" aria-hidden="true" style={{ backgroundImage: `url(${JSON.stringify(src)})` }} />}
        <button type="button" className="profile-cover-upload" aria-label={busy ? "正在保存背景图" : "上传或更换主页背景图"} disabled={busy} onClick={() => input.current?.click()} />
        <input ref={input} type="file" accept="image/*" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void upload(file); }} />
        {error && <span className="profile-cover-error" role="alert">{error}</span>}
    </>;
}
