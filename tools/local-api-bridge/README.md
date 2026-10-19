# 本地模型接口的 CORS 桥

让**部署在云上的** AI Virtual Phone 用上**跑在你本机**的模型接口。

## 为什么需要

应用里普通服务商是**浏览器直连**（见 `lib/llm-http.ts`），所以本机接口本可以被手机浏览器直接访问。
但两个坎：

1. **CORS 预检**：带 `Authorization` 头或 `Content-Type: application/json` 的请求，
   浏览器必须先发 `OPTIONS` 问一句。很多本机小网关（简易 HTTP 服务）没实现 OPTIONS，一律回 501/401，
   预检失败 → 真正的请求根本不发出去。
2. **私有网络访问（PNA）**：https 页面请求 `127.0.0.1` 时，Chrome 会额外带上
   `Access-Control-Request-Private-Network: true`，目标必须回
   `Access-Control-Allow-Private-Network: true`，否则可能被拦。

这个桥两件都答上，再把请求/响应原样转发（含 SSE 流式）。**它不碰你的 Key**——
Key 填在应用界面里，桥只负责让浏览器肯发这个请求。

## 跑起来

```bash
python3 cors_proxy.py                                   # 默认 9366 → 127.0.0.1:9355
python3 cors_proxy.py --upstream http://127.0.0.1:9355 --port 9366
```

## 应用里怎么填

「设置 → API 设置 → 添加」：

| 字段 | 填什么 |
|---|---|
| 服务商 | **自定义 (Custom)**（`lib/api-helpers.ts`：OpenAI 兼容端点走 Custom + baseUrl） |
| Base URL | `http://127.0.0.1:9366/zen/go/v1` |
| API Key | 你那个网关的凭据 |
| 模型 | 该网关支持的模型名 |

页面是 https、接口是 http 不会算混合内容——浏览器把 `127.0.0.1` / `localhost` 当可信来源。

## 验证记录

模拟 Vercel 页面（Origin 为 https 域名）跑通全链路：

```
1. 预检  204   Allow-Origin=*   私有网络=true   允许 authorization=True
2. 请求  200   text/event-stream
3. 回复  「你好，很高兴认识你！」
```
