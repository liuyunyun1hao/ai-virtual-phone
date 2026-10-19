/** Shared portrait board coordinates. Stored strokes are data, never model SVG/code. */
export const DRAWING_SIZE = { width: 600, height: 800 };
export const DRAWING_PALETTE = ["#191919", "#e94857", "#eab63c", "#428e70", "#347bc1", "#9861b0"];
export const DRAWING_WIDTHS = [2, 4, 8];
export const DRAWING_MAX_WIDTH = 80;
export const DRAWING_TURN_MAX_STROKES = 6;
export const DRAWING_TURN_MAX_LENGTH = 1800;
export type DrawingBrush = "pen" | "pencil" | "watercolor";
export type DrawingPoint = [number, number, number];
export type DrawingStroke = { id: string; author: string; color: string; width: number; brush?: DrawingBrush; opacity?: number; points: DrawingPoint[]; intent?: string; seed: number };
export type DrawingComment = { author: string; name: string; text: string; atStroke?: number; createdAt?: number };
export type DrawingSnapshot = { version: 1; createdAt: number; mode: "solo" | "together"; painterIds?: string[]; strokes: DrawingStroke[]; comments: DrawingComment[] };
export type DrawingDraft = { strokes: DrawingStroke[]; mode: "solo" | "together"; characterId: string; painterIds?: string[]; comments?: DrawingComment[] };
export const DRAWING_BRUSH_RULES = `默认参考用户近期实际落笔的brush、width和opacity，选择相近的笔刷、粗细与透明度，使新增笔迹与画面协调。用户近期混用笔触时，参考与你要衔接的局部相近的笔迹。只有具体创作意图需要刻画细节、铺色或有意对比时才调整，并在intent中简短记录原因。没有用户笔迹可参考时，按画面和创作意图选择。示例参数仅说明格式，不是默认笔触；不要无理由回到固定细笔。`;
export const DRAWING_COMMENT_RULES = `你可以结合角色性格、聊天上下文及实际画板，简短吐槽、互动、猜测或欣赏，不必每次夸奖。不知道用户画什么时用猜测口吻，不编造确定意图，不替用户回答。每轮最多2句，每句不超过100字。评论用独立JSON对象 {"type":"comment","text":"角色说的话"}；也可在笔迹对象加comment字符串，在落笔时说。只输出协议JSON，不输出思考过程。不要重复上一轮评论。`;
export const DRAWING_WATCH_RULES = `这是单人绘画旁观回合：只有用户画画，你只看，不落笔、不输出points、不能改变画板。用户停笔后发来当前画板快照，你作一句简短评论或猜测，再让用户继续画。不是实时视频，不声称看到了快照之外的动作。用户此时不能打字，不要求其先回答才能继续。${DRAWING_COMMENT_RULES}`;
export const DRAWING_RULES = `你正在与用户轮流共画。这是一段共同创作的过程，不是一次性完成任务。
看当前白板图片、用户这一轮的落笔和上下文，自主决定添什么。每轮表达一个创作意图，而不是把“一笔”理解为一条短线。可以用一组相关笔触添一个小元素、丰富已有形状、铺一块颜色、画一点纹理，或做一个俏皮的改造。按想法需要选择笔迹数量，不必凑满上限。
不要敷衍地只划一条无意义短横线，也绝不能替用户画完整个物体、补完所有空白或重画全图。
例如用户只画了苹果蒂，你可以添一片有轮廓、叶脉和浅色晕染的叶子，或把蒂俏皮地变成小天线；这些相关笔触服务同一个想法。不能一轮把整个苹果、叶子和全部阴影画完。例子不是指定画苹果，也不是限制只能添叶子。
保持角色性格与绘画水平，允许犹豫、轻微不对称和不规则弧线。表达局部想法而非机械几何。留空间给对方下一轮。
${DRAWING_BRUSH_RULES}
结合角色性格、关系、上下文和眼前画面决定添什么。共同画笔色板为${DRAWING_PALETTE.join("、")}，也可自行选择其他颜色。每条JSON写出实际brush、color、width、opacity，数值字段使用JSON数字；intent简短记录本条实际添什么，相关笔迹服务同一个创作意图，把后续发展留给用户。
画板为600×800竖屏白纸，x向右、y向下。每条笔迹输出一个独立JSON对象，换行分隔，不用Markdown、不输出SVG，不调用其他聊天动作。
格式：{"intent":"给叶子勾不规则边缘，细铅笔轻压","brush":"pencil","color":"#428e70","width":4,"opacity":0.8,"comment":"我给它长片歪叶子，再铺一点水彩。","points":[[100,200,0.4],[103,204,0.6],[110,210,0.5]]}
每笔还可指定brush（pen原手绘线条、pencil颗粒铅笔、watercolor柔边水彩）和opacity（0.05到1，越小越透明）。你和用户使用相同工具，颜色可自由选任意#RRGGBB，width为1到${DRAWING_MAX_WIDTH}画板像素：细笔勾线，宽笔铺色；水彩本身有半透明叠色质感。比如{"brush":"watercolor","color":"#ed739b","width":40,"opacity":0.35,"intent":"添一小块粉色晕染","points":[[200,200,0.5],[230,210,0.6]]}。
points每项为[x,y,压力0.1到1]，2到80个点，坐标必须在画板内。每条笔迹连续落笔，不要跨越远距离连线；抬笔就换下一个JSON对象。用户可能连续画了多笔才交棒，结合整块画板而非只看最后一条。
整轮总路径长度最多${DRAWING_TURN_MAX_LENGTH}画板像素，最多${DRAWING_TURN_MAX_STROKES}条笔迹，每条仍最多750像素。上限只是防止一轮霸占画板，不是目标；允许想法完整可辨，但不把整幅画做完。先尽快输出第一条实际笔迹，别先输出长篇计划。第一条笔迹的comment用角色口吻简短说明这一轮想添什么，可顺带说有意义的换笔/配色选择，不必机械报参数；后续可有一句互动，不必每笔解释。只画本轮新增笔迹，已有的不要重复。
${DRAWING_COMMENT_RULES} 共画时可以边画边说，将comment附在笔迹对象上更合适；评论不能代替本轮落笔，也别用长篇评论拖延落笔。`;

export function strokeLength(points: DrawingPoint[]) {
    return points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
}

export function parseDrawingStroke(value: unknown, author: string, seed: number): DrawingStroke | null {
    if (!value || typeof value !== "object") return null;
    const d = value as Record<string, unknown>;
    if (!Array.isArray(d.points) || d.points.length < 2 || d.points.length > 80) return null;
    const points: DrawingPoint[] = [];
    for (const p of d.points) {
        if (!Array.isArray(p) || p.length < 2 || typeof p[0] !== "number" || typeof p[1] !== "number" || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
        if (p[0] < 0 || p[0] > 600 || p[1] < 0 || p[1] > 800) return null;
        const pressure = typeof p[2] === "number" && Number.isFinite(p[2]) ? Math.max(.1, Math.min(1, p[2])) : .5;
        points.push([p[0], p[1], pressure]);
    }
    if (strokeLength(points) < 2 || strokeLength(points) > 750) return null;
    return { id: `char-${seed}`, author, seed, points,
        color: typeof d.color === "string" && /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : "#191919",
        width: typeof d.width === "number" && Number.isFinite(d.width) ? Math.max(1, Math.min(DRAWING_MAX_WIDTH, d.width)) : 3,
        brush: d.brush === "pencil" || d.brush === "watercolor" ? d.brush : "pen",
        opacity: typeof d.opacity === "number" && Number.isFinite(d.opacity) ? Math.max(.05, Math.min(1, d.opacity)) : 1,
        intent: typeof d.intent === "string" ? d.intent.slice(0, 200) : "添了一处局部笔迹" };
}

/** Incremental balanced-object parser: whitespace/reasoning never counts as ink. */
export function drawingObjectStream(onObject: (data: unknown) => Promise<void>) {
    let buffer = "", depth = 0, quoted = false, escaped = false, total = 0;
    return async (chunk: string) => {
        total += chunk.length;
        if (total > 24000) throw new Error("这轮绘图内容过长，已停止。");
        for (const ch of chunk) {
            if (!depth) { if (ch === "{") { depth = 1; buffer = ch; } continue; }
            buffer += ch;
            if (quoted) { if (escaped) escaped = false; else if (ch === "\\") escaped = true; else if (ch === '"') quoted = false; }
            else if (ch === '"') quoted = true;
            else if (ch === "{") depth++;
            else if (ch === "}" && --depth === 0) {
                let data: unknown;
                try { data = JSON.parse(buffer); } catch { data = null; }
                buffer = "";
                if (data) await onObject(data);
            }
        }
    };
}

/** Deterministic pen rendering: speed/pressure width, tapered ends, tiny seeded
 * deviations for model points. No random values are created during repaint. */
function renderStroke(ctx: CanvasRenderingContext2D, stroke: DrawingStroke) {
    const points = stroke.points;
    if (!points.length) return;
    if (stroke.brush === "pencil" || stroke.brush === "watercolor") {
        // Arc-length sampling is independent of pointer-event density. A fixed seed
        // keeps grain stationary during replay, animation and draft reopening.
        let rng = stroke.seed | 0;
        const random = () => { rng = Math.imul(rng, 1664525) + 1013904223 | 0; return (rng >>> 0) / 4294967296; };
        const pencil = stroke.brush === "pencil";
        const spacing = pencil ? Math.max(.8, stroke.width * .14) : Math.max(1, stroke.width * .16);
        const stamp = (x: number, y: number, pressure: number) => {
            const r = stroke.width * (.3 + pressure * .3);
            if (pencil) {
                ctx.fillStyle = stroke.color;
                const grains = Math.min(65, Math.max(5, Math.round(stroke.width * 1.5)));
                for (let i = 0; i < grains; i++) {
                    const angle = random() * Math.PI * 2, distance = Math.sqrt(random()) * r;
                    ctx.globalAlpha = .12 + random() * .38 * pressure;
                    ctx.beginPath(); ctx.ellipse(x + Math.cos(angle)*distance, y + Math.sin(angle)*distance, .3 + random()*.55, .2 + random()*.35, angle, 0, Math.PI*2); ctx.fill();
                }
            } else {
                const radius = Math.max(.6, r * (.94 + random()*.12));
                const wash = ctx.createRadialGradient(x,y,0,x,y,radius);
                wash.addColorStop(0, stroke.color); wash.addColorStop(.7, stroke.color + "cc"); wash.addColorStop(1, stroke.color + "00");
                ctx.fillStyle = wash; ctx.globalAlpha = .09 + pressure*.05;
                ctx.beginPath(); ctx.arc(x,y,radius,0,Math.PI*2); ctx.fill();
            }
        };
        stamp(...points[0]);
        let carry = spacing;
        for (let i=1; i<points.length; i++) {
            const a=points[i-1], b=points[i], length=Math.hypot(b[0]-a[0],b[1]-a[1]);
            for (; carry<=length; carry+=spacing) { const t=carry/length; stamp(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t); }
            carry-=length;
        }
        ctx.globalAlpha = 1;
    } else {
        ctx.strokeStyle = stroke.color; ctx.fillStyle = stroke.color;
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        if (points.length === 1) { ctx.beginPath(); ctx.arc(points[0][0], points[0][1], stroke.width / 2, 0, Math.PI * 2); ctx.fill(); return; }
        const jitter = (i: number, channel: number) => stroke.author === "user" ? 0 : Math.sin(stroke.seed * .13 + i * 1.73 + channel * 2.4) * .45;
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1], b = points[i];
            const speed = Math.min(1, Math.hypot(b[0] - a[0], b[1] - a[1]) / 20);
            const taper = Math.min(1, .6 + i / 4, .65 + (points.length - i) / 4);
            ctx.lineWidth = stroke.width * (.55 + b[2] * .7 - speed * .12) * taper;
            ctx.beginPath(); ctx.moveTo(a[0] + jitter(i - 1, 0), a[1] + jitter(i - 1, 1));
            ctx.lineTo(b[0] + jitter(i, 0), b[1] + jitter(i, 1)); ctx.stroke();
        }
    }
}

// Two reusable surfaces per board, not one full-size bitmap per historical stroke.
const boardSurfaces = new WeakMap<HTMLCanvasElement, { base: HTMLCanvasElement; ink: HTMLCanvasElement; prefix: DrawingStroke[]; lengths: number[] }>();
export function drawBoard(canvas: HTMLCanvasElement, strokes: DrawingStroke[]) {
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    let cache = boardSurfaces.get(canvas);
    if (!cache) {
        const surface = () => { const c = canvas.ownerDocument.createElement("canvas"); c.width=600; c.height=800; return c; };
        cache = { base:surface(), ink:surface(), prefix:[], lengths:[] }; boardSurfaces.set(canvas, cache);
    }
    const base = cache.base.getContext("2d")!, ink = cache.ink.getContext("2d")!;
    const composite = (target: CanvasRenderingContext2D, stroke: DrawingStroke) => {
        ink.clearRect(0,0,600,800); renderStroke(ink,stroke);
        target.save(); target.globalAlpha=stroke.opacity ?? 1; target.drawImage(cache!.ink,0,0); target.restore();
    };
    const prefix = strokes.slice(0,-1);
    if (cache.prefix.length > prefix.length || cache.prefix.some((s,i) => s !== prefix[i] || s.points.length !== cache!.lengths[i])) {
        cache.prefix=[]; cache.lengths=[]; base.clearRect(0,0,600,800);
    }
    for (let i=cache.prefix.length;i<prefix.length;i++) { composite(base,prefix[i]); cache.prefix.push(prefix[i]); cache.lengths.push(prefix[i].points.length); }
    ctx.save(); ctx.setTransform(canvas.width/600,0,0,canvas.height/800,0,0);
    ctx.fillStyle="#fff"; ctx.fillRect(0,0,600,800); ctx.drawImage(cache.base,0,0);
    if (strokes.length) composite(ctx,strokes[strokes.length-1]);
    ctx.restore();
}

export function drawingSummary(strokes: DrawingStroke[], names: Record<string, string>) {
    const turns = strokes.filter(s => s.author !== "user");
    const recent = strokes.slice(-12).map(s => `${s.author === "user" ? "用户" : names[s.author] || "角色"}使用${s.brush || "pen"}，颜色${s.color}，粗细${s.width}，不透明度${Math.round((s.opacity ?? 1)*100)}%${s.intent ? `，${s.intent}` : ""}`).join("；");
    return `绘图作品。用户画了${strokes.filter(s => s.author === "user").length}笔，角色画了${turns.length}笔。${turns.length ? "共同绘制。" : "由用户独自绘制。"}近期绘画过程：${recent}。请以所附最终画板快照为准，不要将猜测的评论当作用户确认的画意。`;
}
