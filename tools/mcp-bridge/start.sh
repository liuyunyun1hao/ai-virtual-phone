#!/usr/bin/env bash
# 后台常驻启动 MCP 桥。重复执行会先停掉旧的。
# 用法：./start.sh        ./start.sh stop
set -u
cd "$(dirname "$0")"
PORT=$(python3 -c "import json;print(json.load(open('mcp-bridge.json'))['port'])" 2>/dev/null || echo 9377)

stop_old() {
  for p in $(pgrep -f "mcp_bridge\.py" 2>/dev/null); do
    [ "$p" = "$$" ] && continue
    kill "$p" 2>/dev/null && echo "  停掉旧进程 $p"
  done
  sleep 1
}

case "${1:-start}" in
  stop)
    stop_old
    echo "已停止。"
    exit 0
    ;;
esac

stop_old

if ! command -v python3 >/dev/null; then
  echo "❌ 没有 python3"; exit 1
fi

setsid python3 mcp_bridge.py --quiet > /tmp/mcp-bridge.log 2>&1 < /dev/null &
sleep 2

if curl -s -m 5 "http://127.0.0.1:$PORT/health" > /dev/null 2>&1; then
  echo "✅ MCP 桥已在后台运行（端口 $PORT）"
  curl -s -m 5 "http://127.0.0.1:$PORT/health" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for k,v in d['servers'].items():
    flag='✅' if v.get('reachable') else '❌'
    print(f\"   {flag} {v['label']:14s} → 应用里填 {v['app_url']}\")
"
  echo
  echo "   日志：/tmp/mcp-bridge.log      停止：./start.sh stop"
else
  echo "❌ 没起来，看看日志：tail -30 /tmp/mcp-bridge.log"
  exit 1
fi
