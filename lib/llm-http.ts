// lib/llm-http.ts
// LLM 请求的统一 fetch 出口。所有走 buildProviderRequest 的调用点统一经它发请求：
//  - 普通 provider：浏览器直连（现状不变）；
//  - serverProxy 标记（OpenCode 网关）：改发本站 /api/llm-proxy，由服务端转发，
//    绕过 opencode.ai 未开放浏览器 CORS 的问题。

import type { LlmRequestPayload } from "./llm-provider-adapter";
import { needsServerProxy } from "./llm-proxy-target";

/**
 * 统一的出站请求出口。
 * 需要服务端转发的目标（OpenCode 网关：没有浏览器 CORS + 要求 x-opencode-session）
 * 走本站 /api/llm-proxy，其余照旧浏览器直连。
 */
export function sendLlmRequest(
    url: string,
    init: { method?: "GET" | "POST"; headers: Record<string, string>; body?: string; signal?: AbortSignal },
): Promise<Response> {
    const method = init.method ?? "POST";
    if (needsServerProxy(url)) {
        return fetch("/api/llm-proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, method, headers: init.headers, body: init.body }),
            signal: init.signal,
        });
    }
    return fetch(url, {
        method,
        headers: init.headers,
        body: method === "GET" ? undefined : init.body,
        signal: init.signal,
    });
}

export type FetchLlmPayloadOptions = {
    signal?: AbortSignal;
};

export function fetchLlmPayload(
    payload: LlmRequestPayload,
    options: FetchLlmPayloadOptions = {},
): Promise<Response> {
    return sendLlmRequest(payload.url, {
        method: "POST",
        headers: payload.headers,
        body: JSON.stringify(payload.body),
        signal: options.signal,
    });
}
