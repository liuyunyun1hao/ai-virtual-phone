# 部署到 Vercel（给自己用）

> 这个仓库是 [fallen0930/ai-virtual-phone](https://github.com/fallen0930/ai-virtual-phone) 的 fork。
> 授权 AGPL-3.0-only，仅自用或亲友使用；`LICENSE`、`NOTICE` 请保留。详见根目录 README 顶部说明。

---

## 为什么不在这台手机上跑

Next.js 项目，作者自己的 dev 脚本就写着 `--max-old-space-size=4096`（4GB 堆）。
实测这台机器：内存 11GB 里已用 9.3GB、**空闲只剩 154MB**、swap 已用 7.6GB。
硬跑会把整机拖进重度 swap，连带把容器里的其它东西一起拖死。

所以用 Vercel：**云端构建、云端运行，手机只当浏览器用。**

---

## 第一步：导入 Vercel

1. 打开 [vercel.com/new](https://vercel.com/new)
2. 用 **GitHub 账号**登录（第一次会让你授权 Vercel 读仓库）
3. 在仓库列表里找到 **`ai-virtual-phone`**（你 fork 的那个），点 **Import**
4. **分支选 `dev`**（这个项目的最新功能都在 dev 上；如果下拉框默认给了别的分支，改一下）

## 第二步：环境变量

导入页面会有一个 **Environment Variables** 区块。

**正常情况下你什么都不用填** —— 仓库根目录的 `vercel.json` 已经把
`NEXT_PUBLIC_SELF_HOSTED_MODE=true` 写进去了，它会让应用跳过账号/激活码门禁，
直接用本地单机账号进入。

如果部署完打开发现它要你登录或输激活码，那就是这个变量没吃到，回
**Settings → Environment Variables** 手动加一条：

| Name | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_SELF_HOSTED_MODE` | `true` | Production / Preview / Development 全勾 |

加完要在 **Deployments** 里点一次 **Redeploy**（`NEXT_PUBLIC_*` 是构建期内联的，不重建不生效）。

## 第三步：等构建

点 **Deploy** 之后它会 clone 仓库、装 589 个包、跑 `next build`。
**这是个 30 万行的项目，首次构建大概 5～15 分钟**，别以为卡死了。

构建命令用的是 `package.json` 里的 `build`：

```
build-weixin-assistant-dist.mjs → build-personal-push-dist.mjs → next build → restore-backdrop-filter.mjs
```

`next.config.mjs` 里已经 `ignoreBuildErrors: true`，历史 TS 错误不会让构建失败。

## 第四步：打开站点

构建完会给你一个地址，形如：

```
https://ai-virtual-phone-xxxx.vercel.app
```

用手机浏览器打开就能用了。想加到桌面（PWA）：Chrome 菜单 →「添加到主屏幕」。

---

## 首次使用

进去之后只差一步：

**设置 → API 设置** → 填 **Base URL + API Key + 模型名**

支持 OpenAI 兼容接口 / Anthropic / Google Gemini。想省事的话，参考本仓库
`tools/mcp-bridge/README.md` 里那套思路——不过那个是给 MCP 用的，跟这里无关。

---

## 哪些功能需要额外配置

**不配也能用**：聊天、群聊、朋友圈、角色卡、世界书、预设、剧情、视觉小说、日记、便签墙、
地图、游戏大厅、查手机、访谈、自定义 APP、主题、壁纸、贴纸。

**要自己配才有**（不配就自动隐藏，不会报错）：

| 功能 | 需要什么 | 配置位置 |
|---|---|---|
| 云备份 / 离线推送 / 微信接入 / 现实桥 | 自己的 Supabase（应用内可一键创建「个人云」） | 设置 → 云服务部署 |
| AI 生图 | 生图代理地址 或 各家 key | 应用内生图设置 |
| 语音合成（Minimax） | Minimax API | 设置 |
| 在线音乐 | 自部署的 NeteaseCloudMusicApi 实例 | 音乐 APP 设置 |
| 3D 世界搭建 | Tripo API key | 世界搭建界面内填 |

Supabase 相关的建表 SQL 都在仓库 `docs/` 目录里，按功能名对应执行即可。

---

## 出问题了看哪

| 现象 | 原因 |
|---|---|
| 打开就要登录 / 激活码 | `NEXT_PUBLIC_SELF_HOSTED_MODE` 没生效，见第二步 |
| 构建失败 | 看 Vercel 的 Build Logs，多半是某个 `scripts/*.mjs` 报错 |
| 页面能开但白屏 | 浏览器控制台看报错；也试试换 `test` 分支（作者留的设备兼容版） |
| 想要最新功能 | 上游更新后：`git fetch upstream && git merge upstream/dev && git push origin dev` |

---

## 上游同步

```bash
git remote add upstream https://github.com/fallen0930/ai-virtual-phone.git   # 只需一次
git fetch upstream
git merge upstream/dev
git push origin dev
```

`vercel.json` 和 `tools/mcp-bridge/` 是本 fork 自己加的东西，合上游时不会冲突
（上游没有这两个路径）。部署即自动更新。
