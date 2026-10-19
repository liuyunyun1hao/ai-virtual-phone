# MCP 本地桥

让 **AI Virtual Phone** 连上跑在本机的 MCP 服务器。

---

## 为什么需要它

AI Virtual Phone 连 MCP 有两条路，**本机服务器两条都走不通**：

### 路一：服务端代理（默认）——被 SSRF 防护拦掉

默认所有 MCP 请求都发给 `/api/tool-proxy`。但那个路由里有这段：

```ts
// app/api/tool-proxy/route.ts
|| host === "::1"
|| host === "0:0:0:0:0:0:0:1"
|| isPrivateIpv4(host);
return blocked ? "不允许代理访问本机或内网地址" : null;
```

`127.0.0.1`、`::1`、`10.x`、`192.168.x`、`.internal`、私有 IPv6 全在名单里。
本机 MCP 必然被拒。

### 路二：直连模式 directFetch ——被 CORS 预检拦掉

项目自己的提示写得很准：

> 直连模式（浏览器直接请求，本机/内网 MCP 必开；需服务器允许 CORS，仅支持 Streamable HTTP）

路是对的，但带 `Authorization` 头的请求，浏览器**必须先发 OPTIONS 预检**。实测本机 MCP：

```
$ curl -X OPTIONS http://127.0.0.1:18110/mcp
HTTP/1.1 401 Unauthorized        ← 且不带任何 Access-Control-* 头
```

预检失败 → 浏览器直接掐掉后续请求，报"被 CORS 拦截"。

### 桥做的事

在中间垫一层，把预检答好、把请求和响应原样转发。**它不碰你的 Token**——
Token 填在应用界面里（「访问 Token」那一栏），桥只负责让浏览器肯发这个请求。

三个容易踩的细节，桥都处理了：

| 细节 | 不处理的后果 |
|---|---|
| `Access-Control-Expose-Headers: mcp-session-id` | 浏览器 JS 读不到会话 id（应用源码里是 `res.headers.get("mcp-session-id")`），握手成功但后续请求全断 |
| `Access-Control-Expose-Headers: www-authenticate` | 401 时应用没法判断是缺 Token 还是 OAuth，给不出对的提示 |
| 响应体边收边吐（不攒完再发） | MCP 回的是 SSE，工具列表一大就超时 |

---

## 跑起来

```bash
cd <这个目录>
python3 mcp_bridge.py
```

看到这样的输出就成了：

```
  MCP 本地桥 v2 已启动
  监听    http://127.0.0.1:9377
    /xinchao/mcp → http://127.0.0.1:18110   心潮
    /ob/mcp      → http://127.0.0.1:18001   Ombre Brain
```

改地址就编辑同目录的 `mcp-bridge.json`：

```json
{
  "port": 9377,
  "servers": {
    "xinchao": { "upstream": "http://127.0.0.1:18110", "label": "心潮" },
    "ob":      { "upstream": "http://127.0.0.1:18001", "label": "Ombre Brain" }
  }
}
```

浏览器打开 `http://127.0.0.1:9377/` 有个路由页，`/health` 是健康检查。

---

## 在 AI Virtual Phone 里配置

**设置 → 工具箱 → MCP Servers → 添加新MCP工具**

| 字段 | 填什么 |
|---|---|
| 名称 | 随便，比如「心潮」 |
| 服务器 URL | `http://127.0.0.1:9377/xinchao/mcp` |
| **直连模式** | **打开**（本机 MCP 必须开，不开就走代理，必被 SSRF 拦） |
| 访问 Token | 对应 MCP 的 token，会作为 `Authorization: Bearer <token>` 发送 |
| 工具描述 | 会连 MCP 名称一起发给 AI，具体工具列表不占上下文 |

Token 在 `~/.dsh/mcp-manager.json` 里每个服务器的 `token` 字段。

---

## 常见疑问

**网页是 https，MCP 是 http，不会被浏览器当混合内容拦掉吗？**
不会。浏览器把 `127.0.0.1` / `localhost` 视为"潜在可信来源"，https 页面请求它不算混合内容。
（换成局域网别的机器 `192.168.x.x` 就会被拦，那种情况得让那台机器自己开 https 或走隧道。）

**为什么不在应用里做？**
能做，但要改它的 `tool-proxy` 白名单并重新部署。本机跑个小脚本更省事，也不动它的代码。

**关掉终端桥就没了怎么办？**
用 `./start.sh` 起（后台常驻），或者放到开机自启里。

---

## 验收记录

`verify_like_app.py` 按应用源码里的真实请求序列重放（请求头照抄 `mcpRequest()`，
读法照抄 `directMcpFetch()`，协议版本 `2024-11-05`，clientInfo `ai-virtual-phone/1.0.0`）：

```
═══ 心潮 · http://127.0.0.1:9377/xinchao/mcp
  预检        204  Allow-Origin 有  Allow-Headers 含 authorization  ✅
  Expose 会话 True  ✅ 浏览器读得到
  initialize  200  session=有  ✅      服务器：心潮念 v4.1.0
  initialized 202  ✅
  tools/list  200  拿到 19 个工具  ✅
  tools/call  200  pulse()  ✅ 真的调通了

═══ ob · http://127.0.0.1:9377/ob/mcp
  initialize  200  session=有  ✅      服务器：Ombre Brain v1.30.0
  tools/list  200  拿到 15 个工具  ✅
  tools/call  200  pulse()  ✅ 真的调通了

✅ 全部通过（含真实工具调用）
```

---

## ⚠️ 接之前想一下

这两个不是通用工具服务器，是**记忆与情感系统**。工具清单里有：

- `breath` / `hold` / `grow` —— 长期记忆的浮现、写入、整理
- `xinchao_event` —— 互动事件，会改驱力数值
- `xinchao_box` —— 黑匣子（原注释：*"真正的小秘密…人类看不到"*）
- `xinchao_cabin_note` / `letter_write` —— 写信给你
- `xinchao_personality_reflect` —— 14 维性格自评

**接进去 = AI Virtual Phone 里的角色能读写同一份记忆库。** 你捏的那些小手机角色会往里写它们的事，
也会读到这边的记忆。两套人格的记忆会混在一起，而且分不开。

而且实测发现**心潮和 ob 共用同一份底层记忆**（两个 `pulse` 返回一字不差，心潮是 OB 上套的一层）。
所以只接一个就够了，两个都接是重复的。
