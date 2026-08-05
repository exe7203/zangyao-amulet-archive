# 泰聚達

泰國佛牌與相關收藏品的公司形象、商品展示與內容管理網站。泰聚達是第一個前台品牌；文章、商品、庫存、訂單、網站編輯器與 SEO 則以可重用的共用核心建置。

## 目前功能

- 公開前台包含首頁、商品列表與商品頁、佛牌專欄、品牌介紹及購物服務說明。
- 購物車只在瀏覽器保存商品 ID 與數量；價格、庫存與限購數量會重新以目前商品資料核對。
- 本機版可測試無金流訂單，具備重複送單防護、庫存保留、逾期釋放與訂單狀態流程。
- `/admin/articles/` 使用 Tiptap 編輯文章，支援結構化內容、草稿／發布、版本紀錄與 SEO 欄位。
- `/admin/site/` 使用 Puck 編輯結構化頁面與全站文字、配色，並保留安全的區塊與連結限制。
- `/admin/products/` 管理商品、來源與規格、圖片、替代文字、庫存及 SEO 上架狀態。
- `/admin/orders/` 管理訂單、付款狀態、事件紀錄與庫存異動。
- D1 schema 可保存多站台內容、商品、庫存與訂單；資料以 `site_id` 隔離。
- 公開內容會輸出成版本化快照，再產生 HTML、canonical、Open Graph、JSON-LD、sitemap 與 robots.txt。
- 尚未完成照片、來源與 SEO 檢查的商品會遮蔽價格及未確認資料、保持 `noindex`，也不會進入 sitemap。

## 會員功能現況

`/account/` 目前只供本機流程測試。Email 驗證碼是本機模擬，不是真正寄信服務；個人資料、購物車與訂單摘要仍保存在同一瀏覽器，尚未依登入帳號隔離，也不會跨裝置同步。

正式會員上線前仍須完成：

- 伺服器端登入、Session 與 Email OTP 或 LINE Login。
- 會員資料表及訂單的 `member_id` 關聯。
- 每個帳號獨立的個人資料、購物車與訂單查詢權限。
- Rate Limiting、機器人防護、備份與個資保存規則。

既定介面位於 `shared/member-contract.ts`；正式實作不得將 token、OTP、OAuth state 或 Session ID 寫入 Web Storage。

## Windows 本機版

一般操作可雙擊專案根目錄的「啟動泰聚達本機版.cmd」。主要網址：

- 前台：`http://127.0.0.1:3000/`
- 營運總覽：`http://127.0.0.1:3000/admin/`
- 文章管理：`http://127.0.0.1:3000/admin/articles/`
- 商品與庫存：`http://127.0.0.1:3000/admin/products/`
- 訂單管理：`http://127.0.0.1:3000/admin/orders/`
- 網站編輯器：`http://127.0.0.1:3000/admin/site/`
- 本機會員測試：`http://127.0.0.1:3000/account/`

也可使用：

    npm ci
    npm run local:start
    npm run local:status
    npm run local:stop

本機資料位於專案的 `.local-data`，備份請使用「備份泰聚達本機資料.cmd」，避免複製到寫入中的資料檔。

## GitHub Pages 公開版

推送到 `main` 後，GitHub Actions 會建立並發布靜態公開版。公開版會排除：

- `/admin/`
- `/account/`
- Worker API 與登入端點
- 結帳個資表單、OTP 與文章編輯器程式

因此 GitHub Pages 是可分享的公司形象、商品展示與 SEO 靜態站，不是可對外接單的完整商店。正式會員、後台與訂單功能必須部署在能執行 Worker、驗證服務與 D1 的環境。

手動建立公開版：

    npm run build:publish
    npm run test:pages

## 品質檢查

發布流程會執行型別、Lint、核心測試、靜態建置與公開輸出檢查。完整本機檢查：

若本機網站正在運行，請先執行 `npm run local:stop`；檢查完成後再執行 `npm run local:start`。

    npx tsc --noEmit
    npm run lint
    npm run build
    npm run test:core
    npm run test:pages
    npm audit --omit=dev --audit-level=high

公開用詞規則請見 [docs/public-copy-guide.md](docs/public-copy-guide.md)。Puck、Tiptap 與 Lucide 均為開源模組；圖片上傳與媒體庫仍需在正式雲端版串接 R2 或其他物件儲存，線上金流則保留為後續階段。

> 現有品牌故事、商品來源、圖片、客服管道與交易政策仍含待確認資料；正式營運前必須由站主逐項核對。
