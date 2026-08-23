# 站主必填資料與帳號清單

用途：列出目前不能由開發者猜測或虛構、必須由泰聚達營運者提供或核准的資訊。請在安全的公司文件或 secret manager 維護實際值；本檔只勾狀態，不填密碼、token、私鑰或完整憑證。

## 標記

| 標記 | 意義 |
|---|---|
| **BLOCKING** | 未確認前不得正式上線或不得開啟接單 |
| **FEATURE BLOCKING** | 網站可先上線，但相關功能必須保持關閉 |
| **OPTIONAL** | 可不使用；一旦啟用就必須提供資料、同意與驗收 |

## A. 品牌、網域與企業資訊

| 狀態 | 等級 | 站主需提供／核准 | 用途與驗收證據 |
|---|---|---|---|
| [ ] | **BLOCKING** | 正式主網域與是否使用 `www` | canonical、OAuth callback、cookie、robots、sitemap、DNS；提供網域控制權與最終 origin |
| [ ] | **BLOCKING** | 公司／商號法定名稱 | Footer、條款、隱私告知、交易主體；與登記資料一致 |
| [ ] | **BLOCKING** | 負責人姓名 | 網路交易企業資訊；由營運者／法律顧問確認公開呈現方式 |
| [ ] | **BLOCKING（如適用）** | 統一編號與登記狀態 | 公司／商號資訊及發票流程；不適用須由營運者明確簽核 |
| [ ] | **BLOCKING** | 營業所／聯絡地址 | 企業資訊與正式通知；是否同退貨地址需另答 |
| [ ] | **BLOCKING** | 公司電話與客服 Email | Footer、聯絡頁、訂單通知、消費爭議與個資申請 |
| [ ] | **FEATURE BLOCKING** | LINE 官方帳號 ID／公開連結 | 啟用 LINE 客服前必填；不得用員工私人 LINE 冒充官方管道 |
| [ ] | **BLOCKING** | 客服時間、國定假日規則與預計回覆時間 | 聯絡頁、訂單確認與事故公告 |
| [ ] | **BLOCKING** | 品牌 Logo、標準字、色彩及商標／圖片使用權 | 正式視覺與 favicon；需確認素材權利 |

## B. 商品、交易與履約規則

| 狀態 | 等級 | 站主需提供／核准 | 用途與驗收證據 |
|---|---|---|---|
| [ ] | **BLOCKING** | 可配送國家／地區、偏遠區與不可配送範圍 | 結帳驗證與條款 |
| [ ] | **BLOCKING** | 運費表、免運門檻、合併出貨規則 | 結帳金額與訂單確認；逐情境試算 |
| [ ] | **BLOCKING** | 承運商、配送方式、預計出貨／到貨時間 | 結帳選項、履約後台與通知 |
| [ ] | **BLOCKING** | 便利商店／面交是否提供及各自限制 | 移除不提供的選項；確認門市資料格式與面交地點 |
| [ ] | **BLOCKING** | 正式付款方式、付款期限與未付款處理 | 即使金流延後，接單前仍須有清楚方式；線上金流另見 provider |
| [ ] | **BLOCKING** | 訂單成立／拒絕、缺貨、保留期限與取消規則 | 前台文案、庫存 reservation、客服 SOP |
| [ ] | **BLOCKING** | 退貨地址、申請管道、處理時程與退款方式 | 退換貨頁、客服 SOP、訂單事件 |
| [ ] | **BLOCKING** | 七日解除權、商品檢查、合理例外是否適用 | 由法律顧問按實際商品確認；不得自行把佛牌一律列為例外 |
| [ ] | **BLOCKING** | 商品真實來源、尺寸、材質、年份、保存狀況、價格、庫存與照片 | 每件商品的發布核准紀錄；未確認維持 draft／`seo_ready=false` |
| [ ] | **BLOCKING** | 功效與宗教相關用語規範 | 禁止保證效果、恐嚇、不實或醫療／財務承諾 |
| [ ] | **OPTIONAL** | 電子發票／收據方式與載具需求 | 啟用發票前補服務商、欄位與隱私告知 |

## C. 個資、同意與客服申請

| 狀態 | 等級 | 站主需提供／核准 | 用途與驗收證據 |
|---|---|---|---|
| [ ] | **BLOCKING** | 個資蒐集者名稱與聯絡窗口 | 隱私告知與當事人申請 |
| [ ] | **BLOCKING** | 各資料類別的目的、必要／選填、利用期間、地區、對象與方式 | 結帳、會員、Email、LINE、analytics 的分層告知 |
| [ ] | **BLOCKING** | 訂單、會員、地址、Session、稽核、log、媒體的正式保存年限 | 實作 `purge_after`、排程與刪除／去識別；需法務／會計核准 |
| [ ] | **BLOCKING** | 查詢、複製、更正、停止、刪除與資料匯出的申請窗口及身分驗證方式 | 個資申請 SOP、處理責任人、稽核紀錄 |
| [ ] | **BLOCKING** | 隱私權政策版本與生效日 | `member_consents.policy_version`；條款更新與重新同意策略 |
| [ ] | **BLOCKING** | 服務條款版本與生效日 | append-only terms consent 與交易證據 |
| [ ] | **OPTIONAL** | 行銷同意文案、頻率、管道與退出方式 | 不啟用行銷即可不填；啟用時必須與服務必要同意分開 |
| [ ] | **BLOCKING** | 個資事故與消費爭議負責人、代理人、通知鏈 | 事故 runbook、休假備援與對外窗口 |
| [ ] | **BLOCKING** | 海外服務／跨境處理清單 | Cloudflare、Email、LINE、analytics、金流等第三方揭露與契約確認 |

## D. 雲端、發布與監控帳號

| 狀態 | 等級 | 站主需提供／核准 | 用途與驗收證據 |
|---|---|---|---|
| [ ] | **BLOCKING** | Cloudflare account owner、project 名稱、正式 DNS 管理人 | Worker、D1、R2、Access、domain；至少兩名可恢復管理者 |
| [ ] | **BLOCKING** | 每個 deployment 的品牌、domain 與 `NEXT_PUBLIC_SITE_CODE` 對照 | 目前一個 deployment 只服務一個 public site code；缺省 `taijuda` 不代表可省略正式簽核 |
| [ ] | **BLOCKING** | GitHub repository owner、Environment approver 與 branch protection | CI/CD、release 與 production 人工 gate |
| [ ] | **BLOCKING** | Staging／production D1 與 R2 的名稱、保存方案與費用預算 | 完全隔離，綁定 readback，備份／還原演練 |
| [ ] | **BLOCKING** | 員工後台 allowlist、角色、離職撤權人與 break-glass 持有人 | Access／RBAC 驗收；break-glass 不得共用日常帳號 |
| [ ] | **BLOCKING** | 錯誤監控、告警收件人、值班與服務中斷公告窗口 | production 監控與事故演練 |
| [ ] | **OPTIONAL** | GA4 property／data stream 與公司擁有者 | 啟用前確認 consent、資料保留、跨境與內部流量排除；不得用個人帳號唯一持有 |
| [ ] | **OPTIONAL** | Google Search Console property 與公司擁有者 | 正式網域驗證、sitemap 與 SEO 監控 |
| [ ] | **OPTIONAL** | 廣告像素／轉換追蹤帳號與用途 | 未完成同意與隱私告知前不得植入 |
| [ ] | **OPTIONAL／另案** | 是否真的需要中央多站選擇器、跨站總覽與跨站角色 | 目前未實作；若需要應另立需求、威脅模型與權限設計，不可只共用 D1 後宣稱完成 |

## E. 登入、通知、LINE 與金流 Provider

| 狀態 | 等級 | 站主需提供／核准 | 用途與驗收證據 |
|---|---|---|---|
| [ ] | **FEATURE BLOCKING** | Email OTP 供應商公司帳號、驗證網域、寄件人與帳務 | Email 登入；provider key 進 secret store，不填本檔 |
| [ ] | **FEATURE BLOCKING** | LINE Developers provider／channel 的公司擁有者、channel ID、callback URL | LINE Login；staging／production 分開，client secret 進 secret store |
| [ ] | **OPTIONAL** | Google／Apple Login 的公司 developer 帳號 | 不使用即可關閉；啟用時分環境設 callback、scope、key rotation |
| [ ] | **FEATURE BLOCKING** | Turnstile site／secret key 及 widget 網域 | OTP、建單與濫用防護；正式 key 不用於 staging |
| [ ] | **FEATURE BLOCKING** | 金流公司帳號、合約主體、sandbox／live merchant ID、webhook URL、退款權限 | 線上金流；未完成前 `payment_transactions` 只能是空結構，不可顯示線上付款 |
| [ ] | **FEATURE BLOCKING** | 物流 API 公司帳號、測試／正式憑證與承運商代碼 | 自動標籤／追蹤；未完成可先人工履約，但須有營運規則 |
| [ ] | **BLOCKING** | 系統通知收件人、寄送觸發與失敗補送規則 | 訂單、登入、安全、備份與事故通知 |

## F. 簽核紀錄

| 里程碑 | 負責人 | 日期 | 證據／文件位置 | 結果 |
|---|---|---|---|---|
| 企業與聯絡資訊確認 |  |  |  | [ ] 通過 |
| 交易／配送／退貨條款確認 |  |  |  | [ ] 通過 |
| 個資告知與保存政策確認 |  |  |  | [ ] 通過 |
| 雲端帳號與權限 readback |  |  |  | [ ] 通過 |
| Staging 整合驗收 |  |  |  | [ ] 通過 |
| Production go-live |  |  |  | [ ] 核准 |

所有 **BLOCKING** 項目都完成並有可查證證據前，不得將「前台可開啟」等同「正式商店已完成」。所有 **FEATURE BLOCKING** 項目在未完成時，對應按鈕、API、排程與文案都必須保持關閉。
