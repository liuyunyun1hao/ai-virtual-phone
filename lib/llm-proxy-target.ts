/**
 * 判断一个 LLM 接口地址是否需要经本站服务端转发。
 *
 * 单独成文件是为了打断循环依赖：
 *   api-helpers → llm-http → llm-provider-adapter → api-helpers
 * 把这个纯函数抽到没有任何依赖的模块里，两边都从这儿取，环就断了。
 */
export function needsServerProxy(url: string): boolean {
    try {
        const host = new URL(url).hostname.toLowerCase();
        // OpenCode Zen/Go 网关：未开放浏览器 CORS，且 2025-09-05 起要求
        // x-opencode-session 头（缺失回 400 MissingSessionID）。
        // 会话头由 app/api/llm-proxy/route.ts 在服务端补。
        return host === "opencode.ai" || host.endsWith(".opencode.ai");
    } catch {
        return false;
    }
}
