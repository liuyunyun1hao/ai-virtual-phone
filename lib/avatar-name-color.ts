export const DEFAULT_AVATAR_NAME_COLOR = "#8e8e93";

/** Dominant chromatic family, rather than the often black/white background. */
export function pickAvatarNameColor(pixels: ArrayLike<number>, bubble = false): string {
    const bins = Array.from({ length: 24 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
    let visible = 0;
    const total = [0,0,0];
    let chromatic = 0;
    for (let i = 0; i + 3 < pixels.length; i += 4) {
        if (pixels[i + 3] < 128) continue;
        visible++;
        const r = pixels[i] / 255, g = pixels[i + 1] / 255, b = pixels[i + 2] / 255;
        total[0]+=r; total[1]+=g; total[2]+=b;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
        if (delta < .065 || max < .12 || min > .9) continue;
        chromatic++;
        let hue = max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
        hue *= 60;
        const bin = bins[Math.round(hue / 15) % 24];
        const weight = .5 + delta; // Area wins; saturation only gently breaks ties.
        bin.weight += weight;
        bin.r += r * weight; bin.g += g * weight; bin.b += b * weight;
    }
    if (!visible) return DEFAULT_AVATAR_NAME_COLOR;
    if (chromatic / visible < .025) return bubble ? `rgb(${total.map(c=>Math.round(c/visible*255)).join(", ")})` : DEFAULT_AVATAR_NAME_COLOR;
    const bin = bins.reduce((best, item) => item.weight > best.weight ? item : best);
    const r = bin.r / bin.weight, g = bin.g / bin.weight, b = bin.b / bin.weight;
    if (bubble) return `rgb(${[r,g,b].map(c=>Math.round(c*255)).join(", ")})`;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    const lightness = (max + min) / 2;
    const saturation = Math.min(.48, Math.max(.2, delta / (1 - Math.abs(2 * lightness - 1))));
    const hue = (max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) / 6;
    // Consistent muted ink, with at least 4.5:1 contrast against white.
    for (let l = .43; l >= .2; l -= .01) {
        const a = saturation * Math.min(l, 1 - l);
        const channel = (n: number) => {
            const k = (n + hue * 12) % 12;
            return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
        };
        const rgb = [channel(0), channel(8), channel(4)];
        const linear = rgb.map(v => v / 255 <= .04045 ? v / 255 / 12.92 : ((v / 255 + .055) / 1.055) ** 2.4);
        if (1.05 / (.2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2] + .05) >= 4.5) {
            return `rgb(${rgb.join(", ")})`;
        }
    }
    return DEFAULT_AVATAR_NAME_COLOR;
}

const cache = new Map<string, Promise<string>>();

export function extractAvatarNameColor(src: string, bubble = false): Promise<string> {
    if (typeof window === "undefined" || !src) return Promise.resolve(DEFAULT_AVATAR_NAME_COLOR);
    const cacheKey = `${bubble ? "bubble:" : "name:"}${src}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const result = new Promise<string>(resolve => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        let settled = false;
        const finish = (color: string) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            img.onload = img.onerror = null;
            resolve(color);
        };
        const timer = setTimeout(() => finish(DEFAULT_AVATAR_NAME_COLOR), 8000);
        img.onerror = () => finish(DEFAULT_AVATAR_NAME_COLOR);
        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = canvas.height = 40;
                const ctx = canvas.getContext("2d", { willReadFrequently: true });
                if (!ctx) return finish(DEFAULT_AVATAR_NAME_COLOR);
                // Match the avatar's centered, circular object-cover crop.
                const side = Math.min(img.naturalWidth, img.naturalHeight);
                ctx.beginPath(); ctx.arc(20, 20, 20, 0, Math.PI * 2); ctx.clip();
                ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 40, 40);
                finish(pickAvatarNameColor(ctx.getImageData(0, 0, 40, 40).data, bubble));
            } catch {
                finish(DEFAULT_AVATAR_NAME_COLOR);
            }
        };
        img.src = src;
    });
    // Bound data-URL retention; one request shared by all messages of an avatar.
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, result);
    return result;
}
