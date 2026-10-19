// lib/llm-http.ts
// LLM 请求的统一 fetch 出口。所有走 buildProviderRequest 的调用点统一经它发请求：
//  - 普通 provider：浏览器直连（现状不变）；
//  - serverProxy 标记（OpenCode 网关）：改发本站 /api/llm-proxy，由服务端转发，
//    绕过 opencode.ai 未开放浏览器 CORS 的问题。

import type { LlmRequestPayload } from "./llm-provider-adapter";
import { needsServerProxy } from "./llm-proxy-target";

/**
 * 统一的出站请求出口。
 * 需要服务端转发的目标（OpenCode 网关：没开浏览器 CORS + 要求 x-opencode-session）
 * 走本站 /api/llm-proxy，其余照旧浏览器直连。
 * 抽出来是给"裸 fetch"的地方共用 —— simpleLLMCall（测试连接）和
 * fetchModels（拉取模型列表）以前都绕过了 fetchPayload，所以那两个按钮
 * 在 OpenCode 网关下会直接失败。
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
import { registerIdentityRequest, assertIdentityActive } from "./identity-runtime";

export type FetchLlmPayloadOptions = {
    signal?: AbortSignal;
};

export async function fetchLlmPayload(
    payload: LlmRequestPayload,
    options: FetchLlmPayloadOptions = {},
): Promise<Response> {
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener("abort", abort, { once: true });
    const release = registerIdentityRequest(controller);
    const finish = () => { release(); options.signal?.removeEventListener("abort", abort); };
    try {
    const response = await fetchPayload(payload, controller.signal);
    assertIdentityActive();
    if (!response.body) { finish(); return response; }
    const reader = response.body.getReader();
    return new Response(new ReadableStream({
        async pull(stream) {
            try {
                assertIdentityActive();
                const chunk = await reader.read();
                assertIdentityActive();
                if (chunk.done) { finish(); stream.close(); } else stream.enqueue(chunk.value);
            } catch (error) { controller.abort(); finish(); stream.error(error); }
        },
        async cancel(reason) { controller.abort(); finish(); await reader.cancel(reason); },
    }), { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) { finish(); throw error; }
}

function fetchPayload(payload: LlmRequestPayload, signal: AbortSignal): Promise<Response> {
    const bodyText = JSON.stringify(payload.body);
    if (payload.serverProxy) {
        return fetch("/api/llm-proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                url: payload.url,
                headers: payload.headers,
                body: bodyText,
            }),
            signal,
        });
    }
    return fetch(payload.url, {
        method: "POST",
        headers: payload.headers,
        body: bodyText,
        signal,
    });
}
