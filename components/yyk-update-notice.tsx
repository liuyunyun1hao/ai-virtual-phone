"use client";

import { useEffect, useRef, useState } from "react";
import { X, Smartphone, Check } from "lucide-react";
import { fetchUpdate, parseUpdate, readUpdatePreferences, shouldShowUpdate, YYK_REPOSITORY, YYK_UPDATE_KEY, YYK_VERSION, type UpdateNotice, type UpdatePreferences } from "@/lib/yyk-updates";
import bundledRelease from "@/public/yyk-update.json";
import styles from "./yyk-update-notice.module.css";

export function YykUpdateCard({ notice, onClose, preview = false }: { notice: UpdateNotice; onClose: (dismiss: boolean) => void; preview?: boolean }) {
    const installed = notice.version === YYK_VERSION;
    const [guide, setGuide] = useState(false);
    const panel = useRef<HTMLElement>(null);
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
        return () => { if (previous?.isConnected) previous.focus(); };
    }, []);
    return <div className={styles.overlay} data-ui="modal" onKeyDown={e => {
        if (e.key === "Escape") { e.stopPropagation(); onClose(false); }
        if (e.key !== "Tab") return;
        const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>('button,a[href]') || []).filter(el => el.getClientRects().length);
        const first = nodes[0], last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }}>
        <section ref={panel} className={styles.card} role="dialog" aria-modal="true" aria-labelledby="yyk-update-title" aria-describedby="yyk-update-description">
            <button className={styles.close} aria-label="关闭更新卡片" onClick={() => onClose(false)}><X size={18} /></button>
            <div className={styles.sender}><span className={styles.mark}><Smartphone size={23} /></span><div className={styles.meta}>{preview ? "预览 · " : ""}{notice.date}</div></div>
            <h2 id="yyk-update-title">更新版本 {notice.version}</h2>
            <ul className={styles.changes}>{notice.changes.map((item, i) => <li key={i}><Check size={19} /><div><strong>{item.title}</strong><p>{item.text}</p></div></li>)}</ul>
            <p id="yyk-update-description" className={styles.intro}>如果需要的话，请拉取更新。</p>
            <div className={styles.actions}><button className={styles.primary} aria-expanded={guide} aria-controls="yyk-update-guide" onClick={() => setGuide(!guide)}>{guide ? "收起更新方法" : "查看拉取方法"}</button><button onClick={() => onClose(false)}>{installed ? "知道了" : "稍后再说"}</button></div>
            {guide && <div id="yyk-update-guide" className={styles.guide}><strong>在你自己的仓库里更新</strong><ol><li>先在小手机里导出重要数据备份。</li><li>打开你的 GitHub fork，选择 Sync fork → Update branch；如有冲突，先确认自己的改动。</li><li>等托管平台重新部署完成；未开启自动部署时，需手动触发部署。再打开原网址。</li></ol><a href={YYK_REPOSITORY} target="_blank" rel="noopener noreferrer">查看公开仓库</a></div>}
            {!installed && <button className={styles.dismiss} onClick={() => onClose(true)}>本次不再提醒</button>}
            <p className={styles.credit}>更新人：Yyk的机</p>
        </section>
    </div>;
}

export function YykUpdateNotice() {
    const [notice, setNotice] = useState<UpdateNotice | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let observer: MutationObserver | undefined;
        const storage = (() => { try { return window.localStorage; } catch { return null; } })();
        const preferences = storage ? readUpdatePreferences(storage) : {};
        const timer = setTimeout(async () => {
            const local = parseUpdate(bundledRelease);
            const installedNotice = local?.version === YYK_VERSION && preferences.seenVersion !== YYK_VERSION ? local : null;
            let candidate = installedNotice || preferences.notice;
            if (!installedNotice && (!candidate || !preferences.checkedAt || Date.now() - preferences.checkedAt > 6 * 60 * 60 * 1000)) {
                timeout = setTimeout(() => controller.abort(), 6000);
                candidate = await fetchUpdate(controller.signal) || undefined;
                clearTimeout(timeout);
                if (controller.signal.aborted) return;
                if (candidate && storage) {
                    try { storage.setItem(YYK_UPDATE_KEY, JSON.stringify({ ...readUpdatePreferences(storage), notice: candidate, checkedAt: Date.now() })); } catch { /* Storage is optional. */ }
                }
            }
            if (!candidate || controller.signal.aborted) return;
            const ready = candidate;
            const show = () => {
                if (controller.signal.aborted || document.visibilityState !== "visible" || document.querySelector('[role="dialog"], [data-ui="modal"]')) return;
                const latest = storage ? readUpdatePreferences(storage) : preferences;
                if (installedNotice ? latest.seenVersion !== YYK_VERSION : shouldShowUpdate(ready, latest)) setNotice(ready);
                observer?.disconnect();
            };
            observer = new MutationObserver(show);
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "class", "style"] });
            document.addEventListener("visibilitychange", show, { signal: controller.signal });
            show();
        }, 2500);
        return () => { clearTimeout(timer); clearTimeout(timeout); controller.abort(); observer?.disconnect(); };
    }, []);
    if (!notice) return null;
    return <YykUpdateCard notice={notice} onClose={dismiss => {
        try {
            const preferences: UpdatePreferences = readUpdatePreferences(window.localStorage);
            if (notice.version === YYK_VERSION) preferences.seenVersion = notice.version;
            else if (dismiss) preferences.dismissed = notice.version;
            else { preferences.laterVersion = notice.version; preferences.laterUntil = Date.now() + 24 * 60 * 60 * 1000; }
            window.localStorage.setItem(YYK_UPDATE_KEY, JSON.stringify(preferences));
        } catch { /* Closing still works when storage is unavailable. */ }
        setNotice(null);
    }} />;
}
