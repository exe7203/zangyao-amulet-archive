import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("all backoffice modules render the same global chrome and page action bar", async () => {
  const [chrome, dashboard, articles, products, orders, site, media] = await Promise.all([
    source("app/admin/admin-chrome.tsx"),
    source("app/admin/dashboard/admin-dashboard.tsx"),
    source("app/admin/articles/article-workspace.tsx"),
    source("app/admin/catalog/product-workspace.tsx"),
    source("app/admin/orders/order-workspace.tsx"),
    source("app/admin/site/site-workspace.tsx"),
    source("app/admin/media/media-manager.tsx"),
  ]);

  assert.match(chrome, /data-admin-topbar/);
  assert.match(chrome, /data-admin-actionbar/);
  assert.match(chrome, /hasUnsavedChanges/);
  assert.match(chrome, /onClick=\{area\.key === active \? undefined : confirmNavigation\}/);
  assert.match(dashboard, /<AdminTopbar active="dashboard"/);
  assert.match(articles, /<AdminTopbar[\s\S]*active="articles"/);
  assert.match(articles, /hasUnsavedChanges=\{dirty\}/);
  assert.match(articles, /<AdminActionBar/);
  assert.match(products, /<AdminTopbar active="products" hasUnsavedChanges=\{dirty\}/);
  assert.match(orders, /<AdminTopbar active="orders"/);
  assert.equal((products.match(/<AdminActionBar/g) || []).length + (orders.match(/<AdminActionBar/g) || []).length, 2);
  assert.match(site, /<AdminTopbar active="site"/);
  assert.match(site, /hasUnsavedChanges=\{dirty \|\| siteSettingsDirty\}/);
  assert.match(site, /<AdminActionBar/);
  assert.match(media, /<AdminTopbar active="media"/);
  assert.match(media, /<AdminActionBar/);
  assert.match(chrome, /\/admin\/media\//);
});

test("site builder removes Puck's duplicate publish action through the supported override", async () => {
  const [site, canvas] = await Promise.all([
    source("app/admin/site/site-workspace.tsx"),
    source("app/admin/site/page-canvas.tsx"),
  ]);
  assert.match(canvas, /headerActions:\s*\(\)\s*=>\s*<><\/>/);
  assert.match(canvas, /overrides=\{puckOverrides\}/);
  assert.match(site, />發布頁面<\/AdminButton>/);
});

test("site settings editor manages safe global navigation and required homepage sections", async () => {
  const [site, settingsPanel, siteApi, settings] = await Promise.all([
    source("app/admin/site/site-workspace.tsx"),
    source("app/admin/site/settings-panel.tsx"),
    source("worker/site/handlers.ts"),
    source("shared/site-settings.ts"),
  ]);
  assert.match(settingsPanel, /全站主要導覽/);
  assert.match(site, /updateNavigationItem/);
  assert.match(site, /moveNavigationItem/);
  assert.match(site, /removeNavigationItem/);
  assert.match(settingsPanel, /首頁區塊順序/);
  assert.match(site, /setHomeSectionVisibility/);
  assert.match(site, /id === "hero" \|\| id === "products"/);
  assert.match(site, /siteStructureError/);
  assert.match(siteApi, /validateSiteSettingsStructure\(parsed\.value\.settings\)/);
  assert.match(settings, /safeInternalNavigationHref/);
  assert.match(settings, /value\.length > 6/);
  assert.match(settings, /item\.id === "hero" \|\| item\.id === "products"/);
});

test("admin destructive actions carry the visible version and product rows always have a title", async () => {
  const [articles, productList, site] = await Promise.all([
    source("app/admin/articles/article-workspace.tsx"),
    source("app/admin/catalog/product-list.tsx"),
    source("app/admin/site/site-workspace.tsx"),
  ]);
  assert.match(articles, /body: JSON\.stringify\(\{ expectedVersion: draft\.version \}\)/);
  assert.match(site, /body: JSON\.stringify\(\{ expectedVersion: draft\.version \}\)/);
  assert.match(productList, /product\.shortName \|\| product\.name/);
});

test("shared chrome keeps navigation visible and uses stable desktop dimensions", async () => {
  const css = await source("app/admin/admin-chrome.module.css");
  assert.match(css, /\.globalSidebar\s*\{[\s\S]*?height:\s*100vh/);
  assert.match(css, /\.appHeader\s*\{[\s\S]*?position:\s*sticky/);
  assert.match(css, /\.actionbar\s*\{[\s\S]*?min-height:\s*58px/);
  assert.match(css, /\.control\s*\{[\s\S]*?min-height:\s*38px/);
  assert.match(css, /\.sidebarNav\s*\{/);
  assert.match(css, /@media \(max-width:\s*720px\)[\s\S]*?min-height:\s*44px/);
});

test("dashboard uses shared adminFetch client", async () => {
  const dashboard = await source("app/admin/dashboard/admin-dashboard.tsx");
  assert.match(dashboard, /from "\.\.\/_lib\/api-client"/);
  assert.match(dashboard, /adminFetch<SystemStatus>\(adminSystemStatusPath\(PUBLIC_SITE_CODE\)\)/);
});

test("commerce admin separates inventory quantities and limits order operations to server transitions", async () => {
  const [ui, workspace, productForm, detail, helpers, orderTransitions] = await Promise.all([
    source("app/admin/commerce/ui.tsx"),
    source("app/admin/catalog/product-workspace.tsx"),
    source("app/admin/catalog/product-form.tsx"),
    source("app/admin/orders/order-detail.tsx"),
    source("app/admin/commerce/helpers.ts"),
    source("shared/admin/order-transitions.ts"),
  ]);
  const orderWorkspace = await source("app/admin/orders/order-workspace.tsx");
  const orders = `${orderWorkspace}\n${detail}`;
  const products = `${workspace}\n${productForm}`;

  assert.match(ui, /實有 onHand/);
  assert.match(ui, /訂單保留 reserved/);
  assert.match(ui, /可用 available/);
  assert.match(products, /實有總數（含訂單保留）/);
  assert.match(helpers, /PAYMENT_TRANSITIONS\[order\.paymentStatus\]\.has\(paymentStatus\)/);
  assert.match(orders, /PAYMENT_STATUS_OPTIONS\.filter\(\(paymentStatus\) => paymentChangeAllowed\(selected, paymentStatus\)\)/);
  for (const transition of [
    'uncollected: new Set(["uncollected", "pending", "paid", "failed"])',
    'pending: new Set(["pending", "paid", "failed"])',
    'failed: new Set(["failed", "pending", "paid"])',
    'paid: new Set(["paid", "refunded"])',
    'refunded: new Set(["refunded"])',
  ]) {
    assert.ok(orderTransitions.includes(transition), `shared transitions missing ${transition}`);
  }
  assert.match(orderTransitions, /home_delivery: "台灣本島宅配"/);
  assert.match(orderTransitions, /convenience_store: "超商取貨（門市稍後確認）"/);
  assert.match(orderTransitions, /appointment: "預約面交"/);
  assert.match(orders, /deliveryMethodLabel\(selected\.deliveryMethod\)/);
});

test("commerce admin exposes bounded search and private audit histories", async () => {
  const [products, inventoryLog, workspace, list, detail, storeApi, pagination] = await Promise.all([
    source("app/admin/catalog/product-workspace.tsx"),
    source("app/admin/catalog/inventory-log.tsx"),
    source("app/admin/orders/order-workspace.tsx"),
    source("app/admin/orders/order-list.tsx"),
    source("app/admin/orders/order-detail.tsx"),
    source("worker/store/handlers.ts"),
    source("shared/admin/pagination.ts"),
  ]);
  const orders = `${workspace}\n${list}\n${detail}`;
  const catalog = `${products}\n${inventoryLog}`;

  assert.match(orders, /placeholder="訂單編號、姓名、電話、Email、LINE"/);
  assert.match(orders, /orderStatusFilter/);
  assert.match(orders, /paymentStatusFilter/);
  assert.match(orders, /每頁上限 \{orderPagination\.limit\}/);
  assert.match(orders, />訂單時間軸</);
  assert.match(catalog, />庫存流水</);
  assert.match(orders, /<HistoryPager pagination=\{eventPagination\}/);
  assert.match(catalog, /<HistoryPager pagination=\{pagination\}/);
  assert.match(pagination, /ADMIN_ORDER_LIST_MAX_LIMIT = 50/);
  assert.match(pagination, /ADMIN_HISTORY_MAX_LIMIT = 50/);
  assert.ok(storeApi.includes(String.raw`url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/movements$/)`));
  assert.ok(storeApi.includes(String.raw`url.pathname.match(/^\/api\/admin\/orders\/([^/]+)\/events$/)`));
  assert.match(storeApi, /const identity = await adminIdentity\(request, env\);[\s\S]*if \(adminProductMovements && request\.method === "GET"\)/);
  assert.match(storeApi, /const identity = await adminIdentity\(request, env\);[\s\S]*if \(adminOrderEvents && request\.method === "GET"\)/);
});

test("catalog admin uses server pagination, managed categories, and explained stock adjustments", async () => {
  const [workspace, productList, productForm, storeApi, pagination] = await Promise.all([
    source("app/admin/catalog/product-workspace.tsx"),
    source("app/admin/catalog/product-list.tsx"),
    source("app/admin/catalog/product-form.tsx"),
    source("worker/store/handlers.ts"),
    source("shared/admin/pagination.ts"),
  ]);
  const products = `${workspace}\n${productList}\n${productForm}`;

  assert.match(products, /adminProductsPath\(SITE_CODE, params\)/);
  assert.match(products, /params\.set\("q", productQuery\.trim\(\)\)/);
  assert.match(products, /params\.set\("status", productStatusFilter\)/);
  assert.match(products, /params\.set\("category", productCategoryFilter\)/);
  assert.match(products, /pagination\.totalPages/);
  assert.match(products, /adminCategoriesPath\(SITE_CODE, "all"\)/);
  assert.match(products, /管理商品分類/);
  assert.match(products, /categories[\s\S]*?\.filter\(\(category\) => category\.status === "active"/);
  assert.match(products, /adjustmentReason\.trim\(\)\.length < 4/);
  assert.match(products, /原因會保存在庫存流水/);

  assert.match(pagination, /ADMIN_PRODUCT_LIST_MAX_LIMIT = 100/);
  assert.match(storeApi, /adminPageRequest\(url, ADMIN_PRODUCT_LIST_DEFAULT_LIMIT, ADMIN_PRODUCT_LIST_MAX_LIMIT\)/);
  assert.match(storeApi, /async function saveAdminCategory/);
  assert.match(storeApi, /async function deleteAdminCategory/);
  assert.match(storeApi, /此分類仍有商品使用/);
  assert.match(storeApi, /input\.stock !== current\.inventory\.onHand/);
  assert.match(storeApi, /if \(stockChanged\)/);
  assert.match(storeApi, /current \? input\.adjustmentReason/);
});

test("order fulfillment fields stay distinct from customer notes and public receipts", async () => {
  const [detail, types, storeApi] = await Promise.all([
    source("app/admin/orders/order-detail.tsx"),
    source("app/admin/commerce/types.ts"),
    source("worker/store/handlers.ts"),
  ]);

  for (const label of ["運費（元）", "承運商", "追蹤編號", "內部備註", "客戶備註", "訂單合計"]) {
    assert.ok(detail.includes(label), `order admin is missing ${label}`);
  }
  assert.match(types, /shippingFee:\s*number \| null/);
  assert.match(detail, /內部備註只顯示於後台/);
  assert.match(storeApi, /unexpectedFields/);
  assert.match(storeApi, /internal_note = \?/);
  assert.doesNotMatch(storeApi.match(/function publicOrderReceipt[\s\S]*?\n}/)?.[0] || "", /internalNote|internal_note/);
});

test("article and page admins use bounded server queries without discarding open drafts", async () => {
  const [workspace, list, siteWorkspace, pageList, contentApi, siteApi] = await Promise.all([
    source("app/admin/articles/article-workspace.tsx"),
    source("app/admin/articles/article-list.tsx"),
    source("app/admin/site/site-workspace.tsx"),
    source("app/admin/site/page-list.tsx"),
    source("worker/content/handlers.ts"),
    source("worker/site/handlers.ts"),
  ]);
  const articles = `${workspace}\n${list}`;
  const pages = `${siteWorkspace}\n${pageList}`;

  for (const admin of [articles, pages]) {
    assert.match(admin, /new URLSearchParams\(/);
    assert.match(admin, /params\.set\("q", query\)/);
    assert.match(admin, /params\.set\("status", status\)/);
    assert.match(admin, /totalPages/);
    assert.match(admin, /上一頁/);
    assert.match(admin, /下一頁/);
    assert.match(admin, /selection: "preserve"/);
    assert.match(admin, /options\.selection !== "preserve"/);
  }
  assert.match(articles, /pagination\.total/);
  assert.match(pages, /pagination\.total/);

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
