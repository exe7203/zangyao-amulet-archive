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

test("site settings editor manages safe global navigation and required homepage sections", async () => {
  const [site, siteApi, settings] = await Promise.all([
    source("app/admin/site/site-editor.tsx"),
    source("worker/site-api.ts"),
    source("shared/site-settings.ts"),
  ]);
  assert.match(site, /全站主要導覽/);
  assert.match(site, /updateNavigationItem/);
  assert.match(site, /moveNavigationItem/);
  assert.match(site, /removeNavigationItem/);
  assert.match(site, /首頁區塊順序/);
  assert.match(site, /setHomeSectionVisibility/);
  assert.match(site, /id === "hero" \|\| id === "products"/);
  assert.match(site, /siteStructureError/);
  assert.match(siteApi, /validateSiteSettingsStructure\(parsed\.value\.settings\)/);
  assert.match(settings, /safeInternalNavigationHref/);
  assert.match(settings, /value\.length > 6/);
  assert.match(settings, /item\.id === "hero" \|\| item\.id === "products"/);
});

test("admin destructive actions carry the visible version and product rows always have a title", async () => {
  const [articles, commerce, site] = await Promise.all([
    source("app/admin/admin-shell.tsx"),
    source("app/admin/store-manager.tsx"),
    source("app/admin/site/site-editor.tsx"),
  ]);
  assert.match(articles, /body: JSON\.stringify\(\{ expectedVersion: draft\.version \}\)/);
  assert.match(site, /body: JSON\.stringify\(\{ expectedVersion: draft\.version \}\)/);
  assert.match(commerce, /product\.shortName \|\| product\.name/);
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
  assert.match(storeApi, /const identity = await adminIdentity\(request, env\);[\s\S]*if \(adminProductMovements && request\.method === "GET"\)/);
  assert.match(storeApi, /const identity = await adminIdentity\(request, env\);[\s\S]*if \(adminOrderEvents && request\.method === "GET"\)/);
});

test("catalog admin uses server pagination, managed categories, and explained stock adjustments", async () => {
  const [commerce, storeApi] = await Promise.all([
    source("app/admin/store-manager.tsx"),
    source("worker/store-api.ts"),
  ]);

  assert.match(commerce, /api\/admin\/products\?\$\{params\}/);
  assert.match(commerce, /params\.set\("q", productQuery\.trim\(\)\)/);
  assert.match(commerce, /params\.set\("status", productStatusFilter\)/);
  assert.match(commerce, /params\.set\("category", productCategoryFilter\)/);
  assert.match(commerce, /productPagination\.totalPages/);
  assert.match(commerce, /api\/admin\/categories\?site=\$\{SITE_CODE\}&status=all/);
  assert.match(commerce, />管理商品分類</);
  assert.match(commerce, /categories\.filter\(\(category\) => category\.status === "active"/);
  assert.match(commerce, /adjustmentReason\.trim\(\)\.length < 4/);
  assert.match(commerce, /原因會保存在庫存流水/);

  assert.match(storeApi, /ADMIN_PRODUCT_LIST_MAX_LIMIT = 100/);
  assert.match(storeApi, /adminPageRequest\(url, ADMIN_PRODUCT_LIST_DEFAULT_LIMIT, ADMIN_PRODUCT_LIST_MAX_LIMIT\)/);
  assert.match(storeApi, /async function saveAdminCategory/);
  assert.match(storeApi, /async function deleteAdminCategory/);
  assert.match(storeApi, /此分類仍有商品使用/);
  assert.match(storeApi, /input\.stock !== current\.inventory\.onHand/);
  assert.match(storeApi, /if \(stockChanged\)/);
  assert.match(storeApi, /current \? input\.adjustmentReason/);
});

test("order fulfillment fields stay distinct from customer notes and public receipts", async () => {
  const [commerce, storeApi] = await Promise.all([
    source("app/admin/store-manager.tsx"),
    source("worker/store-api.ts"),
  ]);

  for (const label of ["運費（元）", "承運商", "追蹤編號", "內部備註", "客戶備註", "訂單合計"]) {
    assert.ok(commerce.includes(label), `order admin is missing ${label}`);
  }
  assert.match(commerce, /shippingFee:\s*number \| null/);
  assert.match(commerce, /內部備註只顯示於後台/);
  assert.match(storeApi, /unexpectedFields/);
  assert.match(storeApi, /internal_note = \?/);
  assert.doesNotMatch(storeApi.match(/function publicOrderReceipt[\s\S]*?\n}/)?.[0] || "", /internalNote|internal_note/);
});

test("article and page admins use bounded server queries without discarding open drafts", async () => {
  const [articles, pages, contentApi, siteApi] = await Promise.all([
    source("app/admin/admin-shell.tsx"),
    source("app/admin/site/site-editor.tsx"),
    source("worker/content-api.ts"),
    source("worker/site-api.ts"),
  ]);

  for (const admin of [articles, pages]) {
    assert.match(admin, /new URLSearchParams\(/);
    assert.match(admin, /params\.set\("q", query\)/);
    assert.match(admin, /params\.set\("status", status\)/);
    assert.match(admin, /totalPages/);
    assert.match(admin, />上一頁<\/button>/);
    assert.match(admin, />下一頁<\/button>/);
    assert.match(admin, /selection: "preserve"/);
    assert.match(admin, /options\.selection !== "preserve"/);
  }
  assert.match(articles, /articlePagination\.total/);
  assert.match(pages, /pagePagination\.total/);

  assert.match(contentApi, /ADMIN_ARTICLE_LIST_DEFAULT_LIMIT = 40/);
  assert.match(contentApi, /ADMIN_ARTICLE_LIST_MAX_LIMIT = 100/);
  assert.match(contentApi, /SELECT COUNT\(\*\) AS total FROM articles/);
  assert.match(contentApi, /文章篩選狀態不正確/);
  assert.ok(contentApi.includes(String.raw`ESCAPE '\\' COLLATE NOCASE`));

  assert.match(siteApi, /ADMIN_PAGE_LIST_DEFAULT_LIMIT = 40/);
  assert.match(siteApi, /ADMIN_PAGE_LIST_MAX_LIMIT = 100/);
  assert.match(siteApi, /SELECT COUNT\(\*\) AS total FROM site_pages/);
  assert.match(siteApi, /頁面篩選狀態不正確/);
  assert.ok(siteApi.includes(String.raw`ESCAPE '\\' COLLATE NOCASE`));
});
