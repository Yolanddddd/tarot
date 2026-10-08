# Rider-Waite 牌图

此目录已包含 78 张用于网页展示的 JPG 牌图和 `manifest.json`。文件名与 `src/tarot/tarotDeck.ts` 中的卡牌 ID 对应，例如 `major-00-the-fool.jpg`、`cups-ace.jpg`。这些图片由原项目资源缩小到最多 960 像素宽并压缩，图像内容未替换。

前端会直接请求 `卡牌 ID.jpg`；`manifest.json` 可指定其他文件名或路径。运行 `npm test` 可检查全部 78 张牌图的清单映射与文件完整性。
