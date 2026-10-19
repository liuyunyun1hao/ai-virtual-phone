/** CSS-pixel thresholds, independent of device pixel ratio. */
export const BACK_EDGE_WIDTH = 24;
export function backSwipeIntent(dx: number, dy: number): "pending" | "back" | "cancel" {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return "pending";
    return dx > 0 && dx > Math.abs(dy) * 1.6 ? "back" : "cancel";
}
export function backSwipeDistance(width: number) {
    return Math.max(72, Math.min(120, width * .24));
}
export function shouldFinishBackSwipe(dx: number, dy: number, width: number, elapsed: number) {
    return elapsed > 0 && elapsed < 2500 && dx > Math.abs(dy) * 1.6 &&
        (dx >= backSwipeDistance(width) || (dx >= 48 && elapsed <= 300 && dx / elapsed >= .5));
}

/** Use the actual exposed back control: this preserves nested-page/save guards.
 * Hit testing excludes controls behind sheets and hidden/covered app screens.
 */
export function findExposedBackButton(root: HTMLElement): HTMLButtonElement | null {
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>(
        'button.page-back-btn, button.imessage-header-back, button[data-edge-back], button[aria-label="返回"]'
    ));
    return buttons.reverse().find(button => {
        if (button.getAttribute('data-edge-back') === 'off') return false;
        if (button.disabled || button.closest('[inert], [aria-hidden="true"]')) return false;
        const r = button.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        const hit = root.ownerDocument.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!hit && button.contains(hit);
    }) ?? null;
}

export function installEdgeSwipeBack(root: HTMLElement, feedback: (progress: number, y: number) => void) {
    let gesture: { id: number; x: number; y: number; time: number; width: number; back: HTMLButtonElement; locked: boolean } | null = null;
    let suppressClickUntil = 0;
    const reset = () => { gesture = null; feedback(0, 0); };
    const start = (event: TouchEvent) => {
        reset();
        if (event.touches.length !== 1) return;
        const target = event.target;
        if (!(target instanceof Element) || target.closest('input, textarea, select, [contenteditable="true"], [data-edge-swipe="off"], canvas, iframe, video')) return;
        if (root.ownerDocument.getSelection()?.toString()) return;
        const touch = event.touches[0], rect = root.getBoundingClientRect();
        if (touch.clientX < rect.left || touch.clientX > rect.left + BACK_EDGE_WIDTH) return;
        const back = findExposedBackButton(root);
        if (!back) return;
        gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, time: event.timeStamp, width: rect.width, back, locked: false };
    };
    const move = (event: TouchEvent) => {
        if (!gesture) return;
        if (event.touches.length !== 1) { reset(); return; }
        const touch = Array.from(event.touches).find(t => t.identifier === gesture?.id);
        if (!touch) { reset(); return; }
        const dx = touch.clientX - gesture.x, dy = touch.clientY - gesture.y;
        if (!gesture.locked) {
            const intent = backSwipeIntent(dx, dy);
            if (intent === 'cancel') { reset(); return; }
            if (intent === 'pending') return;
            gesture.locked = true;
        }
        if (!event.cancelable) { reset(); return; }
        event.preventDefault();
        event.stopPropagation();
        feedback(Math.max(0, Math.min(1, dx / backSwipeDistance(gesture.width))), gesture.y - root.getBoundingClientRect().top);
    };
    const end = (event: TouchEvent) => {
        const current = gesture;
        const touch = current && Array.from(event.changedTouches).find(t => t.identifier === current.id);
        reset();
        if (!current || !touch || event.touches.length || !current.locked) return;
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        suppressClickUntil = Date.now() + 400;
        if (shouldFinishBackSwipe(touch.clientX - current.x, touch.clientY - current.y, current.width, event.timeStamp - current.time)
            && current.back.isConnected && findExposedBackButton(root) === current.back) {
            // Programmatic click retains the existing confirmation/save semantics.
            current.back.click();
        }
    };
    const click = (event: MouseEvent) => {
        if (event.isTrusted && Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
    };
    root.addEventListener('touchstart', start, { passive: true, capture: true });
    root.addEventListener('touchmove', move, { passive: false, capture: true });
    root.addEventListener('touchend', end, { passive: false, capture: true });
    root.addEventListener('touchcancel', reset, true);
    root.addEventListener('click', click, true);
    return () => {
        root.removeEventListener('touchstart', start, true);
        root.removeEventListener('touchmove', move, true);
        root.removeEventListener('touchend', end, true);
        root.removeEventListener('touchcancel', reset, true);
        root.removeEventListener('click', click, true);
        reset();
    };
}
