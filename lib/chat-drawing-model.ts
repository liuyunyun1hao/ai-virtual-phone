import { buildChatPromptMessages, sendLLMStreamRequest } from "./chat-engine";
import type { ChatSession, ChatMessage } from "./chat-storage";
import { DRAWING_RULES, DRAWING_WATCH_RULES, DRAWING_TURN_MAX_STROKES, DRAWING_TURN_MAX_LENGTH, drawingObjectStream, parseDrawingStroke, strokeLength, type DrawingStroke, type DrawingComment } from "./chat-drawing";

export type DrawingGenerate = (delta: (text: string) => Promise<void>, signal: AbortSignal) => Promise<unknown>;

/** Separated from transport so races/timeout can be tested without any paid call. */
export async function runDrawingTurn(generate: DrawingGenerate, author: string, signal: AbortSignal,
    onStroke: (stroke: DrawingStroke) => Promise<void>, timeoutMs = 20000,
    interaction: { mode?: "solo" | "together"; onComment?: (text: string) => void } = {}) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let count = 0, length = 0;
    let comments = 0;
    const watch = interaction.mode === "solo";
    const done = new Error("drawing-creative-turn-complete");
    const abort = () => controller.abort(signal.reason || new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(new Error(watch ? "20 秒内没有收到评论，现在轮到你继续画。" : count ? "角色后续笔迹等待超时，本轮已停止，已画的部分保留。" : "20 秒内没有收到有效笔迹，本轮已停止。现在轮到你。")), timeoutMs); };
    const push = drawingObjectStream(async value => {
        if (controller.signal.aborted) throw controller.signal.reason;
        const data = value as Record<string, unknown>;
        const comment = data?.type === "comment" ? data.text : data?.comment;
        if (typeof comment === "string" && comment.trim() && comments < 2) {
            comments++; interaction.onComment?.(comment.trim().slice(0, 200));
            if (watch) { controller.abort(done); throw done; }
        }
        if (watch || data?.type === "comment") return; // spectator can never paint
        const stroke = parseDrawingStroke(value, author, Date.now() + count);
        if (!stroke) return;
        if (length + strokeLength(stroke.points) > DRAWING_TURN_MAX_LENGTH) {
            if (count) { controller.abort(done); throw done; }
            return;
        }
        clearTimeout(timer); // actual ink, not text/reasoning/keepalive, wins the timeout
        count++; length += strokeLength(stroke.points);
        await onStroke(stroke);
        if (controller.signal.aborted) throw controller.signal.reason;
        if (count >= DRAWING_TURN_MAX_STROKES) { controller.abort(done); throw done; }
        arm();
    });
    let detach = () => {};
    const aborted = new Promise<never>((_, reject) => {
        const listener = () => reject(controller.signal.reason);
        controller.signal.addEventListener("abort", listener, { once: true });
        detach = () => controller.signal.removeEventListener("abort", listener);
        if (controller.signal.aborted) listener();
    });
    try {
        arm();
        await Promise.race([generate(push, controller.signal), aborted]);
        if (!count) throw new Error(watch ? "角色没有返回有效评论，现在轮到你继续画。" : "角色没有返回可绘制的笔迹。现在轮到你。");
    } catch (error) {
        if (controller.signal.reason !== done) throw controller.signal.aborted ? controller.signal.reason : error;
    } finally {
        clearTimeout(timer); detach(); signal.removeEventListener("abort", abort);
        if (!controller.signal.aborted) controller.abort();
    }
}

export function requestDrawingTurn(args: { session: ChatSession; characterId: string; history: ChatMessage[];
    image: string; strokes: DrawingStroke[]; signal: AbortSignal; onStroke: (stroke: DrawingStroke) => Promise<void>;
    mode?: "solo" | "together"; comments?: DrawingComment[]; onComment?: (text: string) => void }) {
    if (args.session.isGroup) throw new Error("群聊画板必须使用群聊回合，不能作为私聊生成。");
    return runDrawingTurn(async (onDelta, signal) => {
        const context = await buildChatPromptMessages(args.session, args.history.slice(-40));
        if (signal.aborted) throw signal.reason;
        if (!context.config.enableImageRecognition) throw new Error("共画需要在当前聊天模型设置中开启图片识别，并使用支持识图的模型。");
        const record = args.strokes.slice(-16).map(s => ({ author: s.author === "user" ? "用户" : s.author === args.characterId ? context.character.name : "其他参与者", intent: s.intent, color: s.color, width: s.width, brush: s.brush || "pen", opacity: s.opacity ?? 1, points: s.points.filter((_, i) => i % Math.max(1, Math.floor(s.points.length / 12)) === 0).slice(0, 12) }));
        await sendLLMStreamRequest(context.config, context.preset, [
            ...context.llmMessages,
            { role: "system", content: args.mode === "solo" ? DRAWING_WATCH_RULES : DRAWING_RULES },
            { role: "user", content: [{ type: "text", text: `这是当前真实画板。${args.mode === "solo" ? "你只旁观评论，不要画。" : "轮到你表达一个创作意图，用相关笔触把想法画得可辨，也可以边画边吐槽。第一条落笔附一句简短comment说明想添什么；按笔触规则选择参数。不要替用户完成整幅画。"}最近落笔记录（含作者、笔触参数与位置）：${JSON.stringify(record)}。已有笔迹不要重画。最近画板评论：${JSON.stringify((args.comments || []).slice(-8))}` }, { type: "image_url", image_url: { url: args.image } }] },
        ], [], { characterName: context.character.name, userName: context.userIdentity?.name },
        { signal, skipOutputRegex: true, skipTimestampStrip: true, appId: "chat-drawing", debugSessionId: args.session.id }, { onDelta });
    }, args.characterId, args.signal, args.onStroke, 20000, { mode: args.mode, onComment: args.onComment });
}
