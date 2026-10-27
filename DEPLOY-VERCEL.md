# 部署到 Vercel（本仓库自定义版）

本仓库是 [xiaolongbao0709/ai-virtual-phone](https://github.com/xiaolongbao0709/ai-virtual-phone) 的 fork，
在官方 `main` 基础上做了三处自定义增强：**新增「天气」应用**、**新增 ElevenLabs TTS 供应商**、**新增 OpenCode Go 官方 API 供应商**（见下）。

- 线上地址：https://ai-virtual-phone-weather.vercel.app
- Vercel 项目：`ai-virtual-phone-weather`（Production Branch = `main`）

## 一、自定义改动

| 文件 | 说明 |
| --- | --- |
| `components/weather/weather-app.tsx` | 天气应用（当前天气 / 24 小时 / 7 天预报 / 城市搜索 / 定位 / °C·°F） |
| `styles/weather.css` | 天气应用样式（晴雨雪雾雷 + 昼夜自动换天空配色） |
| `lib/desktop-config.ts` | 新增 `weather` 图标定义，并加入 `PAGE_3_DEFAULT`（第 3 页第 6 个图标，前排右格） |
| `components/icon-glyph.tsx` | 图标字形 `mdiWeatherPartlyCloudy` |
| `components/desktop-shell.tsx` | `renderAppBody` 增加 `weather` 分支 |
| `app/globals.css` | 引入 `styles/weather.css` |
| `lib/settings-types.ts` | `VoiceApiConfig` 增加 `elevenSettings`（稳定度 / 相似度 / 风格 / 语速 / Speaker Boost / 输出格式） |
| `lib/tts-service.ts` | 新增 `synthesizeElevenLabs`，经站内代理合成 mp3 |
| `app/api/voice/elevenlabs-tts/route.ts` | ElevenLabs 语音合成代理（`xi-api-key`，避开浏览器 CORS，密钥不直接出网） |
| `app/api/voice/elevenlabs-voices/route.ts` | ElevenLabs 音色列表代理（配合「拉取音色列表」按钮） |
| `components/settings/voice-settings.tsx` | 服务商下拉新增 `ElevenLabs (11labs)`，含模型、四个滑杆、Speaker Boost 开关、输出格式 |
| `lib/api-helpers.ts` | `determineBaseUrl` 增加 `OpenCodeGo`（`https://opencode.ai/inference/openai/v1`），新增 `needsServerProxy`；`simpleLLMCall` 走代理 |
| `lib/llm-provider-adapter.ts` | `buildProviderRequest` 对 OpenCodeGo 置 `serverProxy`，交给 `/api/llm-proxy` 转发 |
| `lib/llm-http.ts` | 原有的 `serverProxy` 出口终于有路由可用（此前只有注释） |
| `app/api/llm-proxy/route.ts` | 受限转发路由：仅允许 `opencode.ai` / `api.opencode.ai` 的 https 请求，逐跳头过滤，SSE 透传 |
| `lib/mascot-engine.ts` | 两处直连 `request.url` 改走 `fetchLlmPayload`，避免绕开代理 |
| `components/settings/api-settings.tsx` | 服务商下拉新增 `OpenCode Go（官方网关）`；模型列表走代理并兼容 `{data}` / `{models}` / 数组三种返回 |

天气部分：数据源为 [Open-Meteo](https://open-meteo.com/)，**无需 API Key**；城市搜索用 Open-Meteo
Geocoding，定位走浏览器 `navigator.geolocation`（HTTPS 下可用）。所选城市与单位保存在本地
`localStorage`（`avp.weather.v1`）。

## 二、一键部署

1. 在 Vercel 新建项目，Import Git Repository 选 `liuyunyun1hao/ai-virtual-phone`，Framework 会自动识别为 **Next.js**。
2. 环境变量至少加一条：

   | Key | Value | 环境 |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SELF_HOSTED_MODE` | `true` | Production / Preview / Development |

   不设置会走作者的官方账号/激活码逻辑；自部署必须设为 `true`。
3. 其余变量全部可留空（`SUPABASE_*`、`MIXOLOGY_SUPABASE_*`、`RESEND_*` 等只在启用对应云功能时才需要）。
4. Deploy。构建命令沿用默认 `npm run build` 即可（脚本已包含 weixin/push 产物构建与 backdrop-filter 修补）。
5. 之后向 `main` 推送即自动重新部署。

## 三、本地运行

```bash
npm install
cp .env.example .env.local   # 填入 NEXT_PUBLIC_SELF_HOSTED_MODE=true
npm run dev                  # http://localhost:3000
```


## 四、OpenCode Go（官方网关）

在「设置 → 大模型接口 → 新增配置」里把服务商选成 **OpenCode Go（官方网关）**，填入
[OpenCode Console](https://opencode.ai/console) 签发的 API Key 即可，Base URL 留空默认
`https://opencode.ai/inference/openai/v1`。

- 请求统一经本站 `/api/llm-proxy` 转发（网关未开放浏览器 CORS），密钥随转发请求出网，不暴露给第三方；
- 「拉取模型列表」会请求 `https://opencode.ai/inference/v1/models`，账户可见的模型（含 `*-free` 免费模型）都会列出来；
- 本应用走 OpenAI 兼容的 `/chat/completions`，因此 DeepSeek / Qwen / GLM / Kimi / MiniMax / Mistral 等模型可用；
  GPT 系列（`/responses`）、Claude（`/anthropic/v1/messages`）、Gemini（`/google/v1beta`）是别的协议，暂不支持——
  需要的话建议先用 Custom 供应商填对应端点，或等后续版本支持 Responses API。
- 免费模型（如 `deepseek-v4.1-flash-free`、`glm-5.3-flash-free`）在 OpenCode 官方客户端以外调用可能被拒，报错会原样显示在测试结果里。

## 五、说明

- 仓库体积较大（`public/` 约 160MB，含字体与 3D 模型），首次构建约 3 分钟。
- 该版本仅供个人自部署使用，请遵守原仓库 LICENSE 与 NOTICE。
