#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
樱语 · 本地 CORS 代理
=====================

为什么需要它？
-------------
浏览器有个安全规定（CORS）：网页要往"另一个端口/域名"发请求，如果带了
Authorization 头或者 Content-Type: application/json，浏览器会**先发一个
OPTIONS 预检请求**问对方"我能发吗"，对方答了才真的发。

而 127.0.0.1:9355 那个网关是个只实现了 GET/POST 的简易服务，
对 OPTIONS 一律回 501 —— 浏览器认为预检失败，于是真正的请求根本发不出去。

这个脚本就是垫在中间的一层：它老老实实回答预检，再把请求原样转给上游，
把响应（包括流式输出）原样吐回来。凭据不经手这里，它只做转发。

用法
----
    python3 cors-proxy.py                        # 默认转发到 http://127.0.0.1:9355
    python3 cors-proxy.py --port 9366
    python3 cors-proxy.py --upstream http://127.0.0.1:9355

然后在樱语的「API 设置」里：
    Base URL : http://127.0.0.1:9366/zen/go/v1
    API Key  : 你原来那个凭据
   模型名   : 随便挑一个（点下面的按钮会自动填）
"""

import argparse
import http.server
import socketserver
import sys
import urllib.error
import urllib.request

UPSTREAM = "http://127.0.0.1:9355"
PORT = 9366

# 透传这几个头就够了，别的（Host、Content-Length 等）由 urllib 自己算
PASS_HEADERS = ("Content-Type", "Authorization", "Accept", "X-Api-Key", "User-Agent")
# 不带 UA 的话，Python 默认的 "Python-urllib/3.x" 会被 Cloudflare 直接 403
# （"Access denied | opencode.ai used Cloudflare to restrict access"）
DEFAULT_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"   # 不带 Content-Length，写到 EOF 就是结束 —— 流式最省事
    server_version = "SakuraCorsProxy/1.0"

    # 别把每个请求都打到日志里刷屏（SSE 会刷得很难看）
    def log_message(self, fmt, *args):
        if self.server.verbose:
            sys.stderr.write("  %s\n" % (fmt % args))

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        # 注意：Allow-Headers 里不能只写 *，规范里通配符不覆盖 Authorization，必须点名
        self.send_header("Access-Control-Allow-Headers",
                         "Content-Type, Authorization, X-Api-Key, Accept")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        # Chrome 私有网络访问（PNA）：https 页面 → 127.0.0.1 需要这个头
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "86400")
        self.send_header("Cache-Control", "no-store")

    def do_OPTIONS(self):
        """预检 —— 这一句就是整个脚本存在的理由"""
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        self._relay("GET")

    def do_POST(self):
        self._relay("POST")

    def _relay(self, method):
        url = self.server.upstream.rstrip("/") + self.path
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
        # urllib 会自动带 "Python-urllib/3.x"，Cloudflare 看到就 403 / 1010。
        # 浏览器发来的正常 UA 照转，其他一律换成 DEFAULT_UA。
        ua = (self.headers.get("User-Agent") or "").strip()
        if not ua or "python" in ua.lower() or "urllib" in ua.lower():
            req.add_header("User-Agent", DEFAULT_UA)
        else:
            req.add_header("User-Agent", ua)

        try:
            resp = urllib.request.urlopen(req, timeout=self.server.timeout)
        except urllib.error.HTTPError as e:
            # 上游报的错（401 凭据不对 / 400 模型名不对）要原样透给前端，
            # 不然用户只会看到一句没头没脑的"请求失败"
            data = e.read()
            self.send_response(e.code)
            self._cors()
            self.send_header("Content-Type", e.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        except Exception as e:
            msg = ('{"error":{"message":"代理连不上上游 %s：%s"}}' % (url, e)).encode()
            self.send_response(502)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)
            return

        with resp:
            self.send_response(resp.status)
            self._cors()
            self.send_header("Content-Type", resp.headers.get("Content-Type", "application/json"))
            self.end_headers()
            # 一块一块往外吐，模型边生成边到前端（打字机效果靠这个）
            while True:
                chunk = resp.read(1024)
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    break   # 用户关了页面，正常现象


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def __init__(self, addr, handler, upstream, timeout, verbose):
        self.upstream = upstream
        self.timeout = timeout
        self.verbose = verbose
        super().__init__(addr, handler)


def main():
    ap = argparse.ArgumentParser(description="给樱语用的本地 CORS 代理")
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--upstream", default=UPSTREAM)
    ap.add_argument("--timeout", type=int, default=600, help="等模型回复的超时（秒）")
    ap.add_argument("--quiet", action="store_true", help="不打请求日志")
    a = ap.parse_args()

    srv = Server(("127.0.0.1", a.port), Handler, a.upstream, a.timeout, not a.quiet)
    print("=" * 56)
    print("  樱语 · 本地 CORS 代理已启动")
    print("  监听      http://127.0.0.1:%d" % a.port)
    print("  转发到    %s" % a.upstream)
    print("  在樱语里填 http://127.0.0.1:%d/zen/go/v1" % a.port)
    print("  停止：Ctrl+C")
    print("=" * 56)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n关了。")


if __name__ == "__main__":
    main()
