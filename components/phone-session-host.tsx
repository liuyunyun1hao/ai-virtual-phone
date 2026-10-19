"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { readIdentityRuntime, silenceIdentityRuntime } from "@/lib/identity-runtime";
import { PHONE_SESSION_MESSAGE, PHONE_SESSION_REMOUNT_EVENT, PHONE_SESSION_RETIRE_EVENT, phoneSessionParent } from "@/lib/phone-session-protocol";
import styles from "./phone-session-host.module.css";
import { installPhoneSessionViewport } from "@/lib/phone-session-viewport";

export function PhoneSessionLoading({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  return <main className="app-root splash-root">
    <section className="phone-shell-wrap splash-shell-wrap" aria-label="正在切换身份">
      <div className="phone-case"><div className="phone-frame"><div className={`phone-shell ${styles.loading}`}>
        {error ? <><p role="alert">{error}</p><button type="button" onClick={onRetry}>重试</button></>
          : <><Loader2 size={22} className={styles.spinner} aria-hidden="true" /><p role="status">正在准备你的手机</p></>}
      </div></div></div>
    </section>
  </main>;
}

/** A fresh realm retains immutable identity leases without navigating the outer page. */
export function PhoneSessionHost({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const current = useRef<string | null>(null);
  const [session, setSession] = useState<{ token: string; url: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const retry = useRef<() => void>(() => {});

  useEffect(() => {
    const parent = phoneSessionParent();
    const cleanViewport = installPhoneSessionViewport();
    const mount = (force = false) => {
      if (parent) {
        parent.postMessage({ type: PHONE_SESSION_MESSAGE, action: "remount" }, window.location.origin);
        return;
      }
      const state = readIdentityRuntime();
      if (!state?.activeUserId || state.deletingUserIds.length) return;
      const key = `${state.activeUserId}:${state.revision}`;
      if (!force && current.current === key) return;
      current.current = key;
      try { frame.current?.contentWindow?.dispatchEvent(new Event(PHONE_SESSION_RETIRE_EVENT)); } catch { /* A navigated foreign frame is removed below. */ }
      silenceIdentityRuntime();
      const token = `${state.revision}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const url = new URL("/", window.location.origin);
      url.searchParams.set("phone-session", token);
      if (new URLSearchParams(window.location.search).has("plugin-safe-mode")) url.searchParams.set("plugin-safe-mode", "1");
      setLoading(true); setSlow(false); setSession({ token, url: url.href });
    };
    retry.current = () => mount(true);
    const remount = (event: Event) => { event.preventDefault(); mount(); };
    const retire = () => {
      if (!parent) return;
      cleanViewport();
      silenceIdentityRuntime();
    };
    const message = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !frame.current?.contentWindow
        || event.source !== frame.current.contentWindow || event.data?.type !== PHONE_SESSION_MESSAGE) return;
      if (event.data.action === "remount") mount();
    };
    // Forward native shell/deep-link and SW inputs to the one active phone, not retired runtimes.
    const openApp = (event: Event) => {
      const target = frame.current?.contentWindow;
      if (target) target.dispatchEvent(new CustomEvent("open-app", { detail: (event as CustomEvent).detail }));
    };
    const hashChanged = () => {
      if (!frame.current?.contentWindow || !window.location.hash) return;
      frame.current.contentWindow.location.hash = window.location.hash;
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    };
    const swMessage = (event: MessageEvent) => {
      const target = frame.current?.contentWindow;
      // Outbox/call broadcasts reach frames directly; only the SW's selected-client command needs forwarding.
      if (!target?.navigator.serviceWorker || event.data?.type !== "run_shortcut") return;
      const state = readIdentityRuntime();
      if (event.data.userIdentityId && (event.data.userIdentityId !== state?.activeUserId
        || event.data.identityRevision !== state?.revision)) return;
      target.navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: event.data }));
    };
    window.addEventListener(PHONE_SESSION_REMOUNT_EVENT, remount);
    window.addEventListener(PHONE_SESSION_RETIRE_EVENT, retire);
    window.addEventListener("message", message);
    window.addEventListener("open-app", openApp);
    window.addEventListener("hashchange", hashChanged);
    navigator.serviceWorker?.addEventListener("message", swMessage);
    return () => {
      cleanViewport();
      window.removeEventListener(PHONE_SESSION_REMOUNT_EVENT, remount);
      window.removeEventListener(PHONE_SESSION_RETIRE_EVENT, retire);
      window.removeEventListener("message", message);
      window.removeEventListener("open-app", openApp);
      window.removeEventListener("hashchange", hashChanged);
      navigator.serviceWorker?.removeEventListener("message", swMessage);
    };
  }, []);

  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => setSlow(true), 20_000);
    return () => window.clearTimeout(timer);
  }, [loading, session]);

  if (!session) return children;
  return <div className={styles.host}>
    <iframe key={session.token} ref={frame} src={session.url} data-phone-session={session.token}
      title="当前身份的手机" className={styles.frame} allowFullScreen
      allow="microphone; camera; autoplay; clipboard-read; clipboard-write; display-capture"
      onLoad={() => { setLoading(false); setSlow(false); }} />
    {loading && <div className={styles.cover}><PhoneSessionLoading error={slow ? "手机加载较慢，请检查连接后重试" : undefined} onRetry={() => retry.current()} /></div>}
  </div>;
}
