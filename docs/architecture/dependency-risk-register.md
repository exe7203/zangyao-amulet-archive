# 相依套件風險紀錄

更新日期：2026-08-12

這份紀錄只描述目前 lockfile 的已知狀態，不代表未來仍然安全。每次發版都必須重新執行依賴稽核、建置與完整測試。

## 目前驗證結果

- `npm audit --omit=dev --audit-level=high`：正式執行依賴 **0 vulnerabilities**。
- 完整 `npm audit`：仍有只存在於建置／本機開發工具鏈的已知風險；不得把 production audit 通過誤寫成整個工具鏈零風險。
- 已升級到不需破壞性變更的 `@cloudflare/vite-plugin 1.51.3`、`wrangler 4.121.0`，並套用 npm 提供的非破壞性 transitive fixes。

## 尚待上游處理的風險

| 來源 | 已知風險 | 目前暴露面 | 現階段處置 | 正式上線 gate |
|---|---|---|---|---|
| `vinext 0.0.50` → `image-size 2.0.2` | ICNS、JXL、HEIF parser 可能無限迴圈造成 DoS（GHSA-w3rx-r6r6-pgpr、GHSA-5p2g-fcmc-qvqq） | build-time；目前網站不接受這三種格式的上傳，也不把顧客輸入交給建置流程 | 固定 lockfile；只使用已審核 PNG／JPEG／WebP 資產；不採 npm 建議的破壞性降版 | 上游提供修正版後先在 staging 升級並跑全套；若仍無修正，需有書面風險核准 |
| `miniflare` 工具鏈 → `undici` | 多項 HTTP parser／cache／cookie advisory | 本機 Worker 模擬與開發工具；不包含在 production dependencies | 不對外公開開發伺服器；綁定 loopback；已更新 Wrangler／Cloudflare plugin | 上游穩定版修正後升級，禁止為了消警報直接切 alpha major |
| `drizzle-kit` → 舊 `esbuild` loader | 開發伺服器跨來源讀取風險 | migration 產生工具；沒有對外服務 | 只在本機／CI 使用，禁止將 drizzle-kit dev server 暴露到網路 | 等 Drizzle 無破壞性修正；升級前後比對 migration SQL |

## 每次變更的判斷順序

1. 先跑 `npm audit --omit=dev --audit-level=high`；正式依賴出現 high／critical 時阻擋發版。
2. 再跑完整 `npm audit`；逐項確認是否在 production runtime、build、CI 或純本機工具。
3. 不執行 `npm audit fix --force`。任何 major／pre-1.0 降版或 alpha 升級都視為架構變更，必須另開 staging 驗證。
4. 更新後至少通過 typecheck、Worker typecheck、lint、Drizzle check、核心測試、正式 build 與靜態公開版驗證。

