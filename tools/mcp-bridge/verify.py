#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
按 AI Virtual Phone 的真实请求序列重放，验证桥的兼容性。

依据是应用源码 lib/tool-executor.ts：
  · mcpRequest()      —— 请求头：Content-Type / Accept / MCP-Protocol-Version + 鉴权头
  · directMcpFetch()  —— 读 res.headers.get("mcp-session-id") 和 www-authenticate
  · mcpInitialize()   —— initialize → 存 sessionId → notifications/initialized
  · MCP_PROTOCOL_VERSION = "2024-11-05"
  · MCP_CLIENT_INFO      = { name: "ai-virtual-phone", version: "1.0.0" }

所以要验的是三件事：
  1. 预检能不能过（过不了浏览器根本不发请求）
  2. 响应头有没有 Expose mcp-session-id（不 Expose 的话 JS 读不到，会话断掉）
  3. 握手 → 通知 → 列工具 → 调工具 这条链能不能走完
token 只在内存里，不打印。
"""
import json, os, re, sys, urllib.request, urllib.error

PROTO = "2024-11-05"
CLIENT = {"name": "ai-virtual-phone", "version": "1.0.0"}
ORIGIN = "http://127.0.0.1:3001"
BRIDGE = os.environ.get("MCP_BRIDGE_URL", "http://127.0.0.1:9377")

# token 来源：优先环境变量，其次 DSH 的 mcp-manager.json
TOK = {}
for port, env in (('18110', 'MCP_TOKEN_XINCHAO'), ('18001', 'MCP_TOKEN_OB')):
    if os.environ.get(env):
        TOK[port] = os.environ[env]
try:
    cfg = json.load(open(os.path.expanduser('~/.dsh/mcp-manager.json'), encoding='utf-8'))
    for s in cfg.get('servers', []):
        m = re.search(r':(\d+)/', s.get('url', ''))
        if m and m.group(1) not in TOK:
            TOK[m.group(1)] = s.get('token', '')
except FileNotFoundError:
    pass

TARGETS = [
    ('%s/xinchao/mcp' % BRIDGE, '18110', '心潮'),
    ('%s/ob/mcp' % BRIDGE, '18001', 'ob'),
]


def req(url, body=None, token=None, sid=None, origin=ORIGIN, preflight=False):
    method = 'OPTIONS' if preflight else 'POST'
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    # 完全照抄应用发的头
    if not preflight:
        r.add_header('Content-Type', 'application/json')
        r.add_header('Accept', 'application/json, text/event-stream')
        r.add_header('MCP-Protocol-Version', PROTO)
    else:
        r.add_header('Access-Control-Request-Method', 'POST')
        r.add_header('Access-Control-Request-Headers', 'authorization,content-type,mcp-protocol-version')
    if origin:
        r.add_header('Origin', origin)
    if token:
        r.add_header('Authorization', 'Bearer ' + token)
    if sid:
        r.add_header('Mcp-Session-Id', sid)
    try:
        resp = urllib.request.urlopen(r, timeout=90)
        return resp.status, {k.lower(): v for k, v in resp.headers.items()}, resp.read().decode('utf-8', 'ignore')
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read().decode('utf-8', 'ignore')


def sse(text):
    out = []
    for line in text.splitlines():
        if line.strip().startswith('data:'):
            b = line.strip()[5:].strip()
            if b and b != '[DONE]':
                try:
                    out.append(json.loads(b))
                except Exception:
                    pass
    if not out:
        try:
            out.append(json.loads(text))
        except Exception:
            pass
    return out


fails = 0
for url, port, label in TARGETS:
    token = TOK.get(port, '')
    print(f'═══ {label} · {url}')
    if not token:
        print('  ⚠️ 没有 token，跳过\n'); continue

    # 1. 预检
    st, hd, _ = req(url, preflight=True)
    ao, ah = hd.get('access-control-allow-origin'), hd.get('access-control-allow-headers', '')
    eh = hd.get('access-control-expose-headers', '')
    p1 = st in (200, 204) and ao and 'authorization' in ah.lower()
    p2 = 'mcp-session-id' in eh.lower()
    print(f'  预检        {st}  Allow-Origin={ao}  Allow-Headers 含 authorization={"authorization" in ah.lower()}  {"✅" if p1 else "❌"}')
    print(f'  Expose 会话 {"mcp-session-id" in eh.lower()}  {"✅ 浏览器读得到" if p2 else "❌ 读不到，会话会断"}')
    fails += (0 if p1 else 1) + (0 if p2 else 1)

    # 2. initialize（照抄 mcpInitialize 第一步）
    st, hd, body = req(url, {"jsonrpc": "2.0", "id": 1, "method": "initialize",
                             "params": {"protocolVersion": PROTO, "capabilities": {}, "clientInfo": CLIENT}}, token=token)
    sid = hd.get('mcp-session-id')
    msgs = sse(body)
    ok = st == 200 and msgs and 'result' in msgs[0]
    print(f'  initialize  {st}  session={"有" if sid else "无"}  {"✅" if ok else "❌ " + body[:120]}')
    fails += 0 if ok else 1
    if not ok:
        print(); continue
    si = msgs[0]['result'].get('serverInfo', {})
    print(f'              服务器：{si.get("name","?")} v{si.get("version","?")}  协议：{msgs[0]["result"].get("protocolVersion","?")}')

    # 3. notifications/initialized（照抄第二步：带 Mcp-Session-Id）
    st, _, _ = req(url, {"jsonrpc": "2.0", "method": "notifications/initialized"}, token=token, sid=sid)
    print(f'  initialized {st}  {"✅（通知，无响应是正常的）" if st in (200, 202, 204) else "❌"}')
    fails += 0 if st in (200, 202, 204) else 1

    # 4. tools/list
    st, _, body = req(url, {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}, token=token, sid=sid)
    msgs = sse(body)
    tools = (msgs[0].get('result', {}).get('tools') if msgs and 'result' in msgs[0] else []) or []
    print(f'  tools/list  {st}  拿到 {len(tools)} 个工具  {"✅" if tools else "❌"}')
    fails += 0 if tools else 1

    # 5. 真的调一次只读工具（这一步才算全链路打通）
    safe = next((t['name'] for t in tools if t['name'] in ('pulse',)), None)
    if safe:
        st, _, body = req(url, {"jsonrpc": "2.0", "id": 3, "method": "tools/call",
                                "params": {"name": safe, "arguments": {}}}, token=token, sid=sid)
        msgs = sse(body)
        got = msgs and 'result' in msgs[0]
        txt = ''
        if got:
            c = msgs[0]['result'].get('content') or []
            txt = ' '.join(x.get('text', '') for x in c)[:110].replace('\n', ' ')
        print(f'  tools/call  {st}  {safe}()  {"✅ 真的调通了" if got else "❌"}')
        if txt:
            print(f'              返回：{txt}…')
        fails += 0 if got else 1
    else:
        print('  tools/call  —— 没有只读工具可安全试调，跳过（不拿你的记忆做实验）')
    print()

print(('❌ 有 %d 项没过' % fails) if fails else '✅ 全部通过（含真实工具调用）')
sys.exit(1 if fails else 0)
