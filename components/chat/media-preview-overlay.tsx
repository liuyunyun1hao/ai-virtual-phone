"use client";

import { useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ChatPhotoAnnotation } from "@/lib/chat-storage";

const ACTION_BUTTON_STYLE: CSSProperties = {
    color: "#fff",
    fontSize: "calc(14px*var(--app-text-scale,1))",
    opacity: 0.85,
    border: "none",
    cursor: "pointer",
    padding: "8px 20px",
    borderRadius: 20,
    background: "rgba(255,255,255,0.15)",
    backdropFilter: "blur(8px)",
};

/**
 * 全屏媒体预览层：图片（或未生成时的文字描述）+ 下方操作按钮排。
 * 聊天、朋友圈、小卷共用——聊天流里不放常驻小按钮，保存/重新生成都收在这里。
 */
export function MediaPreviewOverlay({
    imageUrl,
    description,
    saveFilename,
    onRegenerate,
    annotations,
    onAnnotate,
    regenerating,
    onClose,
}: {
    imageUrl?: string | null;
    description?: string;
    saveFilename?: string;
    onRegenerate?: () => void;
    annotations?: ChatPhotoAnnotation[];
    onAnnotate?: () => void;
    regenerating?: boolean;
    onClose: () => void;
}) {
    // 保存要重新拉一次图片，慢网络下会卡一下——按钮上给个状态
    const [saving, setSaving] = useState(false);
    if (typeof document === "undefined") return null;
    return createPortal(
        <div
            style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.85)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}
            onClick={onClose}
        >
            {imageUrl ? (
                <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "75vh" }} onClick={e => e.stopPropagation()}>
                    <img src={imageUrl} alt="" style={{ display: "block", maxWidth: "90vw", maxHeight: "75vh", objectFit: "contain" }} />
                    {!!annotations?.length && <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                        {annotations.map(annotation => annotation.kind === "stroke" && annotation.points?.length
                            ? <g key={annotation.id}>
                                <polyline points={Array.from({ length: Math.floor(annotation.points.length / 2) }, (_, index) => `${annotation.points![index * 2] * 1000},${annotation.points![index * 2 + 1] * 1000}`).join(" ")} fill="none" stroke={annotation.color} strokeWidth={(annotation.width || .012) * 1000} strokeLinecap="round" strokeLinejoin="round" />
                                {annotation.renderStyle === "handdrawn" && <polyline points={Array.from({ length: Math.floor(annotation.points.length / 2) }, (_, index) => `${annotation.points![index * 2] * 1000},${annotation.points![index * 2 + 1] * 1000}`).join(" ")} fill="none" stroke={annotation.color} strokeWidth={(annotation.width || .012) * 580} strokeLinecap="round" strokeLinejoin="round" opacity=".28" transform="translate(2.2 1.4)" />}
                            </g>
                            : annotation.kind === "text" && annotation.text
                                ? <text key={annotation.id} x={(annotation.x ?? .5) * 1000} y={(annotation.y ?? .5) * 1000} fill={annotation.color} fontSize="64" fontWeight="700" fontFamily="Segoe Print, Bradley Hand, Comic Sans MS, cursive" fontStyle="italic" paintOrder="stroke" stroke="rgba(0,0,0,.38)" strokeWidth="8">{annotation.text}</text>
                                : null)}
                    </svg>}
                </div>
            ) : description ? (
                <div
                    style={{ color: "#fff", opacity: 0.9, maxWidth: "min(85vw, 420px)", maxHeight: "60vh", overflowY: "auto", fontSize: "calc(14px*var(--app-text-scale,1))", lineHeight: 1.8, fontStyle: "italic", whiteSpace: "pre-wrap" }}
                    onClick={e => e.stopPropagation()}
                >
                    {description}
                </div>
            ) : null}
            <div style={{ display: "flex", gap: 12 }} onClick={e => e.stopPropagation()}>
                {imageUrl && saveFilename && (
                    <button
                        onPointerDown={e => e.stopPropagation()}
                        disabled={saving}
                        onClick={async e => {
                            e.stopPropagation();
                            e.preventDefault();
                            setSaving(true);
                            try {
                                const { downloadUrl } = await import("@/lib/download-utils");
                                await downloadUrl(imageUrl, saveFilename);
                            } finally {
                                setSaving(false);
                            }
                        }}
                        style={ACTION_BUTTON_STYLE}
                    >
                        {saving ? "保存中…" : "保存图片"}
                    </button>
                )}
                {onRegenerate && (
                    <button
                        onPointerDown={e => e.stopPropagation()}
                        disabled={regenerating}
                        onClick={e => {
                            e.stopPropagation();
                            onRegenerate();
                        }}
                        style={ACTION_BUTTON_STYLE}
                    >
                        {regenerating ? "生成中..." : "重新生成"}
                    </button>
                )}
                {onAnnotate && (
                    <button type="button" onClick={event => { event.stopPropagation(); onAnnotate(); }} style={ACTION_BUTTON_STYLE}>标记</button>
                )}
            </div>
        </div>,
        document.body,
    );
}
