/** FLIP: DOM order is already committed, but the first painted position stays
 * exactly where the finger left each row. Returns cancellation for unmount/regrab.
 */
export function settleMenuRows(rows: HTMLElement[], before: Map<HTMLElement, number>, reduceMotion: boolean) {
    const animations: Animation[] = [];
    rows.forEach(row => {
        const previous = before.get(row), rect = row.getBoundingClientRect();
        const scale = row.offsetHeight ? rect.height / row.offsetHeight : 1;
        const delta = previous === undefined ? 0 : (previous - rect.top) / (scale || 1);
        const clear = () => { row.style.removeProperty('transition'); row.removeAttribute('data-settling'); };
        if (reduceMotion || Math.abs(delta) < .5 || typeof row.animate !== 'function') { clear(); return; }
        const animation = row.animate([
            { transform: `translate3d(0,${delta}px,0)` },
            { transform: 'translate3d(0,0,0)' },
        ], { duration: 220, easing: 'cubic-bezier(.22,.8,.25,1)' });
        animations.push(animation);
        animation.onfinish = clear;
        animation.oncancel = clear;
    });
    return () => animations.forEach(animation => animation.cancel());
}
