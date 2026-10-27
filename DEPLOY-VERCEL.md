# 部署到 Vercel（本仓库自定义版）

本仓库是 [xiaolongbao0709/ai-virtual-phone](https://github.com/xiaolongbao0709/ai-virtual-phone) 的 fork，
在官方 `main` 基础上做了一处自定义增强：**新增「天气」应用**（见下）。

- 线上地址：https://ai-virtual-phone-weather.vercel.app
- Vercel 项目：`ai-virtual-phone-weather`（Production Branch = `main`）

## 一、自定义改动

| 文件 | 说明 |
| --- | --- |
| `components/weather/weather-app.tsx` | 天气应用（当前天气 / 24 小时 / 7 天预报 / 城市搜索 / 定位 / °C·°F） |
| `styles/weather.css` | 天气应用样式（晴雨雪雾雷 + 昼夜自动换天空配色） |
| `lib/desktop-config.ts` | 新增 `weather` 图标定义，并加入 `DOCK_DEFAULT`（Dock 第 5 个图标） |
| `components/icon-glyph.tsx` | 图标字形 `mdiWeatherPartlyCloudy` |
| `components/desktop-shell.tsx` | `renderAppBody` 增加 `weather` 分支 |
| `app/globals.css` | 引入 `styles/weather.css` |

数据源为 [Open-Meteo](https://open-meteo.com/)，**无需 API Key**；城市搜索用 Open-Meteo
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

## 四、说明

- 仓库体积较大（`public/` 约 160MB，含字体与 3D 模型），首次构建约 3 分钟。
- 该版本仅供个人自部署使用，请遵守原仓库 LICENSE 与 NOTICE。
