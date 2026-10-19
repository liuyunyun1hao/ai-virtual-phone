#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MCP 本地桥 · v2
===============

它解决什么问题
--------------
AI Virtual Phone 连 MCP 有两条路，本机服务器两条都走不通：

  1. 服务端代理 /api/tool-proxy —— 那个路由里有 SSRF 防护，`blockedProxyUrlReason()`
     明确拦掉 127.0.0.1 / ::1 / 10.x / 192.168.x / .internal / 私有 IPv6。
     本机 MCP 必然被拒：{"error":"不允许代理访问本机或内网地址"}
  2. 直连模式 directFetch —— 浏览器直接请求 MCP。路是对的，但要过 CORS 预检：
     带 Authorization 的请求，浏览器先发 OPTIONS，而本机 MCP 对 OPTIONS 回 401
     且不带任何 CORS 头 → 预检失败 → 真正的请求根本不发出去。

这个桥只管一件事：把预检答好，再把请求/响应原样转发。它**不碰你的 Token**——
Token 填在应用界面里（访问 Token 那一栏），桥只负责让浏览器肯发这个请求。

为什么不是简单反代
------------------
MCP 的 Streamable HTTP 会用到这几个头，一个都不能漏：
  · `mcp-session-id`  —— 握手后由服务器下发，后续每个请求都要带回去；
     而且必须放进 Access-Control-Expose-Headers，否则浏览器的 JS 读不到，会话就断了
  · `Accept: application/json, text/event-stream` —— 少一个有些实现会 406
  · 响应体是 SSE，必须边收边吐，不能攒完再发（否则大列表会超时）

用法
----
    python3 mcp_bridge.py                        # 读同目录的 mcp-bridge.json
    python3 mcp_bridge.py --config 别的.json
    python3 mcp_bridge.py --port 9377            # 覆盖端口

配置（mcp-bridge.json，同目录）：
    {
      "port": 9377,
      "servers": {
        "xinchao": { "upstream": "http://127.0.0.1:18110", "label": "心潮" },
        "ob":      { "upstream": "http://127.0.0.1:18001", "label": "Ombre Brain" }
      }
    }

配好后在 AI Virtual Phone 里（设置 → 工具箱 → MCP Servers → 添加新MCP工具）：
    服务器 URL : http://127.0.0.1:9377/xinchao/mcp
    直连模式   : 打开（本机 MCP 必开）
    访问 Token : 对应 MCP 的 token
"""

import argparse
import json
import os
import socketserver
import sys
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler

# 浏览器与 MCP 要用的头，一个都不能少
ALLOW_HEADERS = ("content-type, authorization, accept, mcp-session-id, "
                 "mcp-protocol-version, last-event-id, x-requested-with")
# 不 Expose 的话，浏览器 JS 读不到 mcp-session-id / www-authenticate，会话和鉴权都会断
EXPOSE_HEADERS = "mcp-session-id, www-authenticate, mcp-protocol-version"
PASS_HEADERS = ("Content-Type", "Authorization", "Accept", "Mcp-Session-Id",
                "MCP-Protocol-Version", "Last-Event-ID", "User-Agent")
DEFAULT_UA = ("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

DEFAULT_CONFIG = {
    "port": 9377,
    "servers": {
        "xinchao": {"upstream": "http://127.0.0.1:18110", "label": "心潮"},
        "ob": {"upstream": "http://127.0.0.1:18001", "label": "Ombre Brain"},
    },
}


def load_config(path):
    if path and os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            cfg = json.load(f)
        print("  读到配置：%s" % path)
        return cfg
    print("  没找到 %s，用内置默认（心潮 18110 / ob 18001）" % path)
    return DEFAULT_CONFIG


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"          # 不写 Content-Length，写到 EOF 即结束 —— SSE 最省事
    server_version = "McpBridge/2.0"

    def log_message(self, fmt, *args):
        if self.server.verbose:
            sys.stderr.write("  %s\n" % (fmt % args))

    # ---------- CORS ----------
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin") or "*")
        self.send_header("Access-Control-Allow-Headers", ALLOW_HEADERS)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Expose-Headers", EXPOSE_HEADERS)
        # Chrome 的私有网络访问（PNA）：https 页面请求 127.0.0.1 时会额外发一次
        # Access-Control-Request-Private-Network，响应里必须回这个头，否则会被拦。
        # 不回也不会立刻坏，但 Chrome 一旦全面执行就会连不上，先加上。
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "86400")
        self.send_header("Vary", "Origin")
        self.send_header("Cache-Control", "no-store")

    def _send(self, code, ctype, data):
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_OPTIONS(self):
        """预检。整个脚本存在的理由就是这一句。"""
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        # 注意剥掉查询串：/health?t=1 以前会掉进 _relay 然后 404（实测踩到过）
        raw = self.path.split("?", 1)[0]
        if raw in ("", "/"):
            return self._index()
        if raw.rstrip("/") == "/health":
            return self._health()
        self._relay("GET")

    def do_POST(self):
        self._relay("POST")

    def do_DELETE(self):
        self._relay("DELETE")

    # ---------- 路由 ----------
    def _resolve(self):
        """把 /<名字>/mcp 映射到对应的上游；只有一个服务器时 /mcp 也能用"""
        path = self.path.split("?", 1)[0]
        parts = [p for p in path.split("/") if p]
        servers = self.server.servers
        if len(parts) >= 2 and parts[0] in servers:
            rest = "/" + "/".join(parts[1:])
            return servers[parts[0]], rest, parts[0]
        if len(parts) >= 1 and parts[0] in servers and len(parts) == 1:
            return servers[parts[0]], "/mcp", parts[0]
        if len(servers) == 1:                      # 单服务器兜底
            name = next(iter(servers))
            return servers[name], path, name
        return None, path, None

    def _health(self):
        out = {"bridge": "ok", "servers": {}}
        for name, s in self.server.servers.items():
            url = s["upstream"].rstrip("/") + "/mcp"
            entry = {"label": s.get("label", name), "upstream": s["upstream"]}
            t0 = time.time()
            try:
                r = urllib.request.Request(url, method="OPTIONS")
                urllib.request.urlopen(r, timeout=5)
                entry["reachable"] = True
            except urllib.error.HTTPError as e:
                entry["reachable"] = True                 # 401 也算"活着"
                entry["answers_with"] = e.code
            except Exception as e:
                entry["reachable"] = False
                entry["error"] = str(e)
            entry["ms"] = int((time.time() - t0) * 1000)
            entry["app_url"] = "http://127.0.0.1:%d/%s/mcp" % (self.server.server_address[1], name)
            out["servers"][name] = entry
        self._send(200, "application/json; charset=utf-8",
                   json.dumps(out, ensure_ascii=False, indent=1).encode())

    def _index(self):
        rows = "".join(
            '<tr><td><b>%s</b></td><td><code>http://127.0.0.1:%d/%s/mcp</code></td><td>%s</td></tr>'
            % (s.get("label", n), self.server.server_address[1], n, s["upstream"])
            for n, s in self.server.servers.items())
        html = ("<!doctype html><meta charset=utf-8><title>MCP 桥</title>"
                "<style>body{font:14px/1.7 -apple-system,sans-serif;max-width:760px;margin:40px auto;padding:0 20px}"
                "code{background:#f3f3f5;padding:2px 6px;border-radius:6px}"
                "table{border-collapse:collapse;width:100%%}td,th{padding:10px;border-bottom:1px solid #eee;text-align:left}"
                "h1{font-size:20px}</style>"
                "<h1>MCP 本地桥</h1><p>在 AI Virtual Phone 里把下面的地址填进「服务器 URL」，"
                "并把「直连模式」打开。</p><table><tr><th>服务器</th><th>填这个地址</th><th>转发到</th></tr>%s</table>"
                "<p style='color:#888;margin-top:24px'>健康检查：<a href='/health'>/health</a></p>" % rows)
        self._send(200, "text/html; charset=utf-8", html.encode())

    # ---------- 转发 ----------
    def _relay(self, method):
        entry, rest, name = self._resolve()
        if entry is None:
            names = "、".join(self.server.servers.keys())
            return self._send(404, "application/json; charset=utf-8",
                              json.dumps({"error": "路径不认识。可用：/{%s}/mcp" % names},
                                         ensure_ascii=False).encode())
        url = entry["upstream"].rstrip("/") + rest
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        body = self.rfile.read(length) if length else None

        req = urllib.request.Request(url, data=body, method=method)
        for h in PASS_HEADERS:
            v = self.headers.get(h)
            if v:
                req.add_header(h, v)
        ua = (self.headers.get("User-Agent") or "").strip()
        req.add_header("User-Agent", ua if ua and "python" not in ua.lower() else DEFAULT_UA)

        try:
            resp = urllib.request.urlopen(req, timeout=self.server.timeout)
        except urllib.error.HTTPError as e:
            # 上游的错误（401 缺 token / 400 参数不对）必须原样透给前端，
            # 否则用户只看到一句没头没脑的"请求失败"，没法排查
            data = e.read()
            self.send_response(e.code)
            self._cors()
            self.send_header("Content-Type", e.headers.get("Content-Type", "application/json"))
            sid = e.headers.get("mcp-session-id")
            if sid:
                self.send_header("mcp-session-id", sid)
            wa = e.headers.get("www-authenticate")
            if wa:
                self.send_header("www-authenticate", wa)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            try:
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass
            return
        except Exception as e:
            return self._send(502, "application/json; charset=utf-8",
                              json.dumps({"error": "桥连不上 %s（%s）：%s" % (name, url, e)},
                                         ensure_ascii=False).encode())

        with resp:
            self.send_response(resp.status)
            self._cors()
            self.send_header("Content-Type", resp.headers.get("Content-Type", "application/json"))
            sid = resp.headers.get("mcp-session-id")
            if sid:
                self.send_header("mcp-session-id", sid)
            self.end_headers()
            # SSE 边收边吐
            while True:
                chunk = resp.read(512)
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    break


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def __init__(self, addr, handler, servers, timeout, verbose):
        self.servers = servers
        self.timeout = timeout
        self.verbose = verbose
        super().__init__(addr, handler)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description="给 MCP 直连模式补 CORS 的本地桥")
    ap.add_argument("--config", default=os.path.join(here, "mcp-bridge.json"))
    ap.add_argument("--port", type=int)
    ap.add_argument("--timeout", type=int, default=300)
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args()

    cfg = load_config(a.config)
    servers = cfg.get("servers") or DEFAULT_CONFIG["servers"]
    port = a.port or int(cfg.get("port") or DEFAULT_CONFIG["port"])

    srv = Server(("127.0.0.1", port), Handler, servers, a.timeout, not a.quiet)
    print("=" * 62)
    print("  MCP 本地桥 v2 已启动")
    print("  监听    http://127.0.0.1:%d" % port)
    for n, s in servers.items():
        print("    /%-10s → %-26s  %s" % (n + "/mcp", s["upstream"], s.get("label", "")))
    print("  健康检查 /health    路由页 http://127.0.0.1:%d/" % port)
    print("  停止：Ctrl+C")
    print("=" * 62)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n关了。")


if __name__ == "__main__":
    main()
