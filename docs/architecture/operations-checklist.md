# 營運與事故檢查表

## A. 首次上線前

站主資料先依 [owner-input-checklist.md](owner-input-checklist.md) 完成；所有 **BLOCKING** 項目未簽核前不得開 production 接單。

> 2026-08-12 本機候選版已完成 320／390／820／1280 寬度、九個主要前後台路由、購物車與核心後台流程的實機 smoke；以下勾選項仍指正式 staging／production 上線驗收，不能以本機結果取代。

### 公司與內容

- [ ] 正式公司名稱、統編／商業資訊、客服電話、Email、LINE 官方帳號與營業時間已確認。
- [ ] 隱私權、服務條款、退換貨／鑑賞期、配送、付款與佛牌商品說明經負責人審核。
- [ ] 營運者／法律顧問已依當時生效版本核對[個人資料保護法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0050021)、[通訊交易七日解除權與合理例外](https://cpc.ey.gov.tw/Page/4432D6D5FA6677B9/68d2a0cd-6f61-4e46-80e0-cba38adc776f)及[網路交易定型化契約應記載事項](https://law.moea.gov.tw/NewsContent.aspx?id=122415&media=print)；此工程清單不取代法律意見。
- [ ] 所有商品來源、尺寸、材質、年份、照片、價格與庫存已人工確認；未確認項目維持 draft／`seo_ready = false`。
- [ ] 不使用保證功效、恐嚇或不實宗教效果用語；內容仍是公司形象與商品資訊。
- [ ] 正式 canonical URL、OG 圖、robots、sitemap、404、favicon 與分享預覽驗收。

### 工程與資料

- [ ] CI 全綠：typecheck、worker typecheck、lint、build、core tests、pages verification、production audit。
- [ ] Staging／production D1、R2、domain、Access、OAuth、Email、Turnstile 與 secrets 完全隔離。
- [ ] migration 在 production-like staging snapshot 通過，且 production backup 已驗 checksum。
- [ ] schema version = 11、32 張表、migration journal、FK、unique、check、索引與 query budget 已驗證。
- [ ] 44 個 `tenant_guard_*` triggers 都存在；跨站 insert／update 與關鍵 parent `site_id` 移動的拒絕測試通過。
- [ ] 本次 deployment 的 `NEXT_PUBLIC_SITE_CODE`、domain、canonical、公開內容、購物車與後台 API 指向同一站台；未宣稱有中央多站選擇器。
- [ ] 直接改成其他 site code 的 API request 會被 server 拒絕，或此 deployment 的 D1 只存在核准站台；不能把 public build variable 當授權。
- [ ] 全站設定 CAS、版本列表、還原後新增版本與並行衝突 `409` 已驗證。
- [ ] 商品分類 CRUD／封存／被引用時拒絕刪除、商品伺服器分頁／搜尋／篩選已驗證。
- [ ] 文章與頁面的 `q`／`status`／`page`／`limit` 伺服器查詢、40 筆預設值、100 筆上限、非法狀態與超出頁碼案例已驗證。
- [ ] 新增一個非內建名稱的分類並指派可見商品後，公開分類與篩選器可呈現；Puck `ProductShowcase` 可用相同名稱篩選，不再依賴固定三類。
- [ ] 實有庫存變更沒有原因時被拒絕；至少 4 字的原因會寫入 `inventory_movements`。
- [ ] 正式訂單 PII 已改走 `order_customer_snapshots`；v9 raw 欄位的雙寫／回填／停寫與 key rotation 已驗收。
- [ ] 媒體上傳、刪除保護、object 權限、D1/R2 對帳與 placeholder 通過。
- [ ] 手機 320／390、平板、桌機、鍵盤、焦點、表單錯誤與無水平溢位通過。
- [ ] 公開頁面效能、圖片尺寸、cache、Core Web Vitals 基準已記錄。

### 身分與安全

- [ ] 員工 Access、allowlist、RBAC、離職撤權、break-glass 與 audit log 通過。
- [ ] 使用者偽造身分 header、跨來源寫入、越權讀取、IDOR、CSRF、XSS 測試通過。
- [ ] Email OTP、LINE state／nonce、Session rotate／revoke、rate limit、Turnstile 通過。
- [ ] 個資遮罩、匯出、刪除／去識別與保留政策已核准。
- [ ] Secret scanning、依賴掃描、CSP 與安全 headers 無未核准 high／critical 風險。

### 商務與營運

- [ ] 建單冪等、庫存保留、逾期、取消、出貨、完成、退貨的庫存不變量通過。
- [ ] 測試訂單有明確標記、立即取消並確認 reserved 回復。
- [ ] `STORE_ORDERS_ENABLED` 預設為 `0`，指定人員知道如何關閉。
- [ ] 監控、告警、on-call、狀態頁、備份與完整還原演練完成。
- [ ] 金流未上線時，頁面不暗示可線上付款；接上金流後另做 sandbox／webhook／退款驗收。

## B. 每次發版

- [ ] Release 有 commit、PR、變更摘要、風險、migration、功能旗標與回復計畫。
- [ ] Release manifest 記錄 schema v11、`0009_concerned_slyde.sql`、`0010_mean_cable.sql`、`NEXT_PUBLIC_SITE_CODE` 與目標 domain。
- [ ] 工作目錄無未預期檔案；不覆蓋使用者未提交變更。
- [ ] 依 [deployment-blueprint.md](deployment-blueprint.md) 執行 CI 與 migration gate。
- [ ] 發版前備份存在且完成 checksum／manifest 驗證；最新還原演練未逾期。本機來源須是通過 `local:backup:verify` 的 v2，v1 不可 restore。
- [ ] 先 staging、再人工核准 production；不得跳過 readback。
- [ ] 發版後驗首頁、動態商品分類、商品、文章／頁面搜尋與分頁、會員、admin、robots、sitemap、API 與安全拒絕案例。
- [ ] 觀察錯誤率、p95 latency、D1 errors、Worker exceptions、OTP／訂單失敗率至少 30 分鐘。
- [ ] 只有上述正常才開新旗標／接單。

## C. 每日營運

- [ ] 備份 job、checksum、D1/R2 manifest 對帳正常；仍在本機營運時，最新 v2 以精確路徑完成 `local:backup:verify`。
- [ ] Worker error、D1 error、5xx、404、登入失敗、OTP 發送、限流與 Turnstile 異常無警報。
- [ ] 新訂單、待確認、即將逾期、付款異常（後續）、待出貨與退貨清單有人負責。
- [ ] 庫存負數、`reserved > on_hand`、重複 movement、訂單與庫存不一致為零。
- [ ] 新文章／商品公開狀態與 sitemap 相符；draft／noindex 不外露。
- [ ] 全站設定目前版本與最新 revision 相符；沒有未處理的 CAS 衝突或意外還原。
- [ ] 媒體 missing／orphan／hash mismatch 已處理。

## D. 每週／每月

### 每週

- [ ] 抽查 5 筆訂單的 order items、庫存 movement 與事件時間軸。
- [ ] 檢查未結案訂單、逾期 reservation、異常 admin 操作與個資匯出。
- [ ] 驗證手機與桌機主要流程；抽查搜尋引擎收錄、canonical 與結構化資料。
- [ ] 更新依賴風險與錯誤趨勢，不自動升級 major 版本進 production。

### 每月

- [ ] 使用不含真實個資的本機 v2 演練：停止站台與 port、restore、確認 pre-restore 備份／安全切換，再 `local:start` 驗 migration 與 health；v1 明確拒絕。
- [ ] D1 export 解密與 isolated restore 抽測。
- [ ] 員工 allowlist／RBAC／離職人員與 break-glass 存取審查。
- [ ] Session／OTP／rate limit 指標與詐騙／濫用趨勢調整。
- [ ] 個資到期刪除／去識別、R2 lifecycle 與孤兒清理有稽核紀錄。
- [ ] 成本：Worker、D1 reads/writes/storage、R2 storage/egress、Email、監控與金流費用。

## E. 事故處理

### 0–15 分鐘

- [ ] 指派 incident commander、記錄 UTC 起始時間與事件頻道。
- [ ] 關閉接單或受影響功能旗標；必要時將寫入 API 設為唯讀。
- [ ] 保存 Worker log、request ID、D1／R2 狀態、commit、migration 與告警；不刪證據。
- [ ] 判定是可用性、資料一致性、權限繞過、個資外洩、付款或第三方事故。

### 15–60 分鐘

- [ ] 確認影響環境、時間、使用者、資料表／object、訂單與付款範圍。
- [ ] 程式錯誤先回上一個良好 commit；資料問題依 backup runbook 還原到新資源。
- [ ] 撤銷受影響 Session／secret／OAuth credential；通知 Email／LINE／付款供應商（如適用）。
- [ ] 建立內外說法，禁止猜測；公開資訊只寫已確認事實與下一次更新時間。

### 復原後

- [ ] Readback schema、資料不變量、權限與 smoke test；兩人核准恢復寫入。
- [ ] 對帳事故期間的訂單、庫存、付款與通知；避免重扣、重寄或重複保留。
- [ ] 72 小時內完成初步 postmortem：原因、影響、時間線、偵測缺口、修正人與期限。
- [ ] 修正加入測試／監控／runbook；完成前不宣稱永久解決。

## F. 本機交接最小步驟

```powershell
npm ci
npm run local:start
npm run local:status
npm run typecheck
npm run typecheck:worker
npm run lint
npm run test:core
npm run test:pages
npm run local:backup
```

備份完成後，從輸出複製**精確資料夾**並唯讀驗證：

```powershell
npm run local:backup:verify -- "C:\exact\taijuda-data-YYYYMMDD-HHMMSS"
```

結束後執行 `npm run local:stop`。本機 `.local-data` 與 `.local-backups` 可能包含測試填入的聯絡資料，不應提交 Git 或傳給第三方。

只有需要復原時才執行下列流程；不要把 restore 當成日常啟動步驟：

```powershell
npm run local:stop
npm run local:backup:verify -- "C:\exact\taijuda-data-YYYYMMDD-HHMMSS"
npm run local:restore -- "C:\exact\taijuda-data-YYYYMMDD-HHMMSS"
npm run local:start
npm run local:status
```

restore 前必須確認 port 3000 無占用；完成後仍要 readback system-status、schema v11／32 tables／44 tenant guards 與主要後台資料。完整失敗／rollback 處置見 [backup-restore-runbook.md](backup-restore-runbook.md)。
