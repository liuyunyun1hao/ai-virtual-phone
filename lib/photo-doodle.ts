import type { ChatMessage, ChatPhotoAnnotation } from "./chat-storage";

const colors: Record<string,string> = {红:'#ff3b30',红色:'#ff3b30',粉色:'#f5a8bd',绿色:'#34a768',蓝色:'#007aff',黑色:'#191919',白色:'#ffffff',黄色:'#ffcc00',紫色:'#af52de',青色:'#43898d'};
const color = (v: unknown, fallback: string) => typeof v === 'string' ? colors[v] || (/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(v) ? v : fallback) : fallback;
const number = (v: unknown, fallback: number, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min,Math.min(max,v)) : fallback;
const shapes = new Set(['heart','star','circle','arrow','box','underline']);

/** JSON carries drawing data only, never arbitrary SVG markup or executable code. */
export function parsePhotoDoodle(raw: string): NonNullable<ChatMessage['mediaData']> {
    try {
        const data = JSON.parse(raw);
        if (!data || !Array.isArray(data.strokes)) return {};
        const strokes: ChatPhotoAnnotation[] = [];
        for (const item of data.strokes.slice(0, 32)) {
            if (!item || typeof item !== 'object') continue;
            const shape = shapes.has(item.type) ? item.type as ChatPhotoAnnotation['shape'] : undefined;
            // Path coordinates use a 0..100 canvas. Restrict to ordinary path commands/numbers.
            const path = item.type === 'path' && typeof item.path === 'string' && item.path.length <= 4000
                && /^[MmLlHhVvCcSsQqTtAaZz\d\s.,+\-]+$/.test(item.path) && /^[Mm]/.test(item.path.trim()) ? item.path : undefined;
            const text = item.type === 'text' && typeof item.text === 'string' ? item.text.slice(0,80) : undefined;
            if (!shape && !path && !text) continue;
            strokes.push({ id: '', kind: text ? 'text' : 'rough_shape', shape, doodlePath:path, text,
                color:color(item.color,'#191919'), fill:color(item.fill,'none'), opacity:number(item.opacity,1,.05,1),
                width:number(item.width,1,.2,6)/100, x:number(item.x,50,0,100)/100, y:number(item.y,50,0,100)/100,
                size:number(item.size,25,2,100)/100, rotation:number(item.rotation,0,-180,180),
                roughness:number(item.roughness,1.8,.2,4), bowing:1.25,
                description:typeof item.description === 'string' ? item.description.slice(0,160) : undefined });
        }
        if (!strokes.length) return {};
        return { photoMarkStrokes:strokes, photoMarkText:typeof data.intent === 'string' ? data.intent.slice(0,240) : '多笔涂鸦',
            photoMarkTargetIndex: typeof data.photo === 'number' && Number.isFinite(data.photo) ? Math.max(0,Math.floor(data.photo)-1) : undefined };
    } catch { return {}; }
}

export const PHOTO_DOODLE_GUIDANCE = `\n你也能创作多色、多笔涂鸦，不局限于固定形状。使用 [照片涂鸦]{"photo":2,"intent":"在肩膀旁画粉色小花和青色叶子","strokes":[{"type":"heart","x":65,"y":28,"size":20,"color":"#191919","fill":"#f5a8bd","width":1,"opacity":0.9},{"type":"path","path":"M 60 40 Q 72 28 80 42 Q 68 46 60 40 Z","color":"#43898d","width":1.5}]}[/照片涂鸦]。photo 为最近组内第几张（1起算，可省略使用当前首图）；strokes 按从底到顶的顺序叠画，整幅作为一次操作保存。颜色/填色支持十六进制或中文颜色名；不填 fill 表示无填色。width 是图宽百分比（0.2到6），opacity 是0到1。type 支持 heart/star/circle/arrow/box/underline/text/path。形状用中心 x/y、size（图宽百分比）、rotation（度）；text 另写 text 字段。path 可自由组合 M/L/Q/C/Z 曲线，坐标均以整张图片0..100表示，可绘制花瓣、叶片、表情、涂色块、任意轮廓。用多笔与不规则曲线构思你自己的涂鸦，不要照抄例子的内容与位置；视觉不清楚时不要编造看见的细节。每笔可附 description，整幅 intent 记录你的创作意图。通常几笔即可，不需要每次都用满。\n`;
