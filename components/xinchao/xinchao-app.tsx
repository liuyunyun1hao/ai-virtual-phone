"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 本机心潮看板：由 /root/work/xc-dashboard 提供，默认监听 8892。
 *  https 页面里嵌 http://127.0.0.1 是浏览器允许的（本机地址被视为可信来源），
 *  所以这里直接 iframe 整个看板，样式和刷新逻辑都留在看板自己手里。 */
const DASHBOARD_URL = "http://127.0.0.1:8892/";

type Status = "checking" | "online" | "offline";

export function XinchaoApp({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<Status>("checking");
  const [attempts, setAttempts] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const aliveRef = useRef(true);

  const ping = useCallback(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(`${DASHBOARD_URL}health`, { cache: "no-store", signal: controller.signal });
      if (!aliveRef.current) return false;
      setStatus(res.ok ? "online" : "offline");
      return res.ok;
    } catch {
      if (aliveRef.current) setStatus("offline");
      return false;
    } finally {
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void ping();
    return () => {
      aliveRef.current = false;
    };
  }, [ping]);

  // 看板没起来时每 4 秒自动重试，最多 15 次，免得用户以为卡死
  useEffect(() => {
    if (status !== "offline" || attempts >= 15) return;
    const timer = setTimeout(() => {
      setAttempts((n) => n + 1);
      void ping();
    }, 4000);
    return () => clearTimeout(timer);
  }, [status, attempts, ping]);

  const retry = useCallback(() => {
    setAttempts(0);
    setStatus("checking");
    void ping();
  }, [ping]);

  if (status === "online") {
    return (
      <div className="xinchao-app">
        <iframe
          key={reloadKey}
          className="xinchao-frame"
          src={DASHBOARD_URL}
          title="心潮 · 此刻"
          allow="clipboard-read; clipboard-write"
        />
        <div className="xinchao-toolbar">
          <button type="button" className="xinchao-tool xinchao-tool-back" onClick={onClose} aria-label="返回桌面">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>桌面</span>
          </button>
          <button
            type="button"
            className="xinchao-tool"
            onClick={() => setReloadKey((n) => n + 1)}
            aria-label="刷新看板"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-3.2-6.9" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="xinchao-app xinchao-state">
      <button type="button" className="xinchao-close" onClick={onClose} aria-label="关闭">
        ✕
      </button>
      <div className="xinchao-orb" data-state={status} aria-hidden="true" />
      <h2>{status === "checking" ? "正在连接本机看板" : "看板没在跑"}</h2>
      <p className="xinchao-hint">
        {status === "checking" ? (
          "127.0.0.1:8892，等它回一句话就行。"
        ) : (
          <>
            心潮看起来没接上。在 Termux 里跑一次：
            <code>python3 /root/work/mcp-relay-ensure.py</code>
            它会把转接头（8890）和看板（8892）一起叫醒。
          </>
        )}
      </p>
      <div className="xinchao-actions">
        <button type="button" className="xinchao-btn" onClick={retry}>
          {status === "checking" ? "再看一眼" : "重新连接"}
        </button>
        <a className="xinchao-link" href={DASHBOARD_URL} target="_blank" rel="noreferrer">
          用浏览器打开 ↗
        </a>
      </div>
      {status === "offline" && attempts > 0 ? (
        <p className="xinchao-attempts">已自动重试 {attempts} 次 · 每 4 秒一次</p>
      ) : null}
    </div>
  );
}
