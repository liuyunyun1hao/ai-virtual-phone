import { buildGroupChatPromptMessages } from "./group-chat-engine";
import { sendLLMStreamRequest } from "./chat-engine";
import { getCurrentIdentityId } from "./identity-runtime";
import { loadChatSessions, type ChatSession, type ChatMessage } from "./chat-storage";
import { DRAWING_BRUSH_RULES, drawingObjectStream, parseDrawingStroke, strokeLength, DRAWING_TURN_MAX_LENGTH, DRAWING_TURN_MAX_STROKES, type DrawingStroke, type DrawingComment } from "./chat-drawing";

export function groupDrawingRules(painterIds: string[], members: { id: string; name: string }[]): string {
    return `这是群聊画板回合。群历史中各人的发言保持原作者，不是同一角色的经历。用户刚停笔。成员：${JSON.stringify(members)}。拿笔顺序：${JSON.stringify(painterIds)}。${painterIds.length ? "仅名单内角色可画，按顺序完成各自一轮，再交回用户；不能冒用其他作者。" : "本轮仅用户画，所有角色只旁观，不能输出笔迹。"}
全体成员均可按性格、关系、话题和画面选择评论或沉默，不必全员开口，不强制夸奖或吐槽。一次决定本轮发言者及顺序，按该顺序输出；每人最多2句，每句100字以内。不得替用户说话。评论与拿笔资格独立。
仅输出连续JSON对象：评论为 {"type":"comment","authorId":"成员ID","text":"话语"}；笔迹沿用下述坐标协议并必须带authorId，不使用聊天标记/工具/状态栏。每位画者最多${DRAWING_TURN_MAX_STROKES}笔；所有对象结束输出 {"type":"done"}，允许无人评论。画板是当前快照，不是实时视频。已有笔迹不重画。
每位画者自主表达一个小创作意图，用相关笔触添一个可辨的小元素，不替用户完成全图、不敷衍凑笔。画板600×800。笔迹格式：{"type":"stroke","authorId":"成员ID","intent":"这一笔的意图","brush":"pen","color":"#428e70","width":4,"opacity":1,"points":[[200,200,0.5],[230,210,0.6]]}。
brush可选pen/pencil/watercolor，color为六位十六进制，width为1至80画板像素，opacity为0.05至1；points为2至80个[x,y,压力0.1至1]，坐标在画板内，抬笔换对象。每笔最多750像素，每位画者路径总长最多${DRAWING_TURN_MAX_LENGTH}像素。${DRAWING_BRUSH_RULES} 每条笔迹明确填写brush、width、opacity，数值字段使用JSON数字。笔迹不附comment，评论单独标注作者。若某位画者明确选择不画，可输出{"type":"skip","authorId":"该画者ID"}交棒。`;
}

/** Per-author budgets and monotonic pen ownership are enforced independently of model output. */
export function groupDrawingStream(painterIds: string[], memberIds: string[], signal: AbortSignal,
    onStroke: (stroke: DrawingStroke) => Promise<void>, onComment: (authorId: string, text: string) => Promise<void>) {
    let current = -1;
    const skipped = new Set<string>();
    const counts = new Map<string, number>(), lengths = new Map<string, number>(), comments = new Map<string, number>();
    return drawingObjectStream(async value => {
        if (signal.aborted) throw signal.reason;
        const data = value as Record<string, unknown>;
        const author = typeof data.authorId === "string" ? data.authorId : "";
        if (!memberIds.includes(author)) return;
        if (data.type === "comment") {
            if (typeof data.text !== "string" || !data.text.trim() || (comments.get(author) || 0) >= 2) return;
            comments.set(author, (comments.get(author) || 0) + 1);
            await onComment(author, data.text.trim().slice(0, 100)); return;
        }
        const index = painterIds.indexOf(author);
        if (index < 0 || index < current || index > current + 1 || skipped.has(author)) return;
        if (data.type === "skip") { current = index; skipped.add(author); return; }
        if ((counts.get(author) || 0) >= DRAWING_TURN_MAX_STROKES) return;
        const stroke = parseDrawingStroke(data, author, Date.now() + (counts.get(author) || 0));
        if (!stroke) return;
        const length = (lengths.get(author) || 0) + strokeLength(stroke.points);
        if (length > DRAWING_TURN_MAX_LENGTH) return;
        current = index; counts.set(author, (counts.get(author) || 0) + 1); lengths.set(author, length);
        await onStroke(stroke);
    });
}

export async function requestGroupDrawingRound(args: { session: ChatSession; painterIds: string[]; history: ChatMessage[];
    image: string; strokes: DrawingStroke[]; comments: DrawingComment[]; signal: AbortSignal;
    onStroke: (stroke: DrawingStroke) => Promise<void>; onComment: (authorId: string, name: string, text: string) => Promise<void> }) {
    const identity = getCurrentIdentityId();
    const current = () => {
        if (args.signal.aborted) throw args.signal.reason;
        const live = loadChatSessions().find(s => s.id === args.session.id);
        if (identity !== getCurrentIdentityId() || !live?.isGroup || live.isSpectator || JSON.stringify(live.participantIds) !== JSON.stringify(args.session.participantIds)) throw new Error("身份或群成员已变化，请重新打开画板。");
    };
    current();
    const context = await buildGroupChatPromptMessages(args.session, args.history.slice(-40), { disableTools: true, appTags: ["group_chat", "chat-drawing"] });
    current();
    if (!context.config.enableImageRecognition) throw new Error("请在群聊模型设置中开启图片识别，并使用支持识图的模型。");
    const members = [...context.nameToId].map(([name, id]) => ({ id, name }));
    const painters = [...new Set(args.painterIds)].filter(id => members.some(m => m.id === id));
    const controller = new AbortController();
    const abort = () => controller.abort(args.signal.reason);
    args.signal.addEventListener("abort", abort, { once: true });
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(new Error("画板回应等待超时，已保留完成的部分。")), 30000); };
    const push = groupDrawingStream(painters, members.map(m => m.id), controller.signal,
        async stroke => { current(); clearTimeout(timer); await args.onStroke(stroke); current(); arm(); },
        async (id, text) => { current(); clearTimeout(timer); await args.onComment(id, members.find(m => m.id === id)!.name, text); current(); arm(); });
    let detach = () => {};
    const stopped = new Promise<never>((_, reject) => { const listener = () => reject(controller.signal.reason); controller.signal.addEventListener("abort", listener, { once: true }); detach = () => controller.signal.removeEventListener("abort", listener); });
    try {
        arm();
        const record = args.strokes.slice(-24).map(({ author, intent, color, width, brush, opacity, points }) => ({ authorId: author, authorName: author === "user" ? context.userName : members.find(m => m.id === author)?.name || "已离群成员", intent, color, width, brush: brush || "pen", opacity: opacity ?? 1, points: points.filter((_, i) => i % Math.max(1, Math.ceil(points.length / 12)) === 0) }));
        await Promise.race([sendLLMStreamRequest(context.config, context.preset, [...context.llmMessages,
            { role: "system", content: groupDrawingRules(painters, members) },
            { role: "user", content: [{ type: "text", text: JSON.stringify({ strokes: record, comments: args.comments.slice(-12) }) }, { type: "image_url", image_url: { url: args.image } }] },
        ], [], { userName: context.userName, characterName: args.session.groupName || "群聊画板" },
        { signal: controller.signal, skipOutputRegex: true, skipTimestampStrip: true, appId: "chat-drawing", debugSessionId: args.session.id }, { onDelta: push }), stopped]);
    } finally { clearTimeout(timer!); detach(); args.signal.removeEventListener("abort", abort); controller.abort(); }
}
