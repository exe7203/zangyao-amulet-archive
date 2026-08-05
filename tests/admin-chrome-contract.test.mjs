import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("all backoffice modules render the same global chrome and page action bar", async () => {
  const [chrome, dashboard, articles, commerce, site] = await Promise.all([
    source("app/admin/admin-chrome.tsx"),
    source("app/admin/admin-dashboard.tsx"),
    source("app/admin/admin-shell.tsx"),
    source("app/admin/store-manager.tsx"),
    source("app/admin/site/site-editor.tsx"),
  ]);

  assert.match(chrome, /data-admin-topbar/);
  assert.match(chrome, /data-admin-actionbar/);
  assert.match(chrome, /hasUnsavedChanges/);
  assert.match(chrome, /onClick=\{area\.key === active \? undefined : confirmNavigation\}/);
  assert.match(dashboard, /<AdminTopbar active="dashboard"/);
  assert.match(articles, /<AdminTopbar[\s\S]*active="articles"/);
  assert.match(articles, /hasUnsavedChanges=\{dirty\}/);
  assert.match(articles, /<AdminActionBar/);
  assert.match(commerce, /<AdminTopbar active="products" hasUnsavedChanges=\{dirty\}/);
  assert.match(commerce, /<AdminTopbar active="orders"/);
  assert.equal((commerce.match(/<AdminActionBar/g) || []).length, 2);
  assert.match(site, /<AdminTopbar active="site"/);
  assert.match(site, /hasUnsavedChanges=\{dirty \|\| siteSettingsDirty\}/);
  assert.match(site, /<AdminActionBar/);
});

test("site builder removes Puck's duplicate publish action through the supported override", async () => {
  const site = await source("app/admin/site/site-editor.tsx");
  assert.match(site, /headerActions:\s*\(\)\s*=>\s*<><\/>/);
  assert.match(site, /overrides=\{puckOverrides\}/);
  assert.match(site, />發布頁面<\/AdminButton>/);
});

test("shared chrome keeps navigation visible and uses stable desktop dimensions", async () => {
  const css = await source("app/admin/admin-chrome.module.css");
  assert.match(css, /\.topbar\s*\{[\s\S]*?height:\s*72px/);
  assert.match(css, /\.actionbar\s*\{[\s\S]*?min-height:\s*64px/);
  assert.match(css, /\.control\s*\{[\s\S]*?min-height:\s*36px/);
  assert.doesNotMatch(css, /\.navigation\s*\{[^}]*display:\s*none/);
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*?\.control\s*\{\s*min-height:\s*44px/);
});

test("commerce admin separates inventory quantities and limits order operations to server transitions", async () => {
  const [commerce, storeApi] = await Promise.all([
    source("app/admin/store-manager.tsx"),
    source("worker/store-api.ts"),
  ]);

  assert.match(commerce, /實有 onHand/);
  assert.match(commerce, /訂單保留 reserved/);
  assert.match(commerce, /可用 available/);
  assert.match(commerce, /實有總數（含訂單保留）/);
  assert.match(commerce, /PAYMENT_TRANSITIONS\[order\.paymentStatus\]\.has\(paymentStatus\)/);
  assert.match(commerce, /PAYMENT_STATUS_OPTIONS\.filter\(\(paymentStatus\) => paymentChangeAllowed\(selected, paymentStatus\)\)/);
  for (const transition of [
    'uncollected: new Set(["uncollected", "pending", "paid", "failed"])',
    'pending: new Set(["pending", "paid", "failed"])',
    'failed: new Set(["failed", "pending", "paid"])',
    'paid: new Set(["paid", "refunded"])',
    'refunded: new Set(["refunded"])',
  ]) {
    assert.ok(commerce.includes(transition), `admin is missing ${transition}`);
    assert.ok(storeApi.includes(transition), `server is missing ${transition}`);
  }
  assert.match(commerce, /home_delivery: "台灣本島宅配"/);
  assert.match(commerce, /convenience_store: "超商取貨（門市稍後確認）"/);
  assert.match(commerce, /appointment: "預約面交"/);
  assert.match(commerce, /deliveryMethodLabel\(selected\.deliveryMethod\)/);
});

test("commerce admin exposes bounded search and private audit histories", async () => {
  const [commerce, storeApi] = await Promise.all([
    source("app/admin/store-manager.tsx"),
    source("worker/store-api.ts"),
  ]);

  assert.match(commerce, /placeholder="訂單編號、姓名、電話、Email、LINE"/);
  assert.match(commerce, /orderStatusFilter/);
  assert.match(commerce, /paymentStatusFilter/);
  assert.match(commerce, /每頁上限 \{orderPagination\.limit\}/);
  assert.match(commerce, />訂單時間軸</);
  assert.match(commerce, />庫存流水</);
  assert.match(commerce, /<HistoryPager pagination=\{eventPagination\}/);
  assert.match(commerce, /<HistoryPager pagination=\{movementPagination\}/);
  assert.match(storeApi, /ADMIN_ORDER_LIST_MAX_LIMIT = 50/);
  assert.match(storeApi, /ADMIN_HISTORY_MAX_LIMIT = 50/);
  assert.ok(storeApi.includes(String.raw`url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/movements$/)`));
  assert.ok(storeApi.includes(String.raw`url.pathname.match(/^\/api\/admin\/orders\/([^/]+)\/events$/)`));
  assert.match(storeApi, /const identity = adminIdentity\(request, env\);[\s\S]*if \(adminProductMovements && request\.method === "GET"\)/);
  assert.match(storeApi, /const identity = adminIdentity\(request, env\);[\s\S]*if \(adminOrderEvents && request\.method === "GET"\)/);
});
