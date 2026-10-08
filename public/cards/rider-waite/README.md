# Rider-Waite 牌图

此目录已包含 78 张用于网页展示的 JPG 牌图和 `manifest.json`。文件名与 `src/tarot/tarotDeck.ts` 中的卡牌 ID 对应，例如 `major-00-the-fool.jpg`、`cups-ace.jpg`。这些图片由原项目资源缩小到最多 960 像素宽并压缩，图像内容未替换。

手机与 iPad 会请求 `mobile/` 中对应的 480 像素宽版本，共约 5.9 MB；桌面仍使用主目录中的约 21.4 MB 图片。画面内容相同，仅尺寸和 JPEG 压缩率不同。配置自定义牌图目录时，请同时提供其 `mobile/` 子目录。

桌面前端会请求 `卡牌 ID.jpg`；`manifest.json` 可指定其他文件名或路径。运行 `npm test` 可检查全部 78 张牌图及移动版文件的完整性。
