# AuraTarot

AuraTarot 是一个浏览器塔罗选牌应用。用户选择牌阵、洗牌并抽取卡牌，随后查看正逆位与结果页；配置 Supabase 后，结果链接可跨设备打开。

## 功能

- 78 张牌与三种牌阵：未来十字（5 张）、六芒星（7 张）、月度运势（9 张）。
- 桌面鼠标、键盘选牌；手机横屏左右滑动预览卡牌，轻点浮起的牌确认。手机竖屏显示横屏提示。
- 可选的摄像头手势和手机摇晃洗牌；两者均需在页面上主动开启，并受浏览器权限与设备支持情况影响。
- 结果页展示牌阵、牌面和正逆位；记录先保存在本地，配置 Supabase 后再同步到云端。

## 技术栈

React 19、TypeScript、Vite 7、CSS、MediaPipe Tasks Vision、Supabase。Cinzel Decorative 与 Noto Serif SC 通过本地字体包提供，页面不依赖在线字体服务；字体许可文本见 `public/fonts/`。早期 Three.js 实验文件仍在仓库中，但当前首页与结果页不使用该场景。

## 本地开发

安装与 Vite 7 兼容的 Node.js 和 npm，在项目根目录运行：

```bash
npm ci
npm run dev
```

打开终端给出的本地地址。首次启动无需 Supabase 配置；未配置云端时，结果仅保存在当前浏览器。

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm test` | 运行自动测试 |
| `npm run build` | 检查 TypeScript 并构建到 `dist/` |
| `npm run preview` | 预览生产构建 |

## 配置

复制 `.env.example` 为 `.env.local`，按需设置以下变量：

| 变量 | 用途 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
| `VITE_TAROT_CARD_ASSET_BASE` | 牌图目录，默认 `/cards/rider-waite` |
| `VITE_TAROT_CARD_MANIFEST` | 牌图清单，默认 `/cards/rider-waite/manifest.json` |
| `VITE_MEDIAPIPE_HAND_MODEL` | 手势识别模型，默认 `/models/hand_landmarker.task` |
| `VITE_MEDIAPIPE_WASM_ROOT` | MediaPipe WASM 资源地址 |

`VITE_*` 变量会写入浏览器构建产物；不要在这里放 service role key 或其他秘密。`.env.local` 不纳入 Git。修改环境变量后，重启开发服务器或重新部署。

## 项目结构

| 路径 | 说明 |
| --- | --- |
| `src/App.tsx` | 首页与 `/spread/:id` 结果页入口 |
| `src/components/` | 牌桌、背景、按钮及共用卡牌组件 |
| `src/tarot/` | 78 张牌的数据、选牌状态与牌桌布局 |
| `src/config/spreads.json` | 三种牌阵与槽位定义 |
| `src/gesture/` | 摄像头手势与设备摇晃检测 |
| `src/results/` | 结果展示、本地存储与云端同步 |
| `src/styles.css` | 桌面、平板、手机共用的视觉样式和响应式布局 |
| `public/cards/rider-waite/` | 78 张 JPG 牌面与 `manifest.json` |
| `public/models/` | MediaPipe 手部识别模型 |
| `supabase/spread_sessions.sql` | 结果表及其访问策略 |

牌图默认直接使用 `卡牌 ID.jpg`，`manifest.json` 可覆盖文件名。图片加载失败时会显示占位牌面；开发时可用 `npm test` 检查牌组 ID、清单与实际文件是否对应。

## 结果保存与部署

应用先把结果写入当前浏览器。要让分享链接在其他设备打开，需在 Supabase SQL Editor 中执行 `supabase/spread_sessions.sql`，并在本地或 Vercel 配置上述两个 Supabase 变量。结果页出现「已保存，可通过链接分享」表示已同步；出现「已保存在此设备」时，可展开「保存详情」查看原因。

当前 SQL 策略允许匿名插入和公开读取结果记录，不适合存放私密资料。若要提供私人记录，需要重新设计认证和访问策略。

项目可由 Vercel 构建并部署。仓库的 `vercel.json` 将直接访问的 `/spread/:id` 路径交给前端处理。环境变量在构建时读取，修改后需重新部署。部署后建议验证桌面选牌、手机横屏选牌、结果牌图，以及一条已同步链接的跨设备读取。
