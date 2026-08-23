# 環境矩陣

## 1. 環境隔離

| 項目 | Local | Staging | Production |
|---|---|---|---|
| 用途 | 開發、單機驗證、假資料 | 真實雲端整合與驗收 | 對外營運 |
| URL | `http://127.0.0.1:3000` | 專用測試子網域，待決定 | 正式網域，待決定 |
| Public site code | `NEXT_PUBLIC_SITE_CODE`；預設 `taijuda` | 明確指定 staging 品牌 code | 明確指定 production 品牌 code |
| 程式來源 | 工作目錄 | 受保護分支／明確 commit | `main` 的已核准 commit |
| D1 | 本機持久資料 | 獨立 staging D1 | 獨立 production D1 |
| R2 | 不模擬永久檔案；可用測試 bucket | 獨立 staging bucket | 獨立 production bucket |
| 資料 | 假商品／假個資 | 只用測試個資 | 真實營運資料 |
| 後台身分 | localhost `local-preview` | 員工 Access + 測試 allowlist | 員工 Access + 最小 allowlist |
| 顧客登入 | 固定 demo OTP；LINE 關閉 | 測試 Email provider／LINE channel | 正式 Email provider／LINE channel |
| 下單 | 本機測試開啟 | 預設關閉，驗收時短時開啟 | 完成 go-live gate 後才開啟 |
| 金流 | 無 | sandbox（後續） | live（後續，需另行核准） |
| robots | 不重要 | `noindex, nofollow` | 正式規則與 sitemap |
| 監控 | console／本機狀態頁 | 完整告警測試 | 正式告警與 on-call |
| 備份 | `.local-backups` v2 manifest；逐檔 size／SHA-256 驗證與安全 restore | 排程 export + 還原演練 | 排程 export + Time Travel + R2 保護 |

Staging 與 Production 不可共用 D1、R2 bucket、OAuth client、Email sender、Turnstile key 或金流憑證。

Local v2 只備份 `.local-data`。v1 legacy 可做基本檢查但不可 restore；任何還原都必須先停止網站與 port，成功交換檔案後再以 `local:start` 完成 migration／health 驗證。這套流程不取代 staging／production 的 D1 export、Time Travel 與 R2 備援。

## 2. 綁定與變數

### 已存在

| 名稱 | 型別 | Local | Staging／Production | 備註 |
|---|---|---|---|---|
| `DB` | D1 binding | 本機 adapter | 各環境獨立 D1 | `.openai/hosting.json` 已宣告邏輯名稱 |
| `ASSETS` | Worker asset binding | vinext 提供 | 部署平台提供 | 靜態資產 |
| `IMAGES` | Image transform binding | runtime 提供 | 平台影像服務 | 不是原始媒體庫 |
| `ADMIN_EMAIL_ALLOWLIST` | server variable | 本機不使用 | 員工 Email 清單 | 仍需可信邊緣身分 header |
| `STORE_ORDERS_ENABLED` | server variable | localhost 自動測試 | 預設 `0`；核准才設 `1` | kill switch |
| `NEXT_PUBLIC_SITE_URL` | public build variable | localhost | 各環境 canonical origin | 不可放 secret |
| `NEXT_PUBLIC_SITE_CODE` | public build variable | 預設 `taijuda` | 每個 deployment 明確指定一個 code | 單一公開 tenant 選擇；不是權限控制或中央多站選單 |
| `NEXT_PUBLIC_CONTENT_API_URL` | public build variable | 空字串／同源 | 建議同源 | 若跨來源需另做 CORS／CSRF 設計 |
| `NEXT_PUBLIC_STORE_MODE` | public build variable | local | 正式會員 UI gate | public 值，不是安全控制 |
| `NEXT_PUBLIC_CATALOG_VERIFIED` | public build variable | 測試值 | 商品資料核准後為 `1` | 只控制公開輸出；API 仍須驗證 |

### 正式版預留

| 建議名稱 | 型別 | 用途 | 狀態 |
|---|---|---|---|
| `MEDIA` | R2 binding | 媒體 bytes | 未宣告；R2 功能落地時才加入 hosting config |
| `SESSION_SECRET` | secret | Cookie／Session 安全材料 | 未落地 |
| `DATA_HMAC_KEY` | secret | v11 `*_hash` 的 server-keyed HMAC | 建議名稱；未落地，分環境且需輪替版本 |
| `PII_ENCRYPTION_KEY_V1` | secret | 地址、訂單顧客與 tracking payload authenticated encryption | 建議名稱；未落地，實際名稱需配合 key manager |
| `LINE_CHANNEL_ID` | server variable | LINE Login client ID | 未落地 |
| `LINE_CHANNEL_SECRET` | secret | LINE Login client secret | 未落地 |
| `EMAIL_PROVIDER_API_KEY` | secret | Email OTP 寄送 | 未落地 |
| `EMAIL_FROM` | server variable | 驗證信寄件人 | 未落地 |
| `TURNSTILE_SITE_KEY` | public variable | 前端 challenge | 未落地 |
| `TURNSTILE_SECRET_KEY` | secret | 伺服器驗證 challenge | 未落地 |
| `PAYMENT_*` | secret／variable | 金流 sandbox／live | 後續階段；名稱依供應商決定 |
| `WEBHOOK_*_SECRET` | secret | 付款／物流 webhook 驗簽 | 後續階段；provider 各自獨立 |
| `OBSERVABILITY_*` | secret／variable | error、trace、alert | 待選服務 |

新增 binding 前應先有使用它的程式碼、測試與 runbook；不要在 production 留下「有綁定但無人知道是否使用」的資源。

### 目前的站台部署模型

- `sites` 與各表的 `site_id` 讓 D1 具備資料隔離結構，44 個 tenant guard triggers 會拒絕跨站 parent／child 關聯。
- 公開前台、購物車 storage key 與後台 API request 使用同一個 build-time `NEXT_PUBLIC_SITE_CODE`。
- 一個 deployment 只服務一個品牌／public site code。要建立另一個系列，應建立另一套 deployment 設定並明確指定 code。
- 目前沒有中央多站選擇器、跨站總覽、站台建立／刪除 UI 或跨站角色管理；不可用「資料表有 `site_id`」推論這些能力已完成。
- `NEXT_PUBLIC_SITE_CODE` 是公開 build 值，不是 server authorization。若同一個 production D1 未來真的保存多站資料，Worker 必須另以受控 server 設定拒絕與 deployment 不符的 site request；在此控制落地前，最安全的部署是每個 public deployment 使用只含該站資料的 D1。

## 3. 功能旗標安全順序

1. 程式部署。
2. D1 migration 與 readback 完成；目前應為 schema v11、32 tables、44 tenant guard triggers。
3. 後台身份與監控確認。
4. 只在 staging 開啟功能並跑驗收。
5. production 以最小流量／最小範圍開啟。
6. `STORE_ORDERS_ENABLED=1` 必須是最後一步，且要有一鍵改回 `0` 的權限與紀錄。
