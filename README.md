# 泰聚達 THAI AMULET ARCHIVE

泰國佛牌與聖物電商前台與可重用營運後台。泰聚達是第一個示範前台；文章、商品、庫存、訂單與 SEO 能力則以可支援多站台的共用核心發展。

## 目前功能

- 前台購物車會依站台保存在瀏覽器，只保存商品 ID 與數量，顯示價格一律由目前商品資料重建。
- 「一物一拍」商品限制單次只能加入 1 件。
- 本機版可送出不含線上付款的商品保留單；伺服器會重新核對價格、庫存與限購數量。
- `/admin/` 提供 Tiptap 富文字文章編輯、草稿／發布、版本紀錄與 SEO 欄位。
- `/admin/products/` 提供商品、藏品履歷、庫存與商品 SEO 管理。
- `/admin/orders/` 提供訂單查詢與受狀態機限制的確認、處理、出貨、完成及取消流程。
- D1 儲存站台、文章版本、商品、分類、庫存、訂單、訂單明細與庫存流水，各資料以 `site_id` 隔離。
- `/api/content/articles` 提供已發布文章的唯讀內容 API；後台寫入 API 在非本機環境要求已驗證的管理員身分。
- 3 篇已隨建置保存的收藏誌文章有獨立 SEO 路由、canonical、Open Graph、Article 與 BreadcrumbList 結構化資料。

## 本機開發

```bash
npm ci
npm run dev
```

## Windows 本機部署版

一般使用請直接雙擊 `啟動泰聚達本機版.cmd`。啟動器會準備最新版網站，使用本機 Worker 與獨立的 `.local-data` 資料庫，並在背景持續運行：

- 前台：`http://127.0.0.1:3000/`
- 文章管理後台：`http://127.0.0.1:3000/admin/`
- 商品與庫存：`http://127.0.0.1:3000/admin/products/`
- 訂單管理：`http://127.0.0.1:3000/admin/orders/`

另提供 `停止泰聚達本機版.cmd` 與 `查看泰聚達本機版狀態.cmd`。完整操作與備份方式請見 `本機版使用說明.md`。

## GitHub Pages

推送到 `main` 後，GitHub Actions 會建立靜態前台並發布至 GitHub Pages。建置流程會明確排除 `/admin/`、寫入 API 與訂單個資表單，因為 GitHub Pages 無法提供安全登入、D1 或寫入 API；管理後台必須部署在可執行 Worker 與 D1 的環境。

目前 Windows 本機版使用 Cloudflare D1 的本機資料檔，不需要付費資料庫。日後可把相同 schema 與 Worker API 遷移到 Cloudflare D1 免費額度環境；公開接單前仍須設定 `ADMIN_EMAIL_ALLOWLIST`，並加入 Rate Limiting 或 Turnstile。

> 後台新發佈的文章會立即出現在本機首頁閱讀器；要取得可被搜尋引擎收錄的獨立靜態文章網址，仍需把文章同步進建置快照並重新建置。這是下一階段的發佈工作流，不應把純靜態 Pages 當作即時 CMS。

> 品牌、商品與來源內容目前皆為展示資料，正式上架前需逐件覆核。
