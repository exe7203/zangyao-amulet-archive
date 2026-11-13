# Cloudflare 一次性設定（約 3 分鐘）

目前唯一需要你在瀏覽器完成的一步：**授權 Wrangler 連到你的 Cloudflare 帳號**。

> 請勿把 Cloudflare 密碼貼在聊天或 Git。若已外洩，請先到 Cloudflare 改密碼。

## 方式 A：OAuth 登入（最簡單）

在專案目錄終端機執行（**若 `npm run` 被 PowerShell 擋住，請改用下面 node 指令**）：

```powershell
node scripts/cf-login.mjs
```

或：

```powershell
npm.cmd run cf:login
```

瀏覽器會開啟 → 登入 Cloudflare → 按 **Allow** → 回到終端機看到帳號資訊。

### 第一次還需註冊 workers.dev 子網域

若部署時出現 `register a workers.dev subdomain`，請開啟（帳號只需做一次）：

https://dash.cloudflare.com/9b038039f144bd0ed36879f52779a257/workers/onboarding

選一個子網域名稱（例如 `exe7203`），完成後再部署：

```powershell
node scripts/deploy-cloudflare.mjs deploy
```

接著一鍵部署（登入 + 子網域都完成後）：

```powershell
node scripts/cf-setup-all.mjs
```

## 方式 B：API Token（適合長期自動化）

1. 開啟 https://dash.cloudflare.com/profile/api-tokens
2. 建立 Token，範本選 **Edit Cloudflare Workers**
3. 額外勾選 **Account → D1 → Edit**
4. 複製 Token（只顯示一次）

PowerShell：

```powershell
$env:CLOUDFLARE_API_TOKEN = "貼上你的Token"
npm run cf:setup-all
```

## 完成後你會得到

| 項目 | 值 |
|------|-----|
| 前台 | `https://taijuda-amulet-archive.<子網域>.workers.dev/` |
| 後台 | 同上 + `admin/` |
| 資料庫 | Cloudflare D1 `taijuda-prod` |
| 設定檔 | `.cloudflare/deploy.json`（本機，不進 Git） |

## 若登入失敗

- 關閉其他 `wrangler` 程序後重跑 `npm run cf:login`
- 或改用方式 B 的 API Token

## 指令對照

| 指令 | 用途 |
|------|------|
| `npm run cf:login` | Cloudflare OAuth 登入 |
| `npm run cf:setup-all` | bootstrap → migrate → seed → deploy |
| `npm run cf:bootstrap` | 只建立 D1 + deploy.json |
| `npm run cf:migrate` | 只套用資料表 |
| `npm run cf:seed` | 只匯入 published-site.json |
| `npm run cf:deploy` | 只建置 + 部署 Worker |

## 保護後台（Cloudflare Access）

線上 `/admin` 目前只有本機帳密／Worker 自己的登入閘道。正式營運前請在 Cloudflare Zero Trust 加上 Access：

1. 開啟 [Zero Trust](https://one.dash.cloudflare.com/) → **Access** → **Applications**
2. 新增 Self-hosted 應用：
   - Application domain：`taijuda-amulet-archive.<子網域>.workers.dev`
   - Path：`/admin*`
3. Policy：只允許你的 Email（例如 `exe7203@gmail.com`）
4. 本機開發不受影響；Access 只擋公開網路上的 `/admin`

完成後把政策名稱記在營運筆記。Access 設好之前，請勿把後台網址公開給外人。

## 啟用媒體庫（R2）

後台「媒體庫」需要 Cloudflare R2。若部署時看到「尚未啟用 R2」，請：

1. 開啟 [R2 總覽](https://dash.cloudflare.com/?to=/:account/r2/overview) → 按 **Enable R2**（免費額度內即可）
2. 回到專案再跑一次：

```powershell
npm run cf:deploy
```

部署腳本會自動建立 `taijuda-media` bucket 並綁定 `MEDIA`。未啟用 R2 時，網站與後台其他功能仍可正常運作，只是媒體上傳會回 503。

