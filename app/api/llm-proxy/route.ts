import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * 受限的 LLM 服务端转发。
 *
 * 用途：某些厂商网关（目前是 OpenCode Go / Console 的 opencode.ai）
 * 没有开放浏览器 CORS，前端直连会被预检拦掉。由本路由在服务端代为请求，
 * 再把响应原样流式回传（SSE 也能透传）。
 *
 * 为防被当成开放代理：只允许 https + 白名单主机，
 * 且不允许客户端覆盖 Host / Content-Length / Connection 等逐跳头。
 */

const ALLOWED_HOSTS = new Set([
    "opencode.ai",
    "api.opencode.ai",
]);

const BLOCKED_HEADERS = new Set([
    "host",
    "content-length",
    "connection",
    "keep-alive",
    "transfer-encoding",
    "upgrade",
    "proxy-authorization",
    "proxy-connection",
]);

function jsonError(status: number, error: string) {
    return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
    let payload: unknown;
    try {
        payload = await request.json();
    } catch {
        return jsonError(400, "invalid_json");
    }

    const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
    const method = typeof body.method === "string" && body.method.trim()
        ? body.method.trim().toUpperCase()
        : "POST";
    const requestBody = typeof body.body === "string" ? body.body : undefined;
    const rawHeaders = body.headers && typeof body.headers === "object"
        ? body.headers as Record<string, unknown>
        : {};

    if (!rawUrl) return jsonError(400, "missing_url");
    if (method !== "POST" && method !== "GET") return jsonError(400, "unsupported_method");

    let target: URL;
    try {
        target = new URL(rawUrl);
    } catch {
        return jsonError(400, "invalid_url");
    }
    if (target.protocol !== "https:") return jsonError(400, "https_required");
    if (!ALLOWED_HOSTS.has(target.hostname)) return jsonError(403, "host_not_allowed");

    const headers = new Headers();
    for (const [key, value] of Object.entries(rawHeaders)) {
        if (typeof value !== "string") continue;
        const lowered = key.toLowerCase();
        if (BLOCKED_HEADERS.has(lowered)) continue;
        headers.set(key, value);
    }
    headers.set("Accept-Encoding", "identity");

    let upstream: Response;
    try {
        upstream = await fetch(target.toString(), {
            method,
            headers,
            body: method === "GET" ? undefined : requestBody,
            signal: AbortSignal.timeout(115_000),
            redirect: "follow",
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonError(502, `upstream_failed: ${message.slice(0, 200)}`);
    }

    const outgoing = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) outgoing.set("Content-Type", contentType);
    outgoing.set("Cache-Control", "no-store");
    outgoing.set("X-Upstream-Status", String(upstream.status));

    return new Response(upstream.body, {
        status: upstream.status,
        headers: outgoing,
    });
}
