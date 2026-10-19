import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

/**
 * 服务端 LLM 转发。
 *
 * 为什么需要它
 * ------------
 * 应用里普通服务商是**浏览器直连**（见 lib/llm-http.ts）。但 OpenCode Zen/Go 网关
 * （https://opencode.ai/zen/go/v1）两样都不满足：
 *
 *  1. 没有开浏览器 CORS —— 预检拿不到 Access-Control-Allow-Origin，浏览器直接拦掉；
 *  2. 从 2025-09-05 起要求每个请求带 `x-opencode-session` 头，
 *     否则回 400 {"type":"MissingSessionID","message":"Request is missing x-opencode-session..."}。
 *     （见 deepseek-harness 讨论 #5495、lobehub issue #19123）
 *
 * 所以由本站服务端代发：同源请求，不受 CORS 约束，会话头也在这里补。
 * 客户端那边 lib/llm-http.ts 已经会往 /api/llm-proxy 发了，只要 payload.serverProxy 为 true ——
 * 而 llm-provider-adapter.ts 里已经按目标域名自动判断好了。
 *
 * 入参（与 lib/llm-http.ts 发出的完全一致）：
 *   { url: string, headers: Record<string,string>, body: string }
 * 出参：上游的原始响应，流式透传（SSE 必须边收边吐，不能攒完再发）。
 */

const SESSION_COOKIE = "oc_session";

/** 只允许转发到这些目标，避免这个路由变成任意 URL 的开放代理 */
function isAllowedTarget(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
    let u: URL;
    try {
        u = new URL(raw);
    } catch {
        return { ok: false, reason: "url 不是合法地址" };
    }
    if (u.protocol !== "https:") return { ok: false, reason: "只允许 https" };
    const host = u.hostname.toLowerCase();
    const isPrivate =
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "::1" ||
        host.endsWith(".local") ||
        host.endsWith(".internal") ||
        /^10\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
        /^169\.254\./.test(host) ||
        /^f[cd][0-9a-f]{2}:/i.test(host) ||
        /^fe80:/i.test(host);
    if (isPrivate) return { ok: false, reason: "不允许转发到本机或内网地址" };
    return { ok: true, url: u };
}

/** OpenCode 网关才需要补会话头 */
function needsOpencodeSession(u: URL): boolean {
    const h = u.hostname.toLowerCase();
    return h === "opencode.ai" || h.endsWith(".opencode.ai");
}

/** 会话 ID 存在 cookie 里，保持同一浏览器稳定（上游用它做亲和路由） */
function resolveSession(req: NextRequest): { id: string; fresh: boolean } {
    const cookie = req.headers.get("cookie") || "";
    const hit = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([A-Za-z0-9_-]{8,64})`).exec(cookie);
    if (hit) return { id: hit[1], fresh: false };
    return { id: `oc-${randomUUID()}`, fresh: true };
}

export async function POST(req: NextRequest) {
    let payload: { url?: string; method?: string; headers?: Record<string, string>; body?: unknown };
    try {
        payload = await req.json();
    } catch {
        return Response.json({ error: "请求体不是 JSON" }, { status: 400 });
    }

    const rawUrl = typeof payload.url === "string" ? payload.url : "";
    if (!rawUrl) return Response.json({ error: "缺少 url" }, { status: 400 });

    const target = isAllowedTarget(rawUrl);
    if (!target.ok) return Response.json({ error: target.reason }, { status: 400 });

    const outHeaders: Record<string, string> = { "Content-Type": "application/json" };
    for (const [k, v] of Object.entries(payload.headers || {})) {
        if (typeof v !== "string") continue;
        const lk = k.toLowerCase();
        // 这几个由服务端自己决定，别让客户端覆盖
        if (lk === "host" || lk === "content-length" || lk === "user-agent") continue;
        outHeaders[k] = v;
    }

    const session = resolveSession(req);
    if (needsOpencodeSession(target.url)) {
        outHeaders["x-opencode-session"] = session.id;
        // Cloudflare 会按 UA 特征放行/拦截；Python 的默认 UA 会被 1010 挡掉，
        // Node 的 fetch 实测没问题，但显式给一个浏览器 UA 更稳。
        outHeaders["User-Agent"] =
            "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
    }

    const bodyText = typeof payload.body === "string" ? payload.body : JSON.stringify(payload.body ?? {});

    let upstream: Response;
    try {
        const method = (payload.method || "POST").toUpperCase();
        upstream = await fetch(target.url.toString(), {
            method: method === "GET" || method === "HEAD" ? method : "POST",
            headers: outHeaders,
            body: method === "GET" || method === "HEAD" ? undefined : bodyText,
            // 上游是 SSE 长连接，别让中间层缓存或缓冲
            cache: "no-store",
            redirect: "follow",
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return Response.json({ error: `连不上上游：${msg}` }, { status: 502 });
    }

    const respHeaders = new Headers();
    const ct = upstream.headers.get("content-type");
    respHeaders.set("Content-Type", ct || "application/json");
    respHeaders.set("Cache-Control", "no-store, no-transform");
    // 有些反代/运行时会加 X-Accel-Buffering 来禁用缓冲，顺手带上
    respHeaders.set("X-Accel-Buffering", "no");

    if (session.fresh && needsOpencodeSession(target.url)) {
        respHeaders.append(
            "Set-Cookie",
            `${SESSION_COOKIE}=${session.id}; Path=/; Max-Age=2592000; SameSite=Lax`,
        );
    }

    // 流式透传：直接把上游的 body 交给客户端，不 await 全文
    return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
}

export async function GET() {
    return Response.json({
        ok: true,
        note: "POST { url, headers, body } 到这里，由服务端转发给上游 LLM。",
        autoRouted: "目标域名是 opencode.ai 时，lib/llm-provider-adapter.ts 会自动把 serverProxy 置 true。",
    });
}
