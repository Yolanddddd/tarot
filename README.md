# AuraTarot

## 起始提问页（开发中）

首页现提供自定义问题、预设问题、可选背景信息与智能选阵。自定义问题需要登录；「直接抽牌」无需登录。问题和背景先保存在当前浏览器的私有 `ReadingSession` 中；抽牌后生成私人解读时，也会写入仅服务端可访问的私有表，不会写入公开的 `spread_sessions` 表。结果页只在当前已验证账号下显示原始问题。

点击「开始连接」时会先检查登录状态；未登录则弹出邮箱或手机号入口。邮箱默认发送一次性登录链接；需配置下文两个 `VITE_SUPABASE_*` 变量，并在 Supabase Auth 中启用 Email、将本地及部署站点 URL 加入允许的重定向地址。手机号使用短信验证码，另需启用 Phone 和配置短信供应商。提交问题后完成邮箱或短信验证，会自动进入推荐牌阵；等待验证的提问在同一浏览器中最多保留 24 小时。邮箱发送受到 Supabase Auth 的频率和项目邮件额度限制；正式开放前应配置自有 SMTP。

登录后，问题会发往服务端，由 DeepSeek 推荐牌阵；接口不可用、额度用尽或返回无效数据时会自动使用本地规则。推荐结果会在独立过渡页展示理由，并允许用户改选牌阵，再进入干净的抽牌页。BG 不参与选阵，也不会发送到选阵接口。「直接抽牌」的免登录 AI 整体讯息，以及自定义问题结合 BG 的私有逐张解读，均已有服务端代码；启用私有解读还需执行新增 SQL 并部署。私有记录只供本人通过服务端接口读取，不进入公开分享表。微信登录入口已移除；付费功能尚未接入。

AuraTarot 是一个浏览器塔罗选牌应用。用户选择牌阵、洗牌并抽取卡牌，随后查看正逆位与结果页；配置 Supabase 后，结果链接可跨设备打开。

## 功能

- 78 张牌与三种牌阵：未来十字（5 张）、六芒星（7 张）、月度运势（9 张）。
- 三种牌阵的每个牌位都有固定含义；新结果会保存抽牌时的牌位含义，并在结果页展示。月度运势的九张牌按学业与事业、人际与感情、自我状态分为三行。
- 桌面和 iPad 使用原有星空与 3D 选牌场景；手机横屏左右滑动预览卡牌，轻点浮起的牌确认。手机竖屏显示横屏提示。
- 可选的摄像头手势和手机摇晃洗牌；两者均需在页面上主动开启，并受浏览器权限与设备支持情况影响。
- 结果页展示牌阵、牌面和正逆位；结果可立即在本机查看，只有 Supabase 确认保存后才会显示并复制分享链接。保存失败可在结果页重试。

## 技术栈

React 19、TypeScript、Vite 7、Three.js、CSS、MediaPipe Tasks Vision、Supabase。Cinzel Decorative 与 Noto Serif SC 通过本地字体包提供，页面不依赖在线字体服务；字体许可文本见 `public/fonts/`。

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
| `SUPABASE_URL` | 服务端使用的 Supabase Project URL（可与 `VITE_SUPABASE_URL` 相同） |
| `SUPABASE_SECRET_KEY` | 仅服务端使用的 Supabase secret key；旧项目可改用 `SUPABASE_SERVICE_ROLE_KEY` |
| `DEEPSEEK_API_KEY` | 仅服务端使用的 DeepSeek API key；本地旧变量 `api_ds` 暂可兼容，部署时请使用标准名称 |
| `AI_DAILY_GENERATION_LIMIT` | 全站每日新 AI 调用上限，默认 200；包含 AI 选阵、公开整体讯息和私有解读，缓存命中不计入 |
| `VITE_TAROT_CARD_ASSET_BASE` | 牌图目录，默认 `/cards/rider-waite` |
| `VITE_TAROT_CARD_MANIFEST` | 牌图清单，默认 `/cards/rider-waite/manifest.json` |
| `VITE_MEDIAPIPE_HAND_MODEL` | 手势识别模型，默认 `/models/hand_landmarker.task` |
| `VITE_MEDIAPIPE_WASM_ROOT` | MediaPipe WASM 资源地址 |

`VITE_*` 变量会写入浏览器构建产物；不要在这里放 service role key 或其他秘密。`.env.local` 不纳入 Git。修改环境变量后，重启开发服务器或重新部署。

### 邮箱登录：必需的 Supabase 配置

中文提示和 60 秒倒计时不能解除邮件服务限制。Supabase 默认 SMTP 可能限制非项目团队成员收件地址，并有较低的项目级发送额度。对外开放邮箱登录需要配置 Custom SMTP。[官方 SMTP 说明](https://supabase.com/docs/guides/auth/auth-smtp)

1. 在邮件服务商验证发件域名，按其要求设置 SPF、DKIM 和 DMARC，并准备已验证的 Sender 地址与 SMTP host、port、username、password。
2. 在 Supabase 项目 **Authentication** 中启用 Email provider；在 **Email / SMTP Settings** 中开启 **Custom SMTP**，填写上述凭据、Sender email 和 Sender name 并保存。SMTP 密码仅保存在 Supabase 配置中，不放入 `VITE_*` 或仓库。
3. 在 **Authentication → Rate Limits** 检查邮件发送额度，并与邮件服务商的额度协调。项目邮件额度与同一邮箱默认 60 秒的重发间隔分别计算；倒计时结束不代表项目额度恢复。[官方限流说明](https://supabase.com/docs/guides/auth/rate-limits)
4. 在 **Authentication → URL Configuration** 将 **Site URL** 设为实际生产站点；在 **Redirect URLs** 添加下表对应的地址。把示例域名、端口换成当前运行地址，Preview 部署也添加自己的准确域名。[官方重定向说明](https://supabase.com/docs/guides/auth/redirect-urls)

| 环境 | 允许的回跳地址示例 |
| --- | --- |
| 本地提问页 | `http://localhost:5173/` |
| 本地结果页 | `http://localhost:5173/spread/*` |
| 生产提问页 | `https://your-domain.example/` |
| 生产结果页 | `https://your-domain.example/spread/*` |

结果 ID 是动态单段路径，所以只对 `/spread/` 后的一段使用 `*`；无需允许所有网站。申请邮件与打开邮件应使用同一浏览器和同一站点域名，否则原有待处理问题可能不在当前浏览器存储中。

5. 在 **Email Templates** 检查 **Confirm signup** 和 **Magic Link** 模板。当前页面使用一次性链接登录，两种模板都应保留下面的验证链接；只放 `{{ .Token }}` 验证码、`{{ .SiteURL }}` 首页链接或未实现的 `/auth/confirm` 地址，均不能完成当前登录流程。关闭邮件服务商的链接跟踪，避免其改写验证 URL。[官方模板说明](https://supabase.com/docs/guides/auth/auth-email-templates)

```html
<a href="{{ .ConfirmationURL }}">登录 AuraTarot</a>
```

验收时，使用自己控制的、**不属于 Supabase 团队成员**的邮箱：先在提问页提交问题并发送一次邮件，在同一浏览器打开最新链接，确认进入推荐牌阵；关闭并重开页面后应仍有会话。另在未登录的结果页申请链接，确认回到同一 `/spread/:id` 并能读取该账号已有的私人解读。分别检查新邮箱注册和已有账号登录。收到请求成功响应只代表发送请求已受理，实际到信和登录完成也必须验证；没有 SMTP 配置和真实收件验收，不能认定线上邮箱登录已修复。

邮箱登录草稿通过同一浏览器、同一站点域名的本地存储在标签页间共享；待恢复记录和完成后的交接副本自提交起最多可恢复 24 小时，过期记录在下次读取时清理。确认登录身份匹配后恢复问题和全部背景；原标签页先继续，也会保留新回调标签页所需的副本。失败时保留输入，恢复时不覆盖用户更新的内容，不同账号不恢复。草稿不会放入邮件链接，跨浏览器、设备或站点域名无法靠这份本地存储恢复。邮件链接仍是一次性的，其有效期与草稿恢复期独立；旧链接失效时，若当前已登录且身份匹配，可恢复输入，但不会自动导航。以下流程仍需用户用真实邮件验收：

- 填写问题及全部背景后申请登录，在新标签页打开最新邮件；确认内容完整，并分别验证新标签页先恢复、原标签页先进入推荐页两种顺序。
- 模拟继续选阵失败，确认输入保留且可以重试；等待登录期间修改问题或背景，确认旧草稿不会覆盖更新内容。
- 切换到另一个账号，确认不会恢复或显示原账号的待处理提问；使用匹配账号在新的回调页面验证恢复。
- 在已有匹配登录会话时打开过期或已使用的旧链接，确认只恢复输入而不自动跳转；手动点击「开始连接」后可继续。

| 现象 | 排查方向 |
| --- | --- |
| 非团队邮箱被拒绝 / `email_address_not_authorized` | 检查 Custom SMTP 是否启用且保存成功，不要通过邀请所有用户加入项目团队解决 |
| `over_email_send_rate_limit` | 查看项目邮件额度、Supabase Auth 日志和邮件服务商额度；连续重发或只等 60 秒无法解决项目限流 |
| `over_request_rate_limit` / 429 | 等待后再试，并结合错误码区分请求频率限制与邮件额度限制 |
| 请求成功但收不到邮件 | 查看垃圾箱、SMTP 投递日志、Sender 验证及域名 DNS；避免反复发送耗尽额度 |
| 收到邮件但回到错误站点或未登录 | 检查模板的 `ConfirmationURL`、URL allowlist、前端 Supabase 项目配置及最新链接是否已过期或被使用 |

## 项目结构

| 路径 | 说明 |
| --- | --- |
| `src/App.tsx` | 首页与 `/spread/:id` 结果页入口 |
| `src/components/` | 手机牌桌、背景、按钮及共用卡牌组件 |
| `src/desktop/` | 桌面和 iPad 原有的 3D 选牌场景与样式 |
| `src/tarot/` | 78 张牌的数据、选牌状态与牌桌布局 |
| `src/config/spreads.json` | 三种牌阵与槽位定义 |
| `src/gesture/` | 摄像头手势与设备摇晃检测 |
| `src/results/` | 结果展示、本地存储与云端同步 |
| `src/styles.css` | 桌面、平板、手机共用的视觉样式和响应式布局 |
| `public/cards/rider-waite/` | 78 张桌面 JPG 牌面、`mobile/` 移动版和 `manifest.json` |
| `public/models/` | MediaPipe 手部识别模型 |
| `supabase/spread_sessions.sql` | 结果表及其访问策略 |
| `supabase/anonymous_interpretations.sql` | 免登录整体解读缓存、关联表与每日额度函数 |
| `supabase/private_interpretations.sql` | 私有解读与首批 200 人、每人 3 次免费权益的原子函数 |
| `api/interpret.ts` | Vercel 服务端解读接口；密钥不会进入浏览器包 |
| `api/recommend-spread.ts` | 登录后用 DeepSeek 推荐牌阵；与解读共用每日 AI 额度 |
| `api/private-interpret.ts` | 验证登录、生成/读取/删除私人问题及 BG 的服务端接口 |

桌面牌图默认使用 `卡牌 ID.jpg`，iPhone 和 iPad 使用同图的 `mobile/卡牌 ID.jpg`（约为桌面资源的四分之一）。图片加载失败时会显示占位牌面；开发时可用 `npm test` 检查牌组 ID、清单与实际文件是否对应。

## 结果保存与部署

应用先把结果写入当前浏览器，立即显示结果；同时将其保存到 Supabase。要让分享链接在其他设备打开，需在 Supabase SQL Editor 中执行 `supabase/spread_sessions.sql`，并在本地或 Vercel 配置上述两个 Supabase 变量。只有结果页出现「云端已保存，可分享」时才会显示分享链接；网络异常时会显示失败原因，并可点击「重试保存并复制链接」。

当前 SQL 策略允许匿名插入和公开读取结果记录，不适合存放私密资料。若要提供私人记录，需要重新设计认证和访问策略。

项目可由 Vercel 构建并部署。仓库的 `vercel.json` 将直接访问的 `/spread/:id` 路径交给前端处理。环境变量在构建时读取，修改后需重新部署。部署后建议验证桌面选牌、手机横屏选牌、结果牌图，以及一条已同步链接的跨设备读取。

## 免登录 AI 整体解读

这条路径不使用 Supabase Auth，也不为访客创建账号，更不能在前端内嵌一个公共账号密码。匿名抽牌仍先按上文保存到公开的 `spread_sessions` 表；保存成功后，结果页调用 Vercel `/api/interpret`。服务端根据牌阵版本、每个牌位的卡牌及正逆位、提示词版本、服务商和模型计算 SHA-256 key，先查私有缓存，未命中才调用 DeepSeek Responses API（`deepseek-flash`，非思考模式）。相同组合在并发情况下由数据库 claim 函数协调；生成完成后将 key 关联至本次结果记录。分享页只读取已生成的「整体讯息」，不把私人问题或 BG 送入这个接口。

启用顺序：

1. 在 Supabase SQL Editor 先执行 `supabase/spread_sessions.sql`，再执行 `supabase/anonymous_interpretations.sql`。
2. 在 Vercel 项目环境变量中设置 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_URL`、`SUPABASE_SECRET_KEY` 和 `DEEPSEEK_API_KEY`。不要给 secret key 或 DeepSeek key 加 `VITE_` 前缀，也不要提交到 Git。`.env.example` 只放空白模板；真实本地配置放在被 Git 忽略的 `.env.local`。
3. 重新部署，直接抽一组牌；确认结果显示「云端已保存」及「AI 整体讯息」。相同完整组合再次出现时可复用缓存，结果页「解读缓存」内可查看 key。

部署后可先直接打开 `/api/interpret`（不带记录 ID）：应得到 JSON 格式的 400 错误，而不是网站 HTML。这是只读路由检查，不会调用 DeepSeek。`vercel.json` 仅将 `/draw`、`/recommendation`、`/spread/:id` 回退到 SPA 首页，不能将 `/api/*` 改写到 `index.html`。

`npm run dev` 只运行 Vite 静态前端，不提供 `/api/interpret`、`/api/recommend-spread` 或 `/api/private-interpret`。本地联调服务端接口需使用 Vercel 开发环境或部署预览。数据库脚本与接口代码已经就位，但在没有实际云端项目和密钥的环境中，无法完成真实 API 调用验证。

## 自定义问题的私人 AI 解读

完成邮箱或短信验证、抽牌并成功云端保存后，结果页会自动请求私人解读。接口验证 Supabase 用户令牌，只把该用户的原始问题、可选 BG 和结构化逐张解读写入 `private_interpretations`；这张表与权益表对浏览器角色均无直接访问权限。同一用户重开同一结果时读已有解读，不再调用模型或扣次数。分享链接仍只提供牌阵与由不含问题/BG 的匿名接口生成的整体讯息，私有文本不会送到分享访客的浏览器。用户可在结果页删除云端私人记录和本机提问；已使用的免费次数不会退还。

首批 200 位按**第一次成功生成私人解读**的服务端时间确定资格，不按注册时间。合资格用户最多获得 3 次成功生成；失败或刷新不扣次数。并发预约由数据库事务控制，失败会释放预约。第 201 位与用完 3 次的用户目前看到明确提示，**不会自动收费**。全站每日调用量还有 `AI_DAILY_GENERATION_LIMIT` 的独立成本保护，但它与每人的免费权益不是一回事。

启用与验收：

1. 在已执行前两份 SQL 的同一 Supabase 项目中，执行 `supabase/private_interpretations.sql`。不要对暂停的旧项目执行。
2. 确认 Vercel Preview/Production 所需的五个变量已经设置，且指向同一个实际数据库；重新部署。邮箱登录须在 Supabase Auth 启用并允许站点重定向地址，短信登录另需短信供应商。
3. 用自己的测试账号提问、抽完牌，确认公开整体讯息和私人逐张解读都出现；刷新应直接读取而不再扣次数。无痕窗口打开分享链接，确认看不到原始问题、BG、逐张解读和反思问题。
4. 在 Supabase Table Editor 查看 `private_reading_entitlements` 的 `first_success_at`、`used_count`，以及 `private_interpretations` 的 `status` 和 token 用量。不要把私人行内容发到公开聊天或截图中。

目前尚未用真实 DeepSeek 请求测量 5/7/9 张牌的实际 token 与峰时费用；虽然私有输出限制为 460 token，用户提出的「每次完整体验不超过 $0.001」**不能据此视为已验证**。正式开放前应抽样测量路由、公开整体和私有解读三次调用的合计费用，并按结果调整生成策略或预算。微信登录已从首期范围移除；付费、咨询入口资料、塔罗天赋画像，以及公开分享的逐项主动勾选功能仍需后续工作。

缓存命中依赖完整有序牌阵，78 张牌及正逆位组合非常多，不能预期多数新抽牌会命中。每日上限保护总调用量，但公开免登录接口仍可能被恶意访客耗尽额度；正式推广前建议再加边缘层按 IP 限速、监控和 DeepSeek 账户余额告警。匿名接口只生成可公开分享的整体讯息；逐张深入解读由独立的登录后私有接口处理，不能放进公开表。DeepSeek Flash 的高峰/低峰价格不同，原先按 GPT-4o mini 算出的每次 $0.001 预算不能直接沿用，需以实际 token 用量复核。
