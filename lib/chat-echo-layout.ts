/** Keep the approved short-message effect; reduce visual coverage for larger bubbles. */
export function echoLayout(text: string, width: number, height: number) {
    const length = Array.from(text.trim()).length;
    const cost = Math.max(1, length / 36, width * height / 14000, height / 70);
    return {
        count: Math.max(28, Math.round(144 / Math.sqrt(cost))),
        scale: Math.min(Math.max(.35, Math.pow(cost, -.3)), 180 / Math.max(1, height)),
    };
}
