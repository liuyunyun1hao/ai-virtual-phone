import { phoneSessionParent } from "./phone-session-protocol";

/** Subframes have their own CSS environment. Preserve the outer device's safe areas. */
export function installPhoneSessionViewport(): () => void {
  const parent = phoneSessionParent();
  if (!parent) return () => {};
  const probe = parent.document.createElement("div");
  probe.dataset.phoneSessionSafeArea = "true";
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
  parent.document.body.appendChild(probe);
  const sync = () => {
    const style = parent.getComputedStyle(probe);
    for (const [side, value] of Object.entries({ top: style.paddingTop, right: style.paddingRight, bottom: style.paddingBottom, left: style.paddingLeft })) {
      document.documentElement.style.setProperty(`--phone-session-inset-${side}`, value);
    }
    window.dispatchEvent(new Event("pageshow"));
  };
  const rewriteRules = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if ("style" in rule) {
        const style = (rule as CSSStyleRule).style;
        for (const property of Array.from(style)) {
          const value = style.getPropertyValue(property);
          const next = value.replace(/env\(safe-area-inset-(top|right|bottom|left)\s*(?=[,)])/g, "var(--phone-session-inset-$1");
          if (value !== next) style.setProperty(property, next, style.getPropertyPriority(property));
        }
      }
      if ("cssRules" in rule) rewriteRules((rule as CSSGroupingRule).cssRules);
    }
  };
  const rewrite = () => {
    for (const sheet of Array.from(document.styleSheets)) {
      try { rewriteRules(sheet.cssRules); } catch { /* Foreign CSS retains its own environment. */ }
    }
  };
  let scheduled = 0;
  const schedule = () => {
    if (!scheduled) scheduled = window.requestAnimationFrame(() => { scheduled = 0; rewrite(); });
  };
  const observer = new MutationObserver(records => {
    if (records.some(record => (record.target as Element).closest?.("style")
      || Array.from(record.addedNodes).some(node => node instanceof Element && (node.matches("style,link[rel=stylesheet]") || node.querySelector("style,link[rel=stylesheet]"))))) schedule();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  const stylesheetLoaded = (event: Event) => { if ((event.target as Element)?.matches?.("link[rel=stylesheet]")) schedule(); };
  document.addEventListener("load", stylesheetLoaded, true);
  parent.addEventListener("resize", sync);
  parent.addEventListener("pageshow", sync);
  parent.document.addEventListener("fullscreenchange", sync);
  sync(); rewrite();
  let stopped = false;
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    probe.remove(); observer.disconnect(); if (scheduled) window.cancelAnimationFrame(scheduled);
    document.removeEventListener("load", stylesheetLoaded, true);
    parent.removeEventListener("resize", sync); parent.removeEventListener("pageshow", sync);
    parent.document.removeEventListener("fullscreenchange", sync);
    window.removeEventListener("pagehide", onHide);
  };
  function onHide(event: PageTransitionEvent) { if (!event.persisted) cleanup(); }
  window.addEventListener("pagehide", onHide);
  return cleanup;
}
