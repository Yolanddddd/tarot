<<<<<<< HEAD
# AuraTarot Demo Skeleton

这是基于你的 `AuraTarot PRD v4.0` 搭出来的第四版骨架，当前已经具备四个连续的验证闭环：

1. 浏览器访问摄像头，但不展示原始视频流。
2. MediaPipe Hands 识别食指指尖坐标。
3. Three.js 在神秘空间里渲染一个“灵光”。
4. 手移动时，灵光在 3D 空间中同步漂移。
5. 78 张牌以扇形铺开，灵光靠近时自动高亮最近卡牌。
6. 用户做出 `Pinch` 后，卡牌会被锁定进当前选中的牌阵槽位。
7. 在 Reveal 之前，界面只显示牌背与槽位，不暴露真实牌名。
8. Reveal 后会统一翻牌，并为每张已抽卡结算 50% 的正逆位。
9. 结果会保存为本地 `spread session`，可通过 `/spread/:id` 查看结果页。
10. 如果配置了 Supabase，结果会同步到云端，分享链接可跨设备回看。
11. 如果提供 Rider-Waite 牌图与 `manifest.json`，Reveal 后会使用真实牌面贴图。

## 当前技术选型

- React + TypeScript：负责 UI、状态和模块组合。
- Three.js：负责 3D 场景、光点、粒子与空间氛围。
- MediaPipe `@mediapipe/tasks-vision`：负责手部关键点识别。
- JSON 配置：预埋牌阵定义，后续扩展到洗牌、铺牌、选牌时直接复用。
- Supabase：负责 `spread session` 的云端持久化与分享链接回看。

## 目录结构

```text
.
├─ public/
│  ├─ cards/
│  └─ models/
├─ src/
│  ├─ components/
│  ├─ config/
│  ├─ gesture/
│  ├─ three/
│  ├─ main.tsx
│  ├─ App.tsx
│  └─ styles.css
├─ .env.example
├─ index.html
├─ package.json
└─ vite.config.ts
```

## 当前 Demo 的职责拆分

- `src/gesture/handTrackingService.ts`
  - 初始化摄像头。
  - 初始化 MediaPipe Hand Landmarker。
  - 每帧读取关键点。
  - 产出统一的 `HandTrackingFrame`。

- `src/gesture/coordinateMapper.ts`
  - 把 MediaPipe 的归一化坐标映射为 Three.js 世界坐标。
  - 这里故意单独拆出来，后面可继续接：
    - “悬停选牌”的卡位吸附
    - “捏合确认”的阈值逻辑
    - “挥手铺牌”的运动向量识别

- `src/three/auraScene.ts`
  - 纯 Three.js 场景控制器。
  - 负责粒子、悬浮环、雾感、灵光球、78 张牌扇面和牌阵槽位的创建与动画。
  - 对 React 暴露极少数方法，避免未来 3D 逻辑散落到组件里。

- `src/tarot/layout.ts`
  - 统一计算 78 张牌在扇面中的位置、旋转和悬停状态。
  - 已选卡牌会自动改为牌阵落位坐标。

- `src/tarot/useSpreadSelection.ts`
  - 负责牌阵切换、Pinch 边沿触发、防抖、锁定选牌、Reveal 和重置流程。

- `src/results/`
  - 放结果页数据结构、路径解析和本地持久化逻辑。
  - 当前支持本地缓存 + Supabase 云端持久化两种结果源。

- `src/tarot/cardArt.ts`
  - 读取 `public/cards/rider-waite/manifest.json`。
  - 若清单存在真实牌图，则 Reveal 后显示 Rider-Waite 牌面。
  - 若未显式登记，也会优先尝试按 `cardId.jpg` 的约定文件名读取。
  - 若某张牌仍未找到，则回退到生成占位牌面。

- `src/components/LightPointStage.tsx`
  - 把 React 生命周期和 Three 场景挂接起来。

- `src/config/spreads.json`
  - 放牌阵坐标蓝图，后续 UI 预选牌阵和正式选牌都能复用。

## 对 PRD 的下一步落地建议

建议按下面顺序继续推进，而不是一次性把所有效果堆满：

1. `手势闭环`
   - 现在已完成食指控制灵光。
   - 下一步补 `pinch`、`dwell`、`swipe`、`shake` 的识别层。

2. `卡牌空间`
   - 把单个灵光扩展成 `DeckSystem`。
   - 实现牌堆、扇形铺牌、卡牌高亮和吸附选牌。

3. `牌阵编排`
   - 用 `spreads.json` 驱动已抽卡的最终落位。

4. `云端结果页`
   - 当前已经接入 Supabase 客户端与结果仓库层。
   - 配好环境变量和 SQL 后，`/spread/:id` 可从云端回源读取。

5. `外部牌面素材`
   - `public/cards/rider-waite/manifest.json` 已接入。
   - 现在只要把 Rider-Waite 牌图放进对应目录，就能在 Reveal 与结果页里显示真实牌面。

## Rider-Waite 贴图接入

1. 把牌图放到：

```text
public/cards/rider-waite/
```

2. 你有两种接法：

- 最省事：直接把图片按 `cardId.jpg` 命名放进去，比如 `major-00-the-fool.jpg`、`cups-ace.jpg`。
- 需要自定义文件名时：再编辑 `manifest.json` 做映射。

3. 如果要自定义映射，编辑：

```text
public/cards/rider-waite/manifest.json
```

4. 为每张牌登记图片路径，例如：

```json
{
  "cards": {
    "major-00-the-fool": "major-00-the-fool.jpg",
    "major-01-the-magician": "major-01-the-magician.jpg",
    "cups-ace": "cups-ace.jpg"
  }
}
```

说明：

- key 使用当前牌组里的 `cardId`。
- value 可以是相对 `public/cards/rider-waite/` 的路径，也可以是以 `/` 开头的绝对公共路径。
- 如果某张牌缺失，系统会自动回退到占位牌面。
- Three.js 场景现在改成“只为已抽中的牌按需加载真牌面”，不会在页面打开时一次性把 78 张大图全部拉下来。

## Supabase 云端结果页

1. 在 Supabase 项目里执行：

```text
supabase/spread_sessions.sql
```

2. 在 `.env` 里配置：

```bash
VITE_SUPABASE_URL=你的项目URL
VITE_SUPABASE_PUBLISHABLE_KEY=你的Publishable/Anon Key
```

3. Reveal 之后：

- 会话会先写入本地缓存，保证当前页面立即可回看。
- 如果 Supabase 已配置成功，会再同步到 `public.spread_sessions`。
- 打开 `/spread/:id` 时会优先读本地，读不到再回源 Supabase。

## 本地运行

> 说明：这个工作区当前没有可用的 `node` / `npm` 命令，所以我没法在这里替你实际安装依赖和启动开发服务器，但代码结构已经按可运行项目组织好了。

1. 安装 Node.js。
   - 参考 Vite 7 当前官方要求，Node 需要 `20.19+` 或 `22.12+`。
2. 安装依赖：

```bash
npm install
```

3. 准备 Hand Landmarker 模型：
   - 默认从 `public/models/hand_landmarker.task` 读取。
   - 也可以通过 `.env` 覆盖 `VITE_MEDIAPIPE_HAND_MODEL`。

4. 启动：

```bash
npm run dev
```

## 备注

- 当前 Demo 故意不展示摄像头原始画面，符合你的“隐藏摄像头原始画面”要求。
- 当前已经包含 `Point`、`Pinch`、`Reveal`、`50% 正逆位`、Rider-Waite 贴图接入口，以及 Supabase 云端结果页。
- `@mediapipe/tasks-vision` 这里采用的是当前官方 Web 文档对应的 Hand Landmarker 路径与 API 方式，后续如果你愿意，我下一步可以直接继续把：
  - `Swipe 铺牌`
  - `音效与蜡烛火焰`
  - `结果页文案生成`
  这三块接上。
=======
# tarot
>>>>>>> 6b349ea608bc18cf466040c3b22e6a8498e07333
