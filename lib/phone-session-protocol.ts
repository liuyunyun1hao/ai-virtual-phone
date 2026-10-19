export const PHONE_SESSION_REMOUNT_EVENT = "float-phone-session-remount";
export const PHONE_SESSION_MESSAGE = "float-phone-session";
export const PHONE_SESSION_RETIRE_EVENT = "float-phone-session-retire";

/** Only the first-party phone runtime uses this bridge; marketplace frames do not. */
export function phoneSessionParent(): Window | null {
  if (typeof window === "undefined" || window.parent === window) return null;
  try {
    const frame = window.frameElement as HTMLIFrameElement | null;
    return frame?.dataset.phoneSession
      && window.parent.location.origin === window.location.origin ? window.parent : null;
  } catch { return null; }
}

export function requestPhoneSessionRemount(): void {
  const event = new Event(PHONE_SESSION_REMOUNT_EVENT, { cancelable: true });
  // Standalone tools without the phone host keep their existing cold-restart fallback.
  if (window.dispatchEvent(event)) window.location.reload();
}
