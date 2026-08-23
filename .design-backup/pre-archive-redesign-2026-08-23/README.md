# 設計備份 pre-archive-redesign-2026-08-23

這是「典藏＋活動」改版前的前台設計快照。你確認新版可用後，再刪這個資料夾即可。

還原指令（會覆蓋目前前台設計相關檔）：

```
node scripts/restore-design-backup.mjs pre-archive-redesign-2026-08-23
node scripts/local-site.mjs build
node scripts/local-site.mjs stop
node scripts/local-site.mjs start
```

包含檔案：
- app/globals.css
- app/storefront.tsx
- app/public-chrome.module.css
- app/public-footer.tsx
- shared/site-settings.ts
- content/published-site.json
