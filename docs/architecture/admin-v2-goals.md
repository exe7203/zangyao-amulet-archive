# 泰聚達 Admin v2 重構目標（可驗收）

> 部署 ≠ 完工。本文件定義完成標準與逐項驗收結果。

---

## 驗收總目標（本輪）

1. 後台六大工作區皆為**獨立目錄 + 新視覺語言**（`--accent #2f6b52`、左右分欄或總覽紙感背景）
2. `npm run test:core` 113 全綠、`npm run typecheck` 通過
3. Cloudflare 線上後台可登入，逐頁載入正確、側欄可切換
4. R2 媒體上傳刻意不啟用；商品／文章繼續用公開圖片網址

---

## 模組完成定義與驗收狀態

| # | 模組 | 目錄 | 完成標準 | 程式 | 測試 | 線上 |
|---|------|------|----------|------|------|------|
| 1 | 總覽 | `admin/dashboard/` | AdminTopbar + adminFetch + 新 CSS | ✅ | ✅ | ✅ |
| 2 | 商品／庫存 | `admin/catalog/` | list + form + inventory + categories | ✅ | ✅ | ✅ |
| 3 | 訂單 | `admin/orders/` | list + detail + 履約 | ✅ | ✅ | ✅ |
| 4 | 文章 | `admin/articles/` | list + document + inspector | ✅ | ✅ | ✅ |
| 5 | 網站 | `admin/site/` | page-list + settings + canvas | ✅ | ✅ | ✅ |
| 6 | 媒體 | `admin/media/` | 新 media.module.css；R2 關閉時清楚提示 | ✅ | ✅ | ✅ |
| 7 | 殼層／登入 | `admin-chrome` + `login/` | 側欄導覽 + 帳密 session | ✅ | ✅ | ✅ |

**刻意不做（營運決策）**

- R2 綁卡啟用
- `STORE_ORDERS_ENABLED` 接單開關（維持關閉）
- Cloudflare Access（可選，文件在 `.cloudflare/SETUP.md`）

---

## 自動化驗收

```powershell
npm run test:core
npm run typecheck
curl https://taijuda-amulet-archive.exe7203.workers.dev/api/health
```

帳密：`exe7203` / `12345678`

線上：

- 前台 https://taijuda-amulet-archive.exe7203.workers.dev/
- 後台 https://taijuda-amulet-archive.exe7203.workers.dev/admin/

---

## 後台完整度誠實結論（2026-08-25 更新）

| 問題 | 答案 |
|------|------|
| UI 重構是否完成？ | ✅ 六大模組已拆檔＋新視覺 |
| Worker 公開站：後台發布後可見？ | ✅ 商品／文章列表／文章詳情／首頁文案與導覽即時讀 D1 |
| 全站預設 SEO 能否自設？ | ✅ 網站→全站設定：預設標題／描述／OG 圖 |
| GitHub Pages／靜態 SEO 快照 | ⚠️ 仍需本機「同步並建立公開版」 |
| R2／接單／正式網域 | ⏸ 刻意未開或需你提供網域 |

### SEO：後台可自設

- **全站**：預設 SEO 標題、Meta 描述、OG 圖（網站→全站設定）
- **文章**：SEO 標題、Meta 描述、Canonical、OG 圖、noindex、關鍵字、首圖 alt
- **自訂頁**：SEO 標題、Meta 描述、Canonical、OG 圖、noindex
- **商品**：seoTitle、seoDescription、主圖＋alt、`seoReady`

### 仍需注意

- 正式收錄需要自有網域（非 `.workers.dev`）
- GitHub Pages 公開版仍走快照同步腳本（sitemap／`<html>` metadata 仍偏快照）
- 商品進 sitemap 需 `NEXT_PUBLIC_CATALOG_VERIFIED=1`
- R2 媒體上傳、線上接單仍關閉
- 儀表板待辦／快捷已帶篩選與 `?new=1`；模組會接住 query
- 客服／配送／退換貨頁與 header／footer 已 live 讀 D1；隱私權頁仍以靜態文案為主

---

## 線上手動檢查清單

- [x] 登入成功，進入總覽（exe7203／12345678）
- [x] 側欄：總覽／文章／商品／訂單／網站／媒體 皆可切換
- [x] 商品：左側清單 + 右側分頁（基本／規格／圖片／庫存）
- [x] 訂單：左側清單 + 右側詳情（空訂單狀態正常）
- [x] 文章：左側清單 + 編輯器 + 右側 inspector tabs
- [x] 網站：左側頁面清單 + Puck／頁面設定
- [x] 媒體：R2 未啟用時顯示網址模式提示，不崩潰
- [x] 總覽雲端狀態文案為「雲端資料核心正常」（非誤顯示本機）
- [x] `test:core` 113 全綠、`typecheck` 通過、health API ok

---

## 相關文件

- [production-data-model.md](./production-data-model.md)
- [.cloudflare/SETUP.md](../../.cloudflare/SETUP.md)
