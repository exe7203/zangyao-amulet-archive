# 正式資料模型與資料治理

## 1. 儲存邊界

| 儲存服務 | 應保存 | 不應保存 |
|---|---|---|
| Cloudflare D1 | 站台設定、內容、商品、庫存、訂單、會員、Session metadata、媒體 metadata、付款／物流事件、稽核紀錄 | 圖片或大型檔案 bytes、明文 OTP、明文 Session token、第三方 secret |
| Cloudflare R2 | 商品圖、文章首圖、OG 圖、附件及其衍生尺寸的 bytes | 訂單、會員、庫存、權限、付款狀態、唯一真相 metadata |
| Secret store | Session 簽章金鑰、LINE client secret、Email provider key、Turnstile secret、付款 webhook secret | 可公開的站名、URL 或功能旗標 |
| 瀏覽器 | 購物車 UI 狀態、經同意保存的非敏感結帳偏好；本機 demo Session 只限 localhost | 正式 OTP、OAuth state、Session ID、後台 token、付款憑證 |

R2 物件不可成為唯一的媒體清單。D1 的 `media_assets` 是可查詢索引；R2 object key 是實體位置。刪除媒體採「D1 標記刪除 → 確認無引用 → R2 延遲清除」，避免內容頁突然破圖。

## 2. 已落地核心資料表（目前 Schema v11）

| 領域 | 資料表 | 主要用途 | 重要約束／索引 |
|---|---|---|---|
| 系統 | `schema_metadata` | schema 版本與系統 metadata | `key` PK |
| 站台範圍 | `sites` | 站台、語系、幣別 | `code` unique；目前每個 deployment 固定一個 public site code |
| 外觀 | `site_settings` | 全站文案與 theme JSON | 每站一筆；version |
| 外觀 | `site_settings_revisions` | 全站設定不可變歷史與還原來源 | `(site_id, version)` unique；created index |
| 頁面 | `site_pages` | Puck 頁面、SEO 與發布狀態 | `(site_id, slug)` unique；status index |
| 頁面 | `site_page_revisions` | 頁面歷史版本 | `(page_id, version)` unique |
| 內容 | `articles` | Tiptap 文章、SEO 與發布狀態 | `(site_id, slug)` unique；status index |
| 內容 | `article_revisions` | 文章歷史版本 | `(article_id, version)` unique |
| 商品 | `categories` | 商品分類 | 每站 slug／名稱 unique |
| 商品 | `products` | 商品、價格、展示、SEO readiness | 每站 SKU／slug unique；version |
| 庫存 | `inventory` | 現有量、保留量與 optimistic version | `reserved <= on_hand` check |
| 庫存 | `inventory_movements` | 不可變庫存異動軌跡 | 商品／訂單索引；訂單異動防重複 |
| 訂單 | `orders` | 顧客快照、履約、付款／訂單狀態 | 訂單號／idempotency unique；逾期索引 |
| 訂單 | `order_items` | 下單當時商品、價格、數量快照 | 每訂單商品 unique |
| 訂單 | `order_events` | 訂單狀態與操作時間軸 | `(order_id, created_at)` index |

v9 相容欄位仍讓 `orders` 直接保存姓名、電話、Email、LINE ID 與地址快照；它們只供本機與加法 migration 過渡。v10 migration `0009_concerned_slyde.sql` 已新增 `order_customer_snapshots` 作為正式 PII 路徑，目前整體 schema 為 v11。正式接單前必須完成應用層加密、雙寫／回填、readback，再停止把真實個資寫入 v9 raw columns。訂單快照是履約憑證，不應在會員修改個人資料時被覆寫。

### 2.1 單一部署站台與 tenant 完整性

- D1 schema 可保存多個 `sites`，但目前應用是「一個 deployment、一個 `NEXT_PUBLIC_SITE_CODE`」。公開頁、購物車 storage key 與後台 request 共用這個 build-time code。
- 目前沒有中央多站選擇器、跨站營運總覽、站台建立 UI 或跨站角色系統。若有第二品牌，先使用另一個 deployment 與明確的 site code。
- `0009_concerned_slyde.sql` 與本機 runtime 共建立 44 個 `tenant_guard_*` triggers。它們會驗證 parent／child 的 `site_id` 一致，並禁止 categories、products、members、orders、carts、media assets、payment transactions、shipments 等關鍵 parent 直接移動到另一站。
- `cart_items`、`product_media`、`payment_events`、`shipment_events` 都有自己的 `site_id`；資料庫 trigger 會把 child 與其 cart／product／transaction／shipment 的站台綁在一起。
- API 查詢仍必須帶站台條件；trigger 是最後一道一致性防線，不取代授權或 query scoping。
- `NEXT_PUBLIC_SITE_CODE` 只是公開 build 設定。Server deployed-site allowlist 尚未成為現有安全控制；在它落地前，production 應讓每個 deployment 的 D1 只含該 public site，避免直接 API request 選到其他站。

### 2.2 全站設定版本規則

- `site_settings.version` 是 compare-and-swap token。儲存或還原時，版本不符回 `409`，避免覆蓋另一位操作人的更新。
- 每次儲存會保留前一版並寫入新版本；`site_settings_revisions` 以 `(site_id, version)` 防重複。
- 還原舊版不會把版本號倒退，而是用舊內容建立下一個新版本；仍會重新驗證主題對比與目前規則。
- 後台已能分頁讀取歷史、顯示操作人／時間並執行還原。這是已落地功能，不再只是資料表預留。

### 2.3 商品分類、分頁與庫存調整

- 分類後台支援新增、修改、封存與刪除；修改／刪除以 `updated_at` 做 CAS。仍被商品引用的分類不得刪除，可先移動商品或封存。
- 商品列表由 server 端依 `q`、`status`、`category` 查詢與分頁，單頁上限 100，不再假設一次載入全部商品。
- `categories` 是每站資料，不是固定三類 enum。公開首頁會依目前商品目錄中的分類動態產生分類卡與篩選器；新分類只要有可見商品即可出現，靜態輸出無 API 時則使用發布快照資料。
- Puck `ProductShowcase.category` 接受最多 80 字的分類名稱，`all` 表示全部；驗證層不再限定「佛牌／神尊／符印」。目前編輯器是文字欄位而非分類下拉選單，輸入必須與商品分類名稱完全一致，否則該區塊可能沒有商品。
- 既有商品的實有庫存改變時，前後端都要求至少 4 個字、最多 300 字的調整原因；原因與 actor 會寫入 `inventory_movements` 的 `adjustment` 流水。

### 2.4 文章與頁面管理查詢契約

- 文章與 Puck 頁面清單都已在 server 端處理 `q`、`status`、`page`、`limit`，預設每頁 40、上限 100；回應包含 `page`、`limit`、`maxLimit`、`total`、`totalPages` 與 `returned`。
- 文章 `q` 搜尋 title、slug、excerpt、tag；頁面 `q` 搜尋 title、slug、SEO title、SEO description。LIKE `%`／`_` 會被跳脫，不會被當成萬用字元。
- 不合法 status 回 `400`；超出最後一頁時保留請求的 page 並回空清單，不默默改到最後一頁。後台 UI 不應再自行載入全部資料後才篩選。

## 3. Schema v11 中的 future-ready 結構

`0009_concerned_slyde.sql` 建立會員、商務預留表與 tenant guards；`0010_mean_cable.sql` 新增 `site_settings_revisions` 並把 schema 升到 v11。目前 `db/schema.ts`、migrations 與本機 runtime 共 32 張表。以下結構雖已落地，仍沒有完整會員、R2、金流或物流 API；不能因為有空表就宣稱功能已完成或已上線。

| 表／欄位 | 目的 | 建議關係與索引 | 狀態 |
|---|---|---|---|
| `members` | 顧客主檔、狀態與刪除生命週期 | site／status／updated；`purge_after` | Schema v11 已存在；API 待串 |
| `member_identities` | Email／phone OTP、LINE、Google、Apple 身分 | provider subject／Email／phone 只存 hash | Schema v11 已存在；provider 待串 |
| `member_consents` | terms／privacy／marketing 的 append-only 決策事件 | policy version、granted／revoked、source、event／evidence／IP／UA hash | Schema v11 已存在；同意 UI 待串 |
| `member_sessions` | 可撤銷、可旋轉的伺服器 Session | Session／CSRF／IP／UA 只存 hash；expiry／purge | Schema v11 已存在；Session API 待串 |
| `member_addresses` | 顧客常用收件資料 | `encrypted_payload`、key version、fingerprint hash | Schema v11 已存在；加密服務待串 |
| `member_auth_challenges` | OTP／OAuth 登入、帳號綁定、找回的一次性挑戰 | OTP destination／challenge 或 OAuth state／PKCE／nonce 只存 hash | Schema v11 已存在；provider 待串 |
| `carts` | 匿名或會員購物車主檔 | owner key hash、status、converted order、expires | Schema v11 已存在；cart API 待串 |
| `cart_items` | 購物車商品、數量與單價快照 | `site_id` + `(cart_id, product_id)` unique；quantity／price checks | Schema v11 已存在；cart API 待串 |
| `orders.member_id` | 登入會員與訂單關聯 | nullable FK；`(site_id, member_id, created_at)` partial index | Schema v11 已存在；認領流程待串 |
| `order_customer_snapshots` | 正式訂單顧客 PII 快照 | phone／Email keyed hash + encrypted payload + key version + purge | Schema v11 已存在；雙寫／回填待串 |
| `media_assets` | R2 metadata、checksum、尺寸、用途與狀態 | `(site_id, storage_key)` unique；checksum／purge indexes | Schema v11 已存在；R2 尚未綁定 |
| `product_media` | 商品與多張媒體排序／用途 | `site_id` + product／asset unique；primary／gallery role | Schema v11 已存在；後台待串 |
| `payment_transactions` | 對閘道無關的 authorization／capture／void／refund | provider／transaction／idempotency 只存 hash | Schema v11 已存在；金流未選定 |
| `payment_events` | 付款事件的 hash 摘要與處理狀態 | `site_id` + provider event unique；transaction／received index | Schema v11 已存在；webhook API 待串 |
| `shipments` | 一張訂單可有多次出貨 | tracking hash + encrypted payload；order／status indexes | Schema v11 已存在；物流未選定 |
| `shipment_events` | 物流狀態軌跡 | `site_id` + provider event／payload hash；shipment index | Schema v11 已存在；物流 webhook 待串 |
| `admin_audit_log` | 員工敏感操作稽核 | actor／request／IP／UA／before／after 只存 hash | Schema v11 已存在；現有操作待寫入 |
| `webhook_events` | 第三方 webhook 冪等收件匣 | signature result、provider event／payload hash、retry／purge | Schema v11 已存在；receiver 待串 |

### 3.1 會員建模規則

- `members` 是顧客主體；Email 與 LINE 是 `member_identities`，不可把 LINE ID 當作會員 PK。
- Email／電話正規化後以 keyed hash 查找；目前 v11 不保存 member identity 的明文聯絡資料。
- 同一會員可綁多種 provider，但 `(site_id, provider, provider_subject_hash)` 不可重複。
- 合併會員必須留下 `admin_audit_log`，不得直接改 FK 後刪除來源會員。
- `orders.member_id` 可為 null，以支援訪客下單；登入後只可經驗證流程認領訂單。
- `member_addresses` 不拆存姓名、電話、地址明文；使用應用層加密後的 opaque payload。`address_fingerprint_hash` 僅用於去重，不可逆推出地址。
- `member_consents` 不更新舊紀錄；同意與撤回各新增一筆事件，以最新有效 policy version 的事件判斷狀態。行銷同意與服務必要的 terms／privacy 分開。
- 所有 `*_hash` 欄位都應是 server-keyed HMAC，不是可離線猜測的無鹽 digest；加密 payload 使用 authenticated encryption 並保存 key version。

### 3.2 驗證挑戰規則

- `member_auth_challenges` 對 OTP 只保存 destination／challenge hash；對 OAuth 只保存 state／PKCE verifier／nonce hash，另保存 IP／User-Agent hash、attempt、expiry、consumed／purge 時間。資料庫 CHECK 會拒絕 provider 與 secret shape 不相符的列。
- OTP、Email、OAuth state、nonce 與 provider token 都不以 raw value 寫入 D1、log 或 analytics。
- 驗證與消耗需是原子操作；到期或達嘗試上限後不可恢復使用，並由排程清理。

### 3.3 購物車與庫存規則

- 購物車不等於保留庫存。只有建立訂單成功後才增加 `inventory.reserved`。
- 建單、建立 `order_items`、增加 reserved、寫入 `inventory_movements` 應在同一邏輯交易內完成。
- 所有重試請求須使用 idempotency key；相同 key、不同 payload 應拒絕。
- `products.stock` 目前保留相容用途；正式可用量的唯一真相為 `inventory.on_hand - inventory.reserved`。
- 取消、逾期、完成、退貨各自只能產生一次相應庫存 movement。

### 3.4 付款、退款與 webhook 規則

- 退款以 `payment_transactions.transaction_type = 'refund'` 表達，不另建 mutable `refunds` 主檔。
- `related_transaction_hash` 連回原 provider transaction 的 HMAC reference；D1 不保存原始 external transaction ID。
- `payment_events` 與 `webhook_events` 只存事件／payload hash、必要的非敏感狀態與處理結果；raw gateway payload 不長期保存。
- webhook 驗簽必須使用 secret store，先驗簽再做冪等判斷；未驗簽資料不得改訂單或庫存。

### 3.5 媒體規則

`media_assets` 在目前 v11 包含：

- `id`, `site_id`, `storage_key`, `checksum_sha256`
- `content_type`, `byte_size`, `width`, `height`
- `alt_text`, `purpose`, `status`
- `uploaded_by_subject_hash`, `created_at`, `ready_at`, `deleted_at`, `purge_after`

R2 key 建議格式：`{environment}/{site_code}/{yyyy}/{mm}/{asset_id}/{variant}.{ext}`。object key 不含姓名、Email、電話或原始上傳路徑。上傳採 signed／受控端點；Worker 驗證 MIME、magic bytes、大小與像素，再建立 D1 metadata。

## 4. PII 分級

| 等級 | 範例 | 控制 |
|---|---|---|
| P0 機密 | Session token、OTP、OAuth state、provider secrets、付款 webhook secret | token 只存 hash；secret 不進 D1／log／Git；最短保存 |
| P1 高敏感個資 | 姓名、電話、地址、Email、LINE provider subject、IP／風險訊號 | 最小權限、後台遮罩、查詢稽核、匯出受控 |
| P2 交易資料 | 訂單、付款／退款、物流、客服備註 | 不可任意修改；事件軌跡；依法／會計需求保存 |
| P3 公開內容 | 商品、文章、SEO、公開圖片 | 發布審核、版本紀錄、XSS／URL 驗證 |

內部備註不得寫入完整信用卡、身分證、健康、宗教信仰推論或與履約無關的個人描述。佛牌商品偏好也不應被擴張成敏感側寫。

## 5. 建議保留政策

下表是系統預設提案，必須由公司負責人、會計與法務確認後才成為正式政策。

| 資料 | 建議線上保留 | 到期處理 |
|---|---:|---|
| 未完成 OTP／OAuth challenge | 10–15 分鐘有效；到期後最遲 24 小時清理 | 依 `purge_after` hard delete |
| 已撤銷／過期 Session metadata | 30 天 | hard delete；安全事件另案封存 |
| 匿名購物車 | 最後活動後 30 天 | hard delete items 與 cart |
| 會員常用地址 | 帳號有效期間；停用後 2 年 | 去識別或刪除，交易快照不連動 |
| 未成交且取消的訂單 | 180 天 | 個資去識別；保留非識別統計 |
| 已成交訂單／付款／退款 | 7 年提案 | 到期後去識別；期限需依法務／會計確認 |
| 庫存 movement／訂單事件 | 與相關交易相同，至少 7 年提案 | 保留完整性，限制查閱 |
| 管理員稽核紀錄 | 2 年提案 | 封存或刪除；重大事件另案保全 |
| 同意／撤回事件 | 政策有效期 + 爭議期間提案 | 依法務核准的 `purge_after`；不可覆寫歷史 |
| 一般應用 log | 30–90 天 | 自動 lifecycle；禁止寫入 P0 |
| 媒體 | 被內容引用期間 | 軟刪除 30 天後再清 R2；依法保全者例外 |

## 6. 刪除、匯出與一致性

- 會員刪除：撤銷全部 Session、移除 identity、刪除常用地址；法定交易資料改為受限且盡可能去識別，不得破壞會計與庫存軌跡。
- 訂單 PII：新流程只讀寫 `order_customer_snapshots.encrypted_payload`；Email／phone hash 用於精確查找與對帳，不可代替加密，也不可在後台直接顯示。
- 媒體刪除：先查 `product_media`、文章與頁面引用；有引用即拒絕 hard delete。
- D1 與 R2 對帳：每日產生 `media_assets` vs R2 inventory 差異；孤兒物件進待清單，不自動立即刪除。
- 匯出個資：需二次授權、稽核、限時下載與加密；不得直接提供全庫 SQL。
- 所有時間欄位使用 UTC ISO-8601；前台顯示才轉 Asia/Taipei。

## 7. Migration 原則

1. `db/schema.ts` 是 Drizzle 模型來源；`drizzle/*.sql` 是可部署的不可變 migration。
2. 任何資料表／索引變更都要新增 migration，禁止改寫已套用 migration。
3. production 採 expand → backfill → switch → contract；不可依賴一次破壞性 rename。
4. migration 前備份，staging 先套用並跑資料查詢與 API smoke test。
5. Worker 啟動只檢查 schema 版本；正式環境不得在第一個顧客請求中做長時間 DDL 或 seed。
