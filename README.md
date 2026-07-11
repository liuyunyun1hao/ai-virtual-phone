# AI Virtual Phone

完整部署步骤（首次）

在平板的 Termux 中依次执行以下命令：

```bash
# 1. 更新包列表并安装依赖
pkg update && pkg upgrade
pkg install git nodejs-lts

# 2.（可选，防休眠）安装 Termux:API 并获取唤醒锁
pkg install termux-api
termux-wake-lock

# 3. 克隆仓库
git clone -b main https://github.com/liuyunyun1hao/ai-virtual-phone.git
cd ai-virtual-phone

# 4. 创建环境配置文件
cp .env.example .env.local
# （如需修改，用 nano .env.local，确保 NEXT_PUBLIC_SELF_HOSTED_MODE=true 存在）

# 5. 安装依赖（如内存小可加大限制）
export NODE_OPTIONS="--max-old-space-size=2048"
npm install

# 6. 启动服务（监听所有网络接口）
HOST=0.0.0.0 npm run dev
```

看到 [server] dev ready at http://0.0.0.0:3001 后，打开平板浏览器访问 http://localhost:3001 即可。
若要手机访问，先查看平板 IP：

```bash
ifconfig | grep inet
```

找到 wlan0 的地址（如 192.168.1.105），手机浏览器访问 http://该IP:3001。

---

以后每次启动（一键命令）

方式一：直接执行

```bash
cd ~/ai-virtual-phone && termux-wake-lock && HOST=0.0.0.0 npm run dev
```

方式二：创建永久别名（推荐）

```bash
echo 'alias phone="cd ~/ai-virtual-phone && termux-wake-lock && HOST=0.0.0.0 npm run dev"' >> ~/.bashrc
source ~/.bashrc
```

之后每次打开 Termux，只需输入：

```bash
phone
```

就能一键启动服务。

---

提醒

· 首次访问页面需等待编译（终端显示 ✓ Compiled / 完成）。
· 若页面异常，尝试停止服务（Ctrl+C），清理缓存后重启：rm -rf .next && phone。
· 手机访问必须与平板连同一 WiFi，且防火墙/安全软件未拦截 3001 端口。
