import {
    loadChatMessages,
    pushChatMessage,
    updateMessageMediaData,
    type ChatMessage,
    type ChatPhotoAnnotation,
} from "./chat-storage";
import rough from "roughjs/bin/rough";

const COLOR_NAMES: Record<string, string> = {
    "#ff3b30": "红色",
    "#ffcc00": "黄色",
    "#34c759": "绿色",
    "#007aff": "蓝色",
    "#ffffff": "白色",
};

function annotationCenter(annotation: ChatPhotoAnnotation): [number, number] {
    if (annotation.kind === "text" || annotation.kind === "rough_shape" || annotation.kind === "emoji") return [annotation.x ?? .5, annotation.y ?? .5];
    const points = annotation.points || [];
    if (points.length < 2) return [.5, .5];
    let x = 0;
    let y = 0;
    let count = 0;
    for (let index = 0; index + 1 < points.length; index += 2) {
        x += points[index];
        y += points[index + 1];
        count += 1;
    }
    return count ? [x / count, y / count] : [.5, .5];
}

function clamp01(value: number): number {
    return Math.max(.025, Math.min(.975, value));
}

function makeShapePoints(kind: "heart" | "star" | "circle" | "arrow", centerX: number, centerY: number): number[] {
    const points: number[] = [];
    let pointIndex = 0;
    const push = (x: number, y: number) => {
        // Deterministic unevenness keeps the SVG editable while avoiding perfect icon geometry.
        const jitterX = Math.sin((pointIndex + 1) * 12.9898) * .0028;
        const jitterY = Math.cos((pointIndex + 1) * 7.233) * .0024;
        pointIndex += 1;
        points.push(clamp01(x + jitterX), clamp01(y + jitterY));
    };
    const traceUnevenEdges = (vertices: Array<[number, number]>, close = true) => {
        const count = close ? vertices.length : vertices.length - 1;
        for (let edge = 0; edge < count; edge += 1) {
            const from = vertices[edge];
            const to = vertices[(edge + 1) % vertices.length];
            const dx = to[0] - from[0];
            const dy = to[1] - from[1];
            const length = Math.max(.001, Math.hypot(dx, dy));
            const normalX = -dy / length;
            const normalY = dx / length;
            for (let step = 0; step < 5; step += 1) {
                const t = step / 5;
                const bow = Math.sin(t * Math.PI) * Math.sin((edge + 1) * 2.17) * .0065;
                push(from[0] + dx * t + normalX * bow, from[1] + dy * t + normalY * bow);
            }
        }
        const last = close ? vertices[0] : vertices[vertices.length - 1];
        push(last[0], last[1]);
    };
    if (kind === "circle") {
        for (let index = 0; index <= 36; index += 1) {
            const angle = (index / 36) * Math.PI * 2;
            const wobble = 1 + Math.sin(index * 2.31) * .035;
            push(centerX + Math.cos(angle) * .135 * wobble, centerY + Math.sin(angle) * .105 * wobble);
        }
    } else if (kind === "heart") {
        for (let index = 0; index <= 48; index += 1) {
            const angle = (index / 48) * Math.PI * 2;
            const x = 16 * Math.sin(angle) ** 3;
            const y = 13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle);
            push(centerX + x * .0085, centerY - y * .0075);
        }
    } else if (kind === "star") {
        const outer = [.133, .112, .139, .118, .128];
        const inner = [.052, .061, .047, .057, .054];
        const angleNudge = [-.035, .018, -.024, .031, -.012, .026, -.029, .015, -.019, .028];
        const vertices = Array.from({ length: 10 }, (_, index): [number, number] => {
            const angle = -Math.PI / 2 + index * Math.PI / 5 + angleNudge[index];
            const radius = index % 2 === 0 ? outer[index / 2] : inner[(index - 1) / 2];
            return [centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius];
        });
        traceUnevenEdges(vertices);
    } else {
        traceUnevenEdges([
            [centerX - .14, centerY + .08],
            [centerX + .1, centerY - .08],
            [centerX + .025, centerY - .095],
            [centerX + .1, centerY - .08],
            [centerX + .07, centerY - .005],
        ], false);
    }
    return points;
}

function resolveAssistantMarkShape(text: string): "heart" | "star" | "circle" | "arrow" | "box" | "underline" | null {
    if (/[❤♥♡💕💗💖]|爱心|心形|红心/.test(text)) return "heart";
    if (/[⭐★☆🌟]|星星|五角星/.test(text)) return "star";
    if (/箭头|指向|指这里/.test(text)) return "arrow";
    if (/方框|框出|框起来|矩形/.test(text)) return "box";
    if (/下划线|划线|强调/.test(text)) return "underline";
    if (/圈|圆圈|圈住|框住|围住/.test(text)) return "circle";
    return null;
}

const SHAPE_DESCRIPTIONS: Record<NonNullable<ReturnType<typeof resolveAssistantMarkShape>>, string> = {
    heart: "手绘爱心",
    star: "手绘星星",
    circle: "手绘圈线",
    arrow: "手绘箭头",
    box: "手绘方框",
    underline: "手绘下划线",
};

export function describePhotoRegion(x: number, y: number): string {
    const horizontal = x < .34 ? "左" : x > .66 ? "右" : "中";
    const vertical = y < .34 ? "上" : y > .66 ? "下" : "部";
    if (horizontal === "中" && vertical === "部") return "中央";
    return `${horizontal}${vertical === "部" ? "部" : vertical}`;
}

export function describePhotoAnnotations(annotations: ChatPhotoAnnotation[]): string {
    if (!annotations.length) return "没有标记";
    return annotations.map(annotation => {
        const [x, y] = annotationCenter(annotation);
        const color = COLOR_NAMES[annotation.color.toLowerCase()] || annotation.color || "彩色";
        const region = describePhotoRegion(x, y);
        const actor = annotation.actorName ? `${annotation.actorName}在` : "";
        if (annotation.kind === "emoji") {
            const rotation = annotation.rotation ? `、旋转${Math.round(annotation.rotation)}度` : "";
            return `${actor}${region}贴了${annotation.emoji || "一个 emoji"}（${annotation.scale || 1}倍${rotation}），用来“${annotation.description || "二创照片"}”`;
        }
        if (annotation.kind === "rough_shape") {
            return `${actor}${region}画了${color}${annotation.doodlePath ? "自由曲线" : SHAPE_DESCRIPTIONS[annotation.shape || "circle"]}${annotation.fill && annotation.fill !== "none" ? `，填色${annotation.fill}` : ""}${annotation.description ? `，用来“${annotation.description}”` : ""}`;
        }
        if (annotation.kind === "text") {
            return `${actor}${region}用${color}手写“${annotation.text || annotation.description || "标记"}”`;
        }
        const points = Math.floor((annotation.points?.length || 0) / 2);
        const meaning = annotation.description?.trim() ? `，表示“${annotation.description.trim()}”` : "";
        return `${actor}${region}留下一笔${color}手绘线条（${points}个轨迹点）${meaning}`;
    }).join("；");
}

function isPhotoMessage(message: ChatMessage): boolean {
    return message.mediaType === "image"
        || (message.mediaType === "media_file" && message.mediaData?.fileType === "image");
}

function resolveTarget(messages: ChatMessage[], requestedIndex?: number): { target: ChatMessage; index: number; count: number } | null {
    const latest = [...messages].reverse().find(message => isPhotoMessage(message) && !message.isRetracted);
    if (!latest) return null;
    const groupId = latest.mediaData?.photoGroupId;
    if (!groupId) return { target: latest, index: 0, count: 1 };
    const group = messages
        .filter(message => isPhotoMessage(message) && message.mediaData?.photoGroupId === groupId)
        .sort((a, b) => (a.mediaData?.photoGroupIndex ?? 0) - (b.mediaData?.photoGroupIndex ?? 0));
    if (!group.length) return null;
    const carrier = group[0];
    const preferred = requestedIndex !== undefined
        ? requestedIndex
        : (carrier.mediaData?.photoGroupActiveIndex ?? 0);
    const index = Math.max(0, Math.min(group.length - 1, preferred));
    return { target: group[index], index, count: group.length };
}

export function applyAssistantPhotoMarkupAction(options: {
    sessionId: string;
    actorId?: string;
    actorName: string;
    markData: ChatMessage["mediaData"];
    responseBatchId?: string;
    responseRoundId?: string;
}): { target: ChatMessage; event: ChatMessage } | null {
    const messages = loadChatMessages(options.sessionId);
    const resolved = resolveTarget(messages, options.markData?.photoMarkTargetIndex);
    const text = options.markData?.photoMarkText?.trim();
    if (!resolved || !text) return null;
    const x = options.markData?.photoMarkX ?? .12;
    const y = options.markData?.photoMarkY ?? .18;
    const markKind = options.markData?.photoMarkKind || "handdrawn";
    const emoji = options.markData?.photoMarkEmoji?.trim();
    const shape = resolveAssistantMarkShape(text);
    const annotation: ChatPhotoAnnotation = markKind === "emoji" && emoji ? {
        id: `ai_mark_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        kind: "emoji",
        color: "#ffffff",
        emoji,
        x,
        y,
        scale: options.markData?.photoMarkScale ?? 1.5,
        rotation: options.markData?.photoMarkRotation ?? 0,
        description: text,
        actorId: options.actorId,
        actorName: options.actorName,
        createdAt: new Date().toISOString(),
    } : {
        id: `ai_mark_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        kind: shape ? "rough_shape" : "text",
        color: "#ff3b30",
        width: shape ? .01 : undefined,
        shape: shape || undefined,
        x,
        y,
        text: shape ? undefined : text,
        description: shape ? SHAPE_DESCRIPTIONS[shape] : text,
        actorId: options.actorId,
        actorName: options.actorName,
        createdAt: new Date().toISOString(),
        renderStyle: shape ? "handdrawn" : undefined,
        seed: Math.max(1, Math.floor(Math.random() * 0x7ffffffe)),
        roughness: 1.8,
        bowing: 1.25,
        size: shape === "arrow" ? .3 : .25,
    };
    const compositionId = annotation.id;
    const marks = options.markData?.photoMarkStrokes?.length ? options.markData.photoMarkStrokes.map((mark, index) => ({
        ...mark, id: `${compositionId}_${index}`, compositionId,
        seed: Math.max(1, Math.floor(Math.random() * 0x7ffffffe)),
        actorId: options.actorId, actorName: options.actorName, createdAt: annotation.createdAt,
    })) : [annotation];
    const targetMediaData = {
        ...resolved.target.mediaData,
        photoAnnotations: [...(resolved.target.mediaData?.photoAnnotations || []), ...marks],
    };
    updateMessageMediaData(resolved.target.id, targetMediaData);
    const summary = `${options.markData?.photoMarkStrokes?.length ? `创作意图：${text}；` : ""}${describePhotoAnnotations(marks)}`;
    const event = pushChatMessage({
        sessionId: options.sessionId,
        role: "assistant",
        content: resolved.count > 1
            ? `${options.actorName}标记了第 ${resolved.index + 1} 张照片`
            : `${options.actorName}标记了照片`,
        mediaType: "photo_markup_action",
        responseBatchId: options.responseBatchId,
        responseRoundId: options.responseRoundId,
        senderCharacterId: options.actorId,
        senderName: options.actorName,
        mediaData: {
            photoMarkupTargetMessageId: resolved.target.id,
            photoMarkupTargetGroupId: resolved.target.mediaData?.photoGroupId,
            photoMarkTargetIndex: resolved.index,
            photoMarkupActorId: options.actorId,
            photoMarkupActorName: options.actorName,
            photoMarkupSummary: summary,
            photoMarkupTargetLabel: resolved.target.mediaData?.label,
            photoMarkupTargetGroupCount: resolved.count,
            photoMarkupTargetPhotoKind: resolved.target.mediaData?.photoKind,
        },
    });
    return { target: { ...resolved.target, mediaData: targetMediaData }, event };
}

export async function compositePhotoAnnotations(imageUrl: string, annotations: ChatPhotoAnnotation[]): Promise<string | null> {
    if (!annotations.length || typeof document === "undefined") return null;
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new Image();
            element.crossOrigin = "anonymous";
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error("image load failed"));
            element.src = imageUrl;
        });
        const scale = Math.min(1, 1600 / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
        const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
        const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return null;
        context.drawImage(image, 0, 0, width, height);
        const roughCanvas = rough.canvas(canvas);
        for (const annotation of annotations) {
            context.save();
            context.globalAlpha = annotation.opacity ?? 1;
            context.strokeStyle = annotation.color || "#ff3b30";
            context.fillStyle = annotation.color || "#ff3b30";
            context.lineWidth = Math.max(2, (annotation.width || .012) * Math.max(width, height));
            context.lineCap = "round";
            context.lineJoin = "round";
            if (annotation.kind === "emoji" && annotation.emoji) {
                const fontSize = width * .12 * (annotation.scale || 1);
                context.font = `${fontSize}px Apple Color Emoji, Segoe UI Emoji, sans-serif`;
                context.textAlign = "center";
                context.textBaseline = "middle";
                context.translate((annotation.x ?? .5) * width, (annotation.y ?? .5) * height);
                context.rotate(((annotation.rotation || 0) * Math.PI) / 180);
                context.fillText(annotation.emoji, 0, 0);
            } else if (annotation.kind === "rough_shape" && annotation.doodlePath) {
                context.translate((annotation.x ?? .5) * width, (annotation.y ?? .5) * height);
                context.rotate((annotation.rotation || 0) * Math.PI / 180);
                context.translate(-(annotation.x ?? .5) * width, -(annotation.y ?? .5) * height);
                context.scale(width / 100, height / 100);
                roughCanvas.path(annotation.doodlePath, { stroke: annotation.color, fill: annotation.fill || "none", fillStyle: "solid", strokeWidth: (annotation.width || .01) * 100, seed: annotation.seed || 1, roughness: (annotation.roughness || 1.8) / 10 });
            } else if (annotation.kind === "rough_shape" && annotation.shape) {
                const cx = (annotation.x ?? .5) * width;
                const cy = (annotation.y ?? .5) * height;
                const size = (annotation.size || .25) * Math.min(width, height);
                const options = { stroke: annotation.color, fill: annotation.fill || "none", fillStyle: "solid", strokeWidth: Math.max(2, (annotation.width || .01) * Math.max(width, height)), roughness: annotation.roughness || 1.8, bowing: annotation.bowing || 1.25, seed: annotation.seed || 1 };
                if (annotation.shape === "circle") roughCanvas.ellipse(cx, cy, size, size * .78, options);
                else if (annotation.shape === "box") roughCanvas.rectangle(cx - size / 2, cy - size * .38, size, size * .76, options);
                else if (annotation.shape === "underline") roughCanvas.line(cx - size / 2, cy, cx + size / 2, cy, options);
                else if (annotation.shape === "arrow") {
                    roughCanvas.line(cx - size / 2, cy + size * .25, cx + size / 2, cy - size * .25, options);
                    roughCanvas.line(cx + size / 2, cy - size * .25, cx + size * .18, cy - size * .28, options);
                    roughCanvas.line(cx + size / 2, cy - size * .25, cx + size * .34, cy + size * .05, options);
                } else if (annotation.shape === "heart") {
                    roughCanvas.path(`M ${cx} ${cy + size * .42} C ${cx - size * .58} ${cy + size * .06}, ${cx - size * .48} ${cy - size * .44}, ${cx} ${cy - size * .12} C ${cx + size * .48} ${cy - size * .44}, ${cx + size * .58} ${cy + size * .06}, ${cx} ${cy + size * .42}`, options);
                } else {
                    const star = Array.from({ length: 10 }, (_, index) => {
                        const radius = index % 2 ? size * .22 : size * .5;
                        const angle = -Math.PI / 2 + index * Math.PI / 5;
                        return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius] as [number, number];
                    });
                    roughCanvas.polygon(star, options);
                }
            } else if (annotation.kind === "stroke" && (annotation.points?.length || 0) >= 4) {
                const points = annotation.points!;
                context.beginPath();
                context.moveTo(points[0] * width, points[1] * height);
                for (let index = 2; index + 1 < points.length; index += 2) context.lineTo(points[index] * width, points[index + 1] * height);
                context.stroke();
                if (annotation.renderStyle === "handdrawn") {
                    context.globalAlpha = .28;
                    context.lineWidth *= .58;
                    context.translate(width * .0022, height * .0014);
                    context.stroke();
                }
            } else if (annotation.kind === "text" && annotation.text) {
                context.font = `700 ${Math.max(22, Math.round(width * .065))}px "Segoe Print", "Bradley Hand", cursive`;
                context.shadowColor = "rgba(0,0,0,.35)";
                context.shadowBlur = 3;
                context.fillText(annotation.text, (annotation.x ?? .12) * width, (annotation.y ?? .18) * height);
            }
            context.restore();
        }
        return canvas.toDataURL("image/jpeg", .9);
    } catch {
        return null;
    }
}
