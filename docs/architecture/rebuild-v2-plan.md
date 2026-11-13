# 泰聚達 v2 重構藍圖（Cloudflare 免費版）

## 1. 目標

- **正式環境**：Cloudflare Worker（`*.workers.dev`）+ D1，暫不綁自訂網域。
- **展示環境**：GitHub Pages 保留靜態快照，標示非正式商店。
- **產品定位**：佛牌／聖物買賣為主；活動為附加服務。
- **策略**：模組化單體，必要處打掉重練；不換成 Payload／Strapi 整包 CMS。

## 2. 部署標的（現階段）

| 項目 | 值 |
|------|-----|
| Worker 名稱 | `taijuda-amulet-archive` |
| 公開網址 | `https://taijuda-amulet-archive.<帳號子網域>.workers.dev/` |
| D1 資料庫 | `taijuda-prod` |
| 接單 | 預設關閉（`STORE_ORDERS_ENABLED=0`） |
| 後台保護 | Cloudflare Access（待設定） |
| 圖片 | Phase 2 接 R2；現階段 URL／氛圍圖 |

詳細 JSON：`.cloudflare/deploy-targets.json`

## 3. 八大核心模組 + 兩個可選

### P0（先重練）

1. **auth** — 本機帳密 + 雲端 Access；API 統一 `adminIdentity`
2. **dashboard** — 待辦、庫存、快照同步、部署狀態
3. **catalog** — 商品、分類、SEO gate、圖片欄位
4. **inventory** — 庫存、異動、原因必填
5. **orders** — 狀態機、客服備註、測試訂單隔離

### P1（第二輪）

6. **content** — 文章；保留 Tiptap，拆 `admin-shell` 巨石檔
7. **site** — 全站文案／主題；Puck 可保留或改表單優先

### P2–P3

8. **media** — R2 + `media_assets`
9. **events** — 附加服務報名（可併入 site 設定）
10. **members** — 既有骨架，後台管理延後

## 4. 打掉 vs 保留

| 保留 | 重寫／拆分 |
|------|------------|
| D1 schema + Drizzle migrations | `store-manager.tsx` → `admin/catalog/*` + `admin/orders/*` |
| Worker API 領域分割（content/site/store） | `store-api.ts` 拆檔 |
| Tiptap 文章引擎 | `admin-shell.tsx` 拆成 list / editor / revisions |
| Puck 頁面引擎（可選） | `site-editor.tsx` 拆殼 + 設定表單優先 |
| 公開前台 React 元件 | 文案層已調整；Phase 2 統一商品圖策略 |
| `published-site.json` 發布管線 | 改為 D1 export 驅動 |

## 5. 資料遷移

1. 遠端建立 D1 → 套用 `drizzle/` migrations（schema v11）
2. 從 `content/published-site.json` 種子匯入（`npm run cf:seed`）
3. 若本機 `.local-data` 有資料 → `npm run cf:import-local` 覆蓋匯入
4. 部署 Worker → smoke test → 後台確認 → `npm run content:sync` 更新快照

## 6. 指令（設定完成後）

```powershell
npx wrangler login
npm run cf:bootstrap
npm run cf:migrate
npm run cf:seed
npm run cf:deploy
```

## 7. 驗收

- [ ] `https://…workers.dev/` 首頁 200
- [ ] `/admin/` 需 Access 或本機登入
- [ ] D1 有商品／文章／設定
- [ ] `/api/health` 200
- [ ] 未登入無法寫入 `/api/admin/*`
