export type BubbleColors = {
    user?: string; userOpacity?: number; userText?: string; userTextOpacity?: number;
    charMode?: "classic" | "auto" | "manual";
    char?: string; charOpacity?: number; charText?: string; charTextOpacity?: number;
};
export const BUBBLE_COLORS_EVENT = "chat-bubble-colors-updated";
export function validColor(v?: string) { return v && /^#[\da-f]{6}$/i.test(v) ? v : undefined; }
export function rgb(color: string) { return color.startsWith("rgb") ? (color.match(/[\d.]+/g) || []).slice(0, 3).map(Number) : [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)); }
export function hex(channels: number[]) { return "#" + channels.map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join(""); }
export function mix(base: string, color: string, weight: number) { const a = rgb(base), b = rgb(color); return hex(a.map((n, i) => n * (1 - weight) + b[i] * weight)); }
export function ink(bg: string) {
    const [r, g, b] = rgb(bg).map(n => { const c = n / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
    return .2126 * r + .7152 * g + .0722 * b > .179 ? "#101012" : "#ffffff";
}
export function alpha(color: string, opacity = 1) {
    const amount = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
    return amount === 1 ? color : `rgba(${rgb(color).join(", ")}, ${amount})`;
}
/** Preserve avatar hue, not its exposure: bright white-based pastels by day. */
export function avatarBubblePalette(sample: string, dark: boolean) {
    const [r,g,b] = rgb(sample).map(c=>c/255);
    const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
    const h=d===0?0:(max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4)/6;
    const rawS=d===0?0:d/(1-Math.abs(max+min-1));
    const sourceL=(max+min)/2;
    // Do not flatten navy, ice blue and slate into the same pastel.
    const s=Math.min(.85,rawS*(.78+.12*(1-sourceL))), l=dark ? .16+sourceL*.16 : .38+sourceL*.38;
    const a=s*Math.min(l,1-l);
    const tone=hex([0,8,4].map(n=>{const k=(n+h*12)%12;return 255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)));}));
    // Keep the bubble visibly tied to the avatar. The old very pale wash made
    // distinct avatars converge to nearly the same gray surface.
    const strength=.38+.22*(1-sourceL)+.12*rawS;
    const surface=dark?tone:mix("#ffffff",tone,strength);
    const candidate=dark?mix("#ffffff",tone,.16):mix("#101012",tone,.38);
    const luminance=(color:string)=>rgb(color).map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
    const aLum=luminance(surface),bLum=luminance(candidate);
    const contrast=(Math.max(aLum,bLum)+.05)/(Math.min(aLum,bLum)+.05);
    return { surface, voice:contrast>=4.5?candidate:ink(surface) };
}
export function resolveBubbleColors(config: BubbleColors, dark: boolean, user: boolean, sample?: string) {
    const auto = !user && config.charMode === "auto";
    const userColor = validColor(config.user) || "#38acfc";
    let color = user ? userColor : dark ? "#353539" : "#e9e9eb";
    let customized = user ? !!validColor(config.user) : false;
    if (!user && config.charMode === "manual") { color = validColor(config.char) || color; customized = true; }
    const palette = auto ? avatarBubblePalette(sample || "#a0a0a0",dark) : undefined;
    if (palette) { color = palette.surface; customized = true; }
    // Manual choices are literal: changing the surface must never change text.
    const text = auto ? ink(color) : validColor(user ? config.userText : config.charText) || (user || dark ? "#ffffff" : "#101012");
    const opacity = auto ? 1 : (user ? config.userOpacity : config.charOpacity) ?? 1;
    const textOpacity = auto ? 1 : (user ? config.userTextOpacity : config.charTextOpacity) ?? 1;
    return {
        surface: color, opacity: Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1,
        background: alpha(color, opacity), text: alpha(text, textOpacity),
        voice: palette?.voice || alpha(user || customized ? text : dark ? "#9bd6ff" : userColor, textOpacity),
    };
}
