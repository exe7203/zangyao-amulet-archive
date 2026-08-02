# 泰聚達 THAI AMULET ARCHIVE

泰國佛牌與聖物電商前台與共用內容後台。泰聚達是第一個示範前台；文章、SEO 與未來商品／訂單能力則以可支援多站台的共用核心發展。

## 目前功能

- 前台購物車會依站台保存在瀏覽器，只保存商品 ID 與數量，顯示價格一律由目前商品資料重建。
- 「一物一拍」商品限制單次只能加入 1 件。
- `/admin/` 提供 Tiptap 富文字文章編輯、草稿／發布、版本紀錄與 SEO 欄位。
- D1 儲存 `sites`、`articles` 與 `article_revisions`，每篇內容以 `site_id` 隔離。
- `/api/content/articles` 提供已發布文章的唯讀內容 API；後台寫入 API 在非本機環境要求已驗證的管理員身分。

## 本機開發

```bash
npm ci
npm run dev
```

## Windows 本機部署版

一般使用請直接雙擊 `啟動泰聚達本機版.cmd`。啟動器會準備最新版網站，使用本機 Worker 與獨立的 `.local-data` 資料庫，並在背景持續運行：

- 前台：`http://127.0.0.1:3000/`
- 文章管理後台：`http://127.0.0.1:3000/admin/`

另提供 `停止泰聚達本機版.cmd` 與 `查看泰聚達本機版狀態.cmd`。完整操作與備份方式請見 `本機版使用說明.md`。

## GitHub Pages

推送到 `main` 後，GitHub Actions 會建立靜態前台並發布至 GitHub Pages。建置流程會明確排除 `/admin/`，因為 GitHub Pages 無法提供安全登入、D1 或寫入 API；管理後台必須部署在可執行 Worker 與 D1 的環境。

> 品牌、商品與來源內容目前皆為展示資料，正式上架前需逐件覆核。
