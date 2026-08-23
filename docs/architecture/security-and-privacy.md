# 安全與個資設計

## 1. 兩套身分邊界

| 面向 | 顧客會員 | 公司員工後台 |
|---|---|---|
| 使用者 | 購物顧客 | 經核准的公司人員 |
| 建議登入 | Email OTP、LINE Login | Cloudflare Access／公司 IdP + Email allowlist |
| Session | 應用程式發行的 HttpOnly Cookie | 邊緣 Access Session；應用再驗可信身分 header |
| 權限 | 自己的 profile、地址、購物車、訂單 | 依角色管理內容、商品、訂單、設定 |
| 可見資料 | 僅本人資料 | 依職務最小範圍；個資遮罩 |
| 不得共用 | 員工 Access、admin allowlist | 顧客 OTP／LINE Session |

Cloudflare Access 只保護員工後台，不是顧客會員系統。顧客登入成功也不應因此取得任何 `/admin` 權限。

## 2. 目前安全控制與缺口

### 已落地

- localhost 才允許 `local-preview` 後台身分與固定 demo OTP。
- 遠端管理 API 需要 `oai-authenticated-user-email` 且必須出現在 `ADMIN_EMAIL_ALLOWLIST`。
- 非 GET 寫入會檢查同源 `Origin`；POST／PUT／PATCH 只接受 JSON，並有限制 request bytes。
- 重要輸入有長度、slug、URL、數字與狀態驗證；JSON 回應預設 `no-store`、`nosniff`。
- 訂單有 idempotency key／fingerprint；商品與庫存有 optimistic version。
- 遠端接單預設關閉，需 `STORE_ORDERS_ENABLED=1`。

### 正式上線前必補

- 由受信任邊緣移除使用者自行帶入的 `oai-authenticated-user-email`，再注入已驗證值；Worker 不可直接信任公共網路 header。
- 顧客會員 server endpoints、D1 member/session tables、Session 撤銷與登入事件。
- Email OTP provider、LINE OAuth callback、Turnstile、rate limit 與濫用告警。
- CSP、frame-ancestors、Referrer-Policy、Permissions-Policy、HSTS（僅正式 HTTPS）。
- 後台 RBAC、敏感個資遮罩、匯出審批與 admin audit log。
- R2 上傳掃描、MIME／magic bytes 驗證、大小與尺寸限制。

## 3. 顧客 Session

- Cookie：`HttpOnly; Secure; SameSite=Lax; Path=/`；名稱加環境前綴，production 不與 staging 共用。
- 瀏覽器只持有高熵 random token；D1 只保存 token hash、member、created／expires／last_seen、revoked_at 與有限裝置摘要。
- 登入後旋轉 Session；登出、改綁 identity、風險事件與帳號停用時撤銷全部或指定 Session。
- 建議 idle 30 天、absolute 90 天上限；高風險操作要求近期重新驗證。期限是產品提案，需確認。
- 正式 Session ID、OTP、OAuth state、LINE token 一律不進 localStorage／sessionStorage。

### Hash 與加密材料

- 目前 v11 的 `*_hash` 一律使用 server-keyed HMAC；Email、電話、IP、事件 ID 等低熵資料不可只做一般 SHA-256，否則可被字典猜測。
- 地址、訂單顧客快照與物流 tracking payload 使用 authenticated encryption；D1 只存 opaque ciphertext 與 `encryption_key_version`。
- HMAC／加密金鑰只放 secret store，staging／production 分開；輪替採新寫新 key、舊 key 限時可讀、背景重加密、readback 後退役。
- 權限上，能查 hash 的服務不應自動擁有解密權；後台解密需最小角色、用途與 audit。

## 4. Email OTP

1. 請求前正規化 Email；回應永遠使用相似訊息，避免帳號列舉。
2. 產生一次性高熵 code；D1 只存帶 server secret 的 digest，不存明文。
3. 有效期 10 分鐘提案、最多 5 次嘗試；成功後原子標記 consumed。
4. 針對 IP、Email digest、裝置與 site 分層 rate limit；重寄間隔至少 60 秒提案。
5. Turnstile 在首次或風險升高時驗證；大量失敗、跨區或異常節奏告警。
6. Email provider log 不寫完整 code；客服不可詢問或代填 OTP。

## 5. LINE Login

- 使用獨立的 staging／production LINE channel 與精確 callback URL。
- 必驗 `state`；OIDC 流程必驗 `nonce`、issuer、audience、簽章與 token 時效。若所選流程支援 PKCE，應同時啟用。
- OAuth state／nonce 一次性、短效、只存 digest；callback 後立即消耗。
- LINE provider subject 存於 `member_identities`，不以暱稱或公開 LINE ID 判斷唯一會員。
- 不索取與登入／客服無關的 scope；refresh token 若必要，需加密並限制讀取。
- 綁定既有會員前要求目前 Session + 再驗證，避免帳號接管。

## 6. CSRF、CORS 與 XSS

### CSRF／CORS

- 正式 API 優先同源；維持 Origin 驗證與 SameSite Cookie。
- 變更 Email、綁定 LINE、地址、個資匯出等敏感操作另加同步 token 或 double-submit CSRF token。
- 公開 GET API 可明確快取；會員／後台回應一律 `private, no-store`。
- 不使用 `Access-Control-Allow-Origin: *` 搭配 credentials。若必須跨來源，採精確 allowlist 並驗 preflight。

### XSS／內容安全

- Tiptap／Puck JSON 是不可信輸入；render 前只允許明確 node、mark、URL protocol 與屬性。
- 禁止任意 script、inline event handler、`javascript:`、不受控 iframe 與未清理 HTML。
- 對外連結補 `rel="noopener noreferrer"`；媒體 URL 只接受核准 origin 或 D1 media ID。
- CSP 至少限制 `default-src 'self'`，再按實際圖片、字型、LINE／付款需求最小放行。不得為了省事長期開 `unsafe-eval`。

### Tenant 隔離

- 目前 public surface 以 build-time `NEXT_PUBLIC_SITE_CODE` 固定單一站台；這能降低前台 request 在 tenant 間漂移，但不是員工授權或 server access control。
- 所有 D1 query 仍需帶 `site_id`／解析後的 site scope。不得只用全球 ID 查詢後假設資料一定屬於目前站台。
- Schema v11 有 44 個 `tenant_guard_*` triggers，阻擋跨站 parent／child insert、update 與關鍵 parent `site_id` 移動；`cart_items`、`product_media`、`payment_events`、`shipment_events` 也各自保存 `site_id`。
- Migration、restore 與資料匯入都必須重新驗證 44 個 triggers 與負向跨站測試。Trigger 是資料完整性防線，不取代 Access、RBAC、Session 或 API authorization。
- 目前沒有中央多站選擇器或跨站角色。若未來新增，必須另做 tenant-aware RBAC、稽核、匯出與 IDOR 測試。
- 在 server-side deployed-site allowlist 尚未落地前，不要讓同一 production D1 同時承載可由同一 Worker 查到的多個公開品牌；前端常數無法阻止直接 API request。

## 7. Rate limit 與 Turnstile

| 端點 | 初始建議 | 額外控制 |
|---|---|---|
| OTP request | Email 5／小時、IP 20／小時 | 重寄 60 秒、Turnstile、模糊回應 |
| OTP verify | challenge 5 次 | 成功即消耗、失敗遞增延遲 |
| LINE callback | state 一次 | state／nonce／時效驗證 |
| 建立訂單 | IP 10／10 分鐘、device 5／10 分鐘 | Turnstile、idempotency、庫存交易 |
| 會員資料更新 | member 30／10 分鐘 | Session + CSRF + version |
| Admin write | actor 120／分鐘提案 | Access、allowlist、audit、payload limit |
| 媒體上傳 | actor 30／小時提案 | 檔案數／bytes quota、scan |

數字是起始值，應用 staging 與 production 流量調校；限流時回 `429` 與合理 `Retry-After`，不得只在前端 disable 按鈕。

## 8. 後台 RBAC 與稽核

建議角色：

- `content_editor`：文章與一般頁面，不能看訂單個資。
- `catalog_manager`：商品與媒體，庫存調整需原因。
- `order_operator`：訂單、履約與必要顧客資料。
- `site_admin`：設定、使用者與匯出；高風險操作需二次核准。
- `auditor`：唯讀 audit／報表。

稽核紀錄至少寫 actor、角色、request ID、action、target type／ID、結果、時間，以及不含 P0 的變更摘要。不可把完整 Session、OTP、OAuth token 或付款 secret 寫入 audit。

## 9. 個資生命週期

- 收集前說明目的、必要欄位、保存期間、第三方與聯絡方式；選填欄位不得偽裝必填。
- 訂單的顧客資料只用於履約、客服與法定義務；行銷同意需分開且預設不勾選。
- 後台列表遮罩電話／Email／地址；只有處理該訂單時展開，展開與匯出可稽核。
- 提供查詢、更正、刪除／去識別與匯出流程；法定保存與使用者刪除請求發生衝突時，記錄依據並限制處理。
- 事故時先保全 log 和影響範圍；通知時限與對象需由公司法務及所在地規範確認。
- 目前 v11 的 `member_consents` 採 append-only：terms、privacy、marketing 分 scope，granted 與 revoked 都新增事件並記 policy version；不得用單一布林值覆蓋歷史。
- 目前 v11 的 `order_customer_snapshots` 是正式訂單 PII 目標路徑；正式接單前需完成加密、key rotation、v9 raw 欄位雙寫／回填與停寫演練。

## 10. 上線安全 gate

以下任一未完成就不得開正式會員／接單：

- [ ] Staging 與 production secrets、D1、R2、OAuth client 完全隔離。
- [ ] 未登入、一般會員、各後台角色的允許／拒絕測試通過。
- [ ] 使用者偽造身分 header 無法繞過 Access。
- [ ] Session、OTP、OAuth、CSRF、XSS、rate limit、Turnstile 測試通過。
- [ ] 個資遮罩、匯出與 audit log 已驗證。
- [ ] 依賴弱點掃描無 high／critical 未處理項目。
- [ ] 備份還原演練與事故聯絡鏈完成。

## 11. 正式營運法規核對 gate

本節是工程交接清單，不是法律意見。正式營運前，營運者應依當時生效版本，請法律顧問確認網站、流程與實際商品是否符合規定；官方法規頁可能包含尚未生效的修正，不能只抄本文日期。

- [個人資料保護法（全國法規資料庫）](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0050021)：確認當事人查詢／更正／停止／刪除流程、目的必要性、蒐集告知事項、正確性與到期處理、非公務機關蒐集與利用依據，以及事故應變。網站隱私告知至少要由營運者確認企業名稱、蒐集目的、資料類別、利用期間／地區／對象／方式、權利行使方式與不提供資料的影響。
- [行政院消費者保護會：通訊交易七日解除權與合理例外](https://cpc.ey.gov.tw/Page/4432D6D5FA6677B9/68d2a0cd-6f61-4e46-80e0-cba38adc776f)：不要自行把佛牌或收藏品一律寫成不可退。若主張合理例外，需先確認商品確實屬適用類型，並在交易前完成必要告知。
- [經濟部：零售業等網路交易定型化契約應記載及不得記載事項](https://law.moea.gov.tw/NewsContent.aspx?id=122415&media=print)：確認企業名稱、負責人、電話、Email、營業地址、商品名稱／價格／內容／規格、下單確認、配送、付款、運費、退貨與個資等揭露。

在企業資訊、正式聯絡方式、交易條款與隱私告知尚未由營運者／法律顧問確認前，不得開啟 production 接單。工程欄位存在不代表告知內容已合法完整。
