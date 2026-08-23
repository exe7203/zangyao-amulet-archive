import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Miniflare } from "miniflare";
import {
  MAX_ORDER_DISTINCT_ITEMS,
  ORDER_CONSENT_VERSION,
  RESERVATION_HOLD_HOURS,
  canonicalOrderFingerprint,
  expireStaleReservations,
  handleStoreApi,
  idempotencyReplayDecision,
  normalizeCartItems,
  orderRequestFingerprint,
  paymentTransitionAllowed,
  productMeetsPublicOrderRequirements,
  publicOrderAccess,
  reservationDeadline,
} from "../worker/store-api.ts";
import { resolveCheckoutIdempotencyAttempt } from "../app/checkout-dialog.tsx";

test("checkout reuses an idempotency key only while the normalized payload is unchanged", () => {
  let keyIndex = 0;
  const createKey = () => `checkout-key-${++keyIndex}`;
  const first = resolveCheckoutIdempotencyAttempt(null, "payload-a", createKey);
  const retry = resolveCheckoutIdempotencyAttempt(first, "payload-a", createKey);
  const changed = resolveCheckoutIdempotencyAttempt(retry, "payload-b", createKey);
  assert.equal(first.key, "checkout-key-1");
  assert.equal(retry, first);
  assert.equal(changed.key, "checkout-key-2");
  assert.notEqual(changed, first);
});

test("order size stays within the free D1 invocation query budget", () => {
  const accepted = Array.from({ length: MAX_ORDER_DISTINCT_ITEMS }, (_, index) => ({
    productId: `product-${index}`,
    quantity: 1,
  }));
  assert.equal(normalizeCartItems(accepted).items.length, MAX_ORDER_DISTINCT_ITEMS);
  assert.match(normalizeCartItems([...accepted, { productId: "too-many", quantity: 1 }]).error, /1 至 10 筆/);
});

let miniflare;
let db;

const siteId = "site_taijuda";
const categoryId = "category_taijuda_amulet";

async function executeStatements(statements) {
  for (const statement of statements) await db.prepare(statement).run();
}

async function seedProduct({ id, slug, onHand, reserved = 0, price = 1680 }) {
  await db.batch([
    db.prepare(`INSERT INTO products (
      id, site_id, category_id, sku, slug, name, short_name, description,
      origin, temple, buddhist_year, western_year, material, dimensions,
      price, badge, tone, shape, theme, purchase_limit, stock, status,
      seo_title, seo_description, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, '', '曼谷', '測試寺院', '2569', '2026', '聖粉', '3 cm',
      ?, '', 'sand', 'arch', '守護', 2, ?, 'active', '', '', ?, ?)`)
      .bind(id, siteId, categoryId, `SKU-${id}`, slug, `商品 ${id}`, `短名 ${id}`, price, onHand, "2026-08-04T00:00:00.000Z", "2026-08-04T00:00:00.000Z"),
    db.prepare(`INSERT INTO inventory (product_id, site_id, on_hand, reserved, version, updated_at)
      VALUES (?, ?, ?, ?, 0, ?)`)
      .bind(id, siteId, onHand, reserved, "2026-08-04T00:00:00.000Z"),
  ]);
}

async function seedOrder({
  id,
  productId,
  status = "new",
  paymentStatus = "uncollected",
  reservedUntil,
  quantity = 1,
}) {
  await db.batch([
    db.prepare(`INSERT INTO orders (
      id, site_id, order_number, idempotency_key, request_fingerprint,
      customer_name, customer_phone, customer_email, customer_line_id,
      delivery_method, address, note, subtotal, currency, payment_status,
      order_status, reserved_until, expired_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, '測試顧客', '0912345678', '', '', 'appointment', '', '',
      1680, 'TWD', ?, ?, ?, NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')`)
      .bind(id, siteId, `TJD-${id}`, `idem-${id}`, `fingerprint-${id}`, paymentStatus, status, reservedUntil),
    db.prepare(`INSERT INTO order_items (
      id, order_id, product_id, product_sku, product_name, unit_price, quantity, line_total, created_at
    ) VALUES (?, ?, ?, ?, ?, 1680, ?, ?, '2026-08-01T00:00:00.000Z')`)
      .bind(`item-${id}`, id, productId, `SKU-${productId}`, `商品 ${productId}`, quantity, 1680 * quantity),
  ]);
}

function orderRequest(body) {
  return new Request("http://localhost/api/store/orders", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      origin: "http://localhost",
    },
    body: JSON.stringify(body),
  });
}

function remoteOrderRequest(body) {
  return new Request("https://shop.example/api/store/orders", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      origin: "https://shop.example",
    },
    body: JSON.stringify(body),
  });
}

function adminPatch(orderId, body) {
  return new Request(`http://localhost/api/admin/orders/${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      origin: "http://localhost",
    },
    body: JSON.stringify({ siteCode: "taijuda", ...body }),
  });
}

function authenticatedAdminPatch(orderId, body) {
  return new Request(`https://shop.example/api/admin/orders/${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      origin: "https://shop.example",
      "oai-authenticated-user-email": "owner@example.com",
    },
    body: JSON.stringify({ siteCode: "taijuda", ...body }),
  });
}

function adminProductRequest(body) {
  return new Request("http://localhost/api/admin/products", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      origin: "http://localhost",
    },
    body: JSON.stringify({ siteCode: "taijuda", ...body }),
  });
}

function adminCategoryRequest(method, body, categoryId = "") {
  const suffix = categoryId ? `/${encodeURIComponent(categoryId)}` : "";
  return new Request(`http://localhost/api/admin/categories${suffix}`, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      origin: "http://localhost",
    },
    body: JSON.stringify({ siteCode: "taijuda", ...body }),
  });
}

before(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    compatibilityDate: "2026-05-22",
    d1Databases: { DB: "commerce-core-test" },
  });
  db = await miniflare.getD1Database("DB");
  await executeStatements([
    "CREATE TABLE schema_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE sites (id TEXT PRIMARY KEY NOT NULL, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, locale TEXT NOT NULL DEFAULT 'zh-Hant-TW', currency TEXT NOT NULL DEFAULT 'TWD', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE categories (id TEXT PRIMARY KEY NOT NULL, site_id TEXT NOT NULL, slug TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE products (id TEXT PRIMARY KEY NOT NULL, site_id TEXT NOT NULL, category_id TEXT NOT NULL, sku TEXT NOT NULL, slug TEXT NOT NULL, name TEXT NOT NULL, short_name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', origin TEXT NOT NULL DEFAULT '', temple TEXT NOT NULL DEFAULT '', buddhist_year TEXT NOT NULL DEFAULT '', western_year TEXT NOT NULL DEFAULT '', material TEXT NOT NULL DEFAULT '', dimensions TEXT NOT NULL DEFAULT '', price INTEGER NOT NULL, badge TEXT NOT NULL DEFAULT '', tone TEXT NOT NULL DEFAULT 'sand', shape TEXT NOT NULL, theme TEXT NOT NULL DEFAULT '', purchase_limit INTEGER NOT NULL DEFAULT 1, stock INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft', seo_title TEXT NOT NULL DEFAULT '', seo_description TEXT NOT NULL DEFAULT '', image_url TEXT NOT NULL DEFAULT '', image_alt TEXT NOT NULL DEFAULT '', seo_ready INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE inventory (product_id TEXT PRIMARY KEY NOT NULL, site_id TEXT NOT NULL, on_hand INTEGER NOT NULL DEFAULT 0 CHECK (on_hand >= 0), reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= on_hand), version INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE orders (id TEXT PRIMARY KEY NOT NULL, site_id TEXT NOT NULL, order_number TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_fingerprint TEXT NOT NULL, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, customer_email TEXT NOT NULL DEFAULT '', customer_line_id TEXT NOT NULL DEFAULT '', delivery_method TEXT NOT NULL, address TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', subtotal INTEGER NOT NULL, shipping_fee INTEGER CHECK (shipping_fee IS NULL OR shipping_fee >= 0), carrier TEXT NOT NULL DEFAULT '', tracking_number TEXT NOT NULL DEFAULT '', internal_note TEXT NOT NULL DEFAULT '', currency TEXT NOT NULL DEFAULT 'TWD', payment_status TEXT NOT NULL DEFAULT 'uncollected', order_status TEXT NOT NULL DEFAULT 'new', reserved_until TEXT, expired_at TEXT, consent_version TEXT NOT NULL DEFAULT 'local-reservation-v1', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE order_items (id TEXT PRIMARY KEY NOT NULL, order_id TEXT NOT NULL, product_id TEXT NOT NULL, product_sku TEXT NOT NULL, product_name TEXT NOT NULL, unit_price INTEGER NOT NULL, quantity INTEGER NOT NULL, line_total INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE inventory_movements (id TEXT PRIMARY KEY NOT NULL, site_id TEXT NOT NULL, product_id TEXT NOT NULL, order_id TEXT, movement_type TEXT NOT NULL, quantity INTEGER NOT NULL, on_hand_after INTEGER NOT NULL, reserved_after INTEGER NOT NULL, reason TEXT NOT NULL DEFAULT '', actor TEXT NOT NULL DEFAULT 'system', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE order_events (id TEXT PRIMARY KEY NOT NULL, site_id TEXT NOT NULL, order_id TEXT NOT NULL, event_type TEXT NOT NULL, from_value TEXT NOT NULL DEFAULT '', to_value TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', actor TEXT NOT NULL DEFAULT 'system', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE UNIQUE INDEX orders_site_number_unique ON orders (site_id, order_number)",
    "CREATE UNIQUE INDEX orders_site_idempotency_unique ON orders (site_id, idempotency_key)",
    "CREATE UNIQUE INDEX order_items_order_product_unique ON order_items (order_id, product_id)",
    "CREATE UNIQUE INDEX inventory_movements_order_product_type_unique ON inventory_movements (order_id, product_id, movement_type)",
    "CREATE INDEX order_events_order_created_idx ON order_events (order_id, created_at)",
  ]);
  await db.batch([
    db.prepare("INSERT INTO schema_metadata (key, value) VALUES ('schema_version', '8')"),
    db.prepare("INSERT INTO sites (id, code, name) VALUES (?, 'taijuda', '泰聚達')").bind(siteId),
    db.prepare("INSERT INTO categories (id, site_id, slug, name, sort_order, status) VALUES (?, ?, 'amulet', '佛牌', 1, 'active')").bind(categoryId, siteId),
  ]);
});

after(async () => {
  await miniflare?.dispose();
});

test("order fingerprint is stable across item ordering and detects semantic changes", async () => {
  const base = {
    siteId,
    customer: { name: "王小明", phone: "0912345678", email: "a@example.com", lineId: "line-a" },
    deliveryMethod: "appointment",
    address: "台北",
    note: "下午聯絡",
    items: [{ productId: "product-b", quantity: 2 }, { productId: "product-a", quantity: 1 }],
  };
  const reordered = { ...base, items: [...base.items].reverse() };
  assert.equal(canonicalOrderFingerprint(base), canonicalOrderFingerprint(reordered));
  const fingerprint = await orderRequestFingerprint(base);
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(fingerprint, await orderRequestFingerprint(reordered));
  assert.notEqual(fingerprint, await orderRequestFingerprint({ ...base, note: "改成晚上聯絡" }));
  assert.equal(idempotencyReplayDecision(fingerprint, fingerprint), "replay");
  assert.equal(idempotencyReplayDecision("", fingerprint), "conflict");
  assert.equal(idempotencyReplayDecision("another", fingerprint), "conflict");
});

test("reservation deadline is exactly 72 hours and payment transitions are fail-closed", () => {
  assert.equal(RESERVATION_HOLD_HOURS, 72);
  assert.equal(reservationDeadline("2026-08-04T03:00:00.000Z"), "2026-08-07T03:00:00.000Z");
  assert.equal(paymentTransitionAllowed("uncollected", "paid"), true);
  assert.equal(paymentTransitionAllowed("failed", "pending"), true);
  assert.equal(paymentTransitionAllowed("paid", "refunded"), true);
  assert.equal(paymentTransitionAllowed("paid", "failed"), false);
  assert.equal(paymentTransitionAllowed("refunded", "paid"), false);
  assert.equal(paymentTransitionAllowed("unknown", "paid"), false);
});

test("public ordering is local-only by default and remote enablement is exact", () => {
  assert.deepEqual(publicOrderAccess(new Request("http://localhost/api/store/products"), {}), {
    localDemo: true,
    explicitlyEnabled: false,
    enabled: true,
  });
  assert.equal(publicOrderAccess(new Request("https://shop.example/api/store/products"), {}).enabled, false);
  assert.equal(publicOrderAccess(
    new Request("https://shop.example/api/store/products"),
    { STORE_ORDERS_ENABLED: "true" },
  ).enabled, false);
  assert.equal(publicOrderAccess(
    new Request("https://shop.example/api/store/products"),
    { STORE_ORDERS_ENABLED: "1" },
  ).enabled, true);

  const base = {
    status: "active",
    stock: 1,
    seoReady: true,
    imageUrl: "https://example.com/verified.webp",
    imageAlt: "已覆核商品實物正面",
  };
  assert.equal(productMeetsPublicOrderRequirements(base), true);
  assert.equal(productMeetsPublicOrderRequirements({ ...base, stock: 0 }), false);
  assert.equal(productMeetsPublicOrderRequirements({ ...base, seoReady: false }), false);
  assert.equal(productMeetsPublicOrderRequirements({ ...base, imageUrl: "" }), false);
  assert.equal(productMeetsPublicOrderRequirements({ ...base, imageAlt: "" }), false);
});

test("active sold-out product detail remains readable while reporting zero stock", async () => {
  await seedProduct({ id: "product-soldout", slug: "sold-out-amulet", onHand: 1, reserved: 1 });
  const response = await handleStoreApi(
    new Request("http://localhost/api/store/products/sold-out-amulet?site=taijuda"),
    { DB: db },
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.product.id, "product-soldout");
  assert.equal(payload.product.stock, 0);
  assert.equal(payload.product.imageUrl, "");
  assert.equal(payload.product.imageAlt, "");
  assert.equal(payload.product.seoReady, false);
  assert.equal(payload.product.version, 1);
  assert.equal(payload.ordersEnabled, true);
  assert.equal(payload.readiness.mode, "local_demo");
  assert.deepEqual(payload.readiness.orderableProductIds, []);
});

test("public products expose fail-closed order readiness and remote orders require reviewed product data", async () => {
  await seedProduct({ id: "product-public-unready", slug: "public-unready", onHand: 2 });
  await seedProduct({ id: "product-public-ready", slug: "public-ready", onHand: 2, price: 2680 });
  await db.prepare(`UPDATE products
    SET seo_ready = 1, image_url = 'https://example.com/public-ready.webp', image_alt = '已覆核商品正面實物影像'
    WHERE id = ?`)
    .bind("product-public-ready")
    .run();

  const disabledResponse = await handleStoreApi(
    new Request("https://shop.example/api/store/products?site=taijuda"),
    { DB: db },
  );
  assert.equal(disabledResponse.status, 200);
  const disabledPayload = await disabledResponse.json();
  assert.equal(disabledPayload.ordersEnabled, false);
  assert.equal(disabledPayload.readiness.mode, "disabled");
  assert.deepEqual(disabledPayload.readiness.orderableProductIds, []);
  assert.ok(disabledPayload.readiness.blockedProductIds.includes("product-public-ready"));

  const enabledResponse = await handleStoreApi(
    new Request("https://shop.example/api/store/products?site=taijuda"),
    { DB: db, STORE_ORDERS_ENABLED: "1" },
  );
  assert.equal(enabledResponse.status, 200);
  const enabledPayload = await enabledResponse.json();
  assert.equal(enabledPayload.ordersEnabled, true);
  assert.equal(enabledPayload.readiness.mode, "enabled");
  assert.ok(enabledPayload.readiness.orderableProductIds.includes("product-public-ready"));
  assert.ok(!enabledPayload.readiness.orderableProductIds.includes("product-public-unready"));
  assert.ok(enabledPayload.readiness.blockedProductIds.includes("product-public-unready"));

  const localResponse = await handleStoreApi(
    new Request("http://localhost/api/store/products?site=taijuda"),
    { DB: db },
  );
  const localPayload = await localResponse.json();
  assert.equal(localPayload.ordersEnabled, true);
  assert.equal(localPayload.readiness.mode, "local_demo");
  assert.ok(localPayload.readiness.orderableProductIds.includes("product-public-ready"));
  assert.ok(localPayload.readiness.orderableProductIds.includes("product-public-unready"));

  const baseOrder = {
    siteCode: "taijuda",
    customer: { name: "王小明", phone: "0912345678", email: "", lineId: "" },
    deliveryMethod: "appointment",
    address: "",
    note: "",
    items: [{ productId: "product-public-ready", quantity: 1 }],
  };
  const disabledOrder = await handleStoreApi(remoteOrderRequest({
    ...baseOrder,
    idempotencyKey: "remote-disabled-key-0001",
  }), { DB: db });
  assert.equal(disabledOrder.status, 503);
  assert.equal((await disabledOrder.json()).ordersEnabled, false);
  const disabledOrderRow = await db.prepare(
    "SELECT id FROM orders WHERE idempotency_key = 'remote-disabled-key-0001'",
  ).first();
  assert.equal(disabledOrderRow, null);

  const unreadyOrder = await handleStoreApi(remoteOrderRequest({
    ...baseOrder,
    idempotencyKey: "remote-unready-key-0001",
    items: [{ productId: "product-public-unready", quantity: 1 }],
  }), { DB: db, STORE_ORDERS_ENABLED: "1" });
  assert.equal(unreadyOrder.status, 409);
  assert.match((await unreadyOrder.json()).error, /目前暫不開放訂購/);

  const readyOrder = await handleStoreApi(remoteOrderRequest({
    ...baseOrder,
    idempotencyKey: "remote-ready-key-0001",
  }), { DB: db, STORE_ORDERS_ENABLED: "1" });
  assert.equal(readyOrder.status, 201);
  const readyOrderPayload = await readyOrder.json();
  assert.equal(readyOrderPayload.order.items[0].productId, "product-public-ready");
});

test("admin product writes persist image SEO fields without inventing an inventory change", async () => {
  const productInput = {
    sku: "TJD-SEO-001",
    slug: "seo-ready-amulet",
    name: "SEO 已覆核佛牌測試商品",
    shortName: "SEO 測試佛牌",
    description: "用來驗證商品主圖、替代文字與搜尋覆核狀態的測試商品。",
    category: "佛牌",
    origin: "曼谷",
    temple: "測試寺院",
    buddhistYear: "2569",
    westernYear: "2026",
    material: "聖粉",
    dimensions: "3 cm",
    price: 2680,
    badge: "新品",
    tone: "sand",
    shape: "arch",
    theme: "守護",
    purchaseLimit: 1,
    stock: 1,
    status: "active",
    seoTitle: "SEO 已覆核佛牌商品｜泰聚達",
    seoDescription: "這是一段超過五十個字的商品搜尋摘要，用於確認後台商品儲存時會完整保存主圖、替代文字、SEO 狀態與版本資料，並可安全地提供公開頁面使用。",
    imageUrl: "https://example.com/amulet.webp",
    imageAlt: "SEO 已覆核佛牌正面實拍",
    seoReady: true,
  };

  const created = await handleStoreApi(adminProductRequest(productInput), { DB: db });
  assert.equal(created.status, 201);
  const createdPayload = await created.json();
  assert.equal(createdPayload.product.imageUrl, productInput.imageUrl);
  assert.equal(createdPayload.product.imageAlt, productInput.imageAlt);
  assert.equal(createdPayload.product.seoReady, true);
  assert.equal(createdPayload.product.version, 1);
  assert.equal(createdPayload.product.inventory.version, 0);

  const { inventory, createdAt, updatedAt, ...savedFields } = createdPayload.product;
  assert.ok(createdAt);
  assert.ok(updatedAt);
  const updated = await handleStoreApi(adminProductRequest({
    ...savedFields,
    price: 2880,
    stock: inventory.onHand,
    productVersion: savedFields.version,
    inventoryVersion: inventory.version,
  }), { DB: db });
  assert.equal(updated.status, 200);
  const updatedPayload = await updated.json();
  assert.equal(updatedPayload.product.price, 2880);
  assert.equal(updatedPayload.product.version, 2);
  assert.equal(updatedPayload.product.inventory.version, 0);
  assert.equal(updatedPayload.product.seoReady, true);
  const movementsAfterMetadataSave = await db.prepare(
    "SELECT movement_type, quantity FROM inventory_movements WHERE product_id = ? ORDER BY rowid",
  ).bind(updatedPayload.product.id).all();
  assert.deepEqual(movementsAfterMetadataSave.results, [{ movement_type: "seed", quantity: 1 }]);

  const staleArchive = await handleStoreApi(new Request(
    `http://localhost/api/admin/products/${encodeURIComponent(updatedPayload.product.id)}?site=taijuda&version=1`,
    { method: "DELETE", headers: { accept: "application/json", origin: "http://localhost" } },
  ), { DB: db });
  assert.equal(staleArchive.status, 409);

  const archived = await handleStoreApi(new Request(
    `http://localhost/api/admin/products/${encodeURIComponent(updatedPayload.product.id)}?site=taijuda&version=2`,
    { method: "DELETE", headers: { accept: "application/json", origin: "http://localhost" } },
  ), { DB: db });
  assert.equal(archived.status, 200);
  const archivedPayload = await archived.json();
  assert.equal(archivedPayload.version, 3);

  const {
    inventory: staleInventory,
    createdAt: staleCreatedAt,
    updatedAt: staleUpdatedAt,
    ...staleProductFields
  } = updatedPayload.product;
  assert.ok(staleCreatedAt);
  assert.ok(staleUpdatedAt);
  const staleSaveAfterArchive = await handleStoreApi(adminProductRequest({
    ...staleProductFields,
    status: "active",
    stock: staleInventory.onHand,
    productVersion: staleProductFields.version,
    inventoryVersion: staleInventory.version,
  }), { DB: db });
  assert.equal(staleSaveAfterArchive.status, 409);

  const productAfterStaleSave = await db.prepare(
    "SELECT status, version FROM products WHERE id = ? LIMIT 1",
  ).bind(updatedPayload.product.id).first();
  const inventoryAfterStaleSave = await db.prepare(
    "SELECT on_hand, version FROM inventory WHERE product_id = ? LIMIT 1",
  ).bind(updatedPayload.product.id).first();
  assert.equal(productAfterStaleSave.status, "archived");
  assert.equal(productAfterStaleSave.version, 3);
  assert.equal(inventoryAfterStaleSave.on_hand, staleInventory.onHand);
  assert.equal(inventoryAfterStaleSave.version, staleInventory.version);
});

test("admin categories support authenticated CRUD, archive CAS, and refuse deleting referenced rows", async () => {
  const denied = await handleStoreApi(
    new Request("https://shop.example/api/admin/categories?site=taijuda"),
    { DB: db, ADMIN_EMAIL_ALLOWLIST: "owner@example.com" },
  );
  assert.equal(denied.status, 401);

  const crossOrigin = await handleStoreApi(new Request("https://shop.example/api/admin/categories", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      origin: "https://evil.example",
      "oai-authenticated-user-email": "owner@example.com",
    },
    body: JSON.stringify({ siteCode: "taijuda", name: "跨來源", slug: "cross-origin", sortOrder: 1, status: "active" }),
  }), { DB: db, ADMIN_EMAIL_ALLOWLIST: "owner@example.com" });
  assert.equal(crossOrigin.status, 403);

  const wrongContentType = await handleStoreApi(new Request("https://shop.example/api/admin/categories", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "text/plain",
      origin: "https://shop.example",
      "oai-authenticated-user-email": "owner@example.com",
    },
    body: JSON.stringify({ siteCode: "taijuda", name: "錯誤格式", slug: "wrong-content-type", sortOrder: 1, status: "active" }),
  }), { DB: db, ADMIN_EMAIL_ALLOWLIST: "owner@example.com" });
  assert.equal(wrongContentType.status, 415);

  const created = await handleStoreApi(adminCategoryRequest("POST", {
    name: "供品與配件",
    slug: "offerings-accessories",
    description: "供品、配件與收藏用品",
    sortOrder: 40,
    status: "active",
  }), { DB: db });
  assert.equal(created.status, 201);
  const createdPayload = await created.json();
  assert.equal(createdPayload.category.productCount, 0);
  assert.equal(createdPayload.category.status, "active");

  const updated = await handleStoreApi(adminCategoryRequest("PATCH", {
    name: "供品配件",
    slug: "offerings-accessories",
    description: "供品、配件、展示與收藏用品",
    sortOrder: 45,
    status: "archived",
    expectedUpdatedAt: createdPayload.category.updatedAt,
  }, createdPayload.category.id), { DB: db });
  assert.equal(updated.status, 200);
  const updatedPayload = await updated.json();
  assert.equal(updatedPayload.category.status, "archived");
  assert.notEqual(updatedPayload.category.updatedAt, createdPayload.category.updatedAt);

  const stale = await handleStoreApi(adminCategoryRequest("PATCH", {
    name: "不應覆蓋",
    slug: "should-not-overwrite",
    description: "",
    sortOrder: 50,
    status: "active",
    expectedUpdatedAt: createdPayload.category.updatedAt,
  }, createdPayload.category.id), { DB: db });
  assert.equal(stale.status, 409);

  const deleteWithoutJson = await handleStoreApi(new Request(
    `http://localhost/api/admin/categories/${encodeURIComponent(createdPayload.category.id)}`,
    { method: "DELETE", headers: { accept: "application/json", origin: "http://localhost" } },
  ), { DB: db });
  assert.equal(deleteWithoutJson.status, 415);

  const removed = await handleStoreApi(new Request(
    `http://localhost/api/admin/categories/${encodeURIComponent(createdPayload.category.id)}`,
    { method: "DELETE", headers: { accept: "application/json", "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify({ siteCode: "taijuda", expectedUpdatedAt: updatedPayload.category.updatedAt }) },
  ), { DB: db });
  assert.equal(removed.status, 200);

  const referencedCreated = await handleStoreApi(adminCategoryRequest("POST", {
    name: "測試引用分類",
    slug: "referenced-category",
    description: "刪除保護測試",
    sortOrder: 60,
    status: "active",
  }), { DB: db });
  const referencedPayload = await referencedCreated.json();
  await seedProduct({ id: "product-category-reference", slug: "category-reference", onHand: 1 });
  await db.prepare("UPDATE products SET category_id = ? WHERE id = ?")
    .bind(referencedPayload.category.id, "product-category-reference")
    .run();
  const referencedDelete = await handleStoreApi(new Request(
    `http://localhost/api/admin/categories/${encodeURIComponent(referencedPayload.category.id)}`,
    { method: "DELETE", headers: { accept: "application/json", "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify({ siteCode: "taijuda", expectedUpdatedAt: referencedPayload.category.updatedAt }) },
  ), { DB: db });
  assert.equal(referencedDelete.status, 409);
  assert.match((await referencedDelete.json()).error, /仍有商品使用/);

  const listed = await handleStoreApi(
    new Request("http://localhost/api/admin/categories?site=taijuda&status=all"),
    { DB: db },
  );
  const listedPayload = await listed.json();
  const referencedCategory = listedPayload.categories.find((category) => category.id === referencedPayload.category.id);
  assert.equal(referencedCategory.productCount, 1);
});

test("admin product listing is searched, filtered, and paginated by the server", async () => {
  await seedProduct({ id: "product-filterbatch-a", slug: "filterbatch-a", onHand: 1 });
  await seedProduct({ id: "product-filterbatch-b", slug: "filterbatch-b", onHand: 1 });
  await seedProduct({ id: "product-filterbatch-c", slug: "filterbatch-c", onHand: 1 });
  await db.prepare("UPDATE products SET status = 'archived' WHERE id = 'product-filterbatch-c'").run();

  const pageTwo = await handleStoreApi(new Request(
    "http://localhost/api/admin/products?site=taijuda&q=filterbatch&page=2&limit=1",
  ), { DB: db });
  assert.equal(pageTwo.status, 200);
  const pageTwoPayload = await pageTwo.json();
  assert.equal(pageTwoPayload.products.length, 1);
  assert.deepEqual(pageTwoPayload.pagination, {
    page: 2,
    limit: 1,
    maxLimit: 100,
    total: 3,
    totalPages: 3,
    returned: 1,
  });
  assert.equal(pageTwoPayload.listing.total, 3);

  const active = await handleStoreApi(new Request(
    `http://localhost/api/admin/products?site=taijuda&q=filterbatch&status=active&category=${encodeURIComponent(categoryId)}&page=1&limit=10`,
  ), { DB: db });
  const activePayload = await active.json();
  assert.equal(activePayload.pagination.total, 2);
  assert.ok(activePayload.products.every((product) => product.status === "active" && product.categoryId === categoryId));

  const invalid = await handleStoreApi(new Request(
    "http://localhost/api/admin/products?site=taijuda&status=not-a-product-status",
  ), { DB: db });
  assert.equal(invalid.status, 400);
});

test("metadata saves preserve onHand and reserved without zero movements, while stock changes require a reason", async () => {
  const id = "product-metadata-stock";
  await seedProduct({ id, slug: "metadata-stock", onHand: 10, reserved: 2 });
  const listed = await handleStoreApi(new Request(
    "http://localhost/api/admin/products?site=taijuda&q=metadata-stock&page=1&limit=10",
  ), { DB: db });
  const listedPayload = await listed.json();
  const product = listedPayload.products.find((candidate) => candidate.id === id);
  assert.ok(product);
  assert.equal(product.stock, 8, "public-compatible stock field remains available stock");
  assert.deepEqual(product.inventory, { onHand: 10, reserved: 2, available: 8, version: 0 });

  const { inventory, createdAt, updatedAt, ...fields } = product;
  const metadataSave = await handleStoreApi(adminProductRequest({
    ...fields,
    description: "只修改商品說明，不調整庫存",
    stock: inventory.onHand,
    productVersion: fields.version,
    inventoryVersion: inventory.version,
  }), { DB: db });
  assert.equal(metadataSave.status, 200);
  const metadataPayload = await metadataSave.json();
  assert.equal(metadataPayload.product.inventory.onHand, 10);
  assert.equal(metadataPayload.product.inventory.reserved, 2);
  assert.equal(metadataPayload.product.inventory.version, 0);
  const afterMetadataMovements = await db.prepare(
    "SELECT movement_type, quantity FROM inventory_movements WHERE product_id = ?",
  ).bind(id).all();
  assert.deepEqual(afterMetadataMovements.results, []);

  const { inventory: currentInventory, createdAt: currentCreatedAt, updatedAt: currentUpdatedAt, ...currentFields } = metadataPayload.product;
  assert.ok(createdAt && updatedAt && currentCreatedAt && currentUpdatedAt);
  const missingReason = await handleStoreApi(adminProductRequest({
    ...currentFields,
    stock: 11,
    productVersion: currentFields.version,
    inventoryVersion: currentInventory.version,
  }), { DB: db });
  assert.equal(missingReason.status, 400);
  assert.match((await missingReason.json()).error, /調整原因/);

  const adjusted = await handleStoreApi(adminProductRequest({
    ...currentFields,
    stock: 11,
    adjustmentReason: "年度盤點補入一件",
    productVersion: currentFields.version,
    inventoryVersion: currentInventory.version,
  }), { DB: db });
  assert.equal(adjusted.status, 200);
  const adjustedPayload = await adjusted.json();
  assert.deepEqual(adjustedPayload.product.inventory, { onHand: 11, reserved: 2, available: 9, version: 1 });
  const movements = await db.prepare(
    "SELECT movement_type, quantity, reason FROM inventory_movements WHERE product_id = ?",
  ).bind(id).all();
  assert.deepEqual(movements.results, [{ movement_type: "adjustment", quantity: 1, reason: "年度盤點補入一件" }]);
});

test("order creation persists a deadline, replays the same request, and rejects key collisions", async () => {
  await seedProduct({ id: "product-order", slug: "order-amulet", onHand: 2 });
  const body = {
    siteCode: "taijuda",
    idempotencyKey: "checkout-key-0001",
    customer: { name: "王小明", phone: "0912345678", email: "a@example.com", lineId: "" },
    deliveryMethod: "appointment",
    address: "",
    note: "請晚間聯絡",
    items: [{ productId: "product-order", quantity: 1 }],
  };

  const created = await handleStoreApi(orderRequest(body), { DB: db });
  assert.equal(created.status, 201);
  const createdPayload = await created.json();
  assert.equal(createdPayload.replayed, false);
  assert.match(createdPayload.order.reservedUntil, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(createdPayload.order.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(createdPayload.order.items[0].productId, "product-order");
  assert.equal(createdPayload.order.items[0].quantity, 1);
  for (const privateField of ["customer", "customerName", "customerPhone", "customerEmail", "address", "note", "shippingFee", "carrier", "trackingNumber", "internalNote"]) {
    assert.equal(Object.hasOwn(createdPayload.order, privateField), false, `public receipt leaked ${privateField}`);
  }

  const replay = await handleStoreApi(orderRequest(body), { DB: db });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).replayed, true);

  const pendingShipping = await handleStoreApi(adminPatch(createdPayload.order.id, {
    shippingFee: null,
    carrier: "中華郵政",
    trackingNumber: "RR123456789TW",
    internalNote: "僅內部：高價件雙層包裝",
  }), { DB: db });
  assert.equal(pendingShipping.status, 200);
  const pendingShippingPayload = await pendingShipping.json();
  assert.equal(pendingShippingPayload.order.shippingFee, null);
  assert.equal(pendingShippingPayload.order.carrier, "中華郵政");
  assert.equal(pendingShippingPayload.order.trackingNumber, "RR123456789TW");
  assert.equal(pendingShippingPayload.order.internalNote, "僅內部：高價件雙層包裝");
  assert.equal(pendingShippingPayload.order.note, "請晚間聯絡");

  const zeroShipping = await handleStoreApi(adminPatch(createdPayload.order.id, { shippingFee: 0 }), { DB: db });
  assert.equal(zeroShipping.status, 200);
  assert.equal((await zeroShipping.json()).order.shippingFee, 0);

  const replayAfterFulfillment = await handleStoreApi(orderRequest(body), { DB: db });
  assert.equal(replayAfterFulfillment.status, 200);
  const replayAfterFulfillmentPayload = await replayAfterFulfillment.json();
  for (const privateField of ["shippingFee", "carrier", "trackingNumber", "internalNote"]) {
    assert.equal(Object.hasOwn(replayAfterFulfillmentPayload.order, privateField), false, `public replay leaked ${privateField}`);
  }

  for (const invalidShippingFee of [-1, 1.5, "0"]) {
    const invalid = await handleStoreApi(adminPatch(createdPayload.order.id, { shippingFee: invalidShippingFee }), { DB: db });
    assert.equal(invalid.status, 400);
  }
  const customerNoteOverwrite = await handleStoreApi(adminPatch(createdPayload.order.id, { note: "不可覆蓋" }), { DB: db });
  assert.equal(customerNoteOverwrite.status, 400);
  const unknownField = await handleStoreApi(adminPatch(createdPayload.order.id, { logisticsSynced: true }), { DB: db });
  assert.equal(unknownField.status, 400);

  const conflict = await handleStoreApi(orderRequest({
    ...body,
    items: [{ productId: "product-order", quantity: 2 }],
  }), { DB: db });
  assert.equal(conflict.status, 409);
  assert.match((await conflict.json()).error, /識別碼.*不同/);

  const confirmed = await handleStoreApi(adminPatch(createdPayload.order.id, {
    orderStatus: "confirmed",
  }), { DB: db });
  assert.equal(confirmed.status, 200);
  const paymentPending = await handleStoreApi(adminPatch(createdPayload.order.id, {
    paymentStatus: "pending",
  }), { DB: db });
  assert.equal(paymentPending.status, 200);
  const paymentPaid = await handleStoreApi(authenticatedAdminPatch(createdPayload.order.id, {
    paymentStatus: "paid",
  }), { DB: db, ADMIN_EMAIL_ALLOWLIST: "owner@example.com" });
  assert.equal(paymentPaid.status, 200);

  const inventory = await db.prepare("SELECT reserved FROM inventory WHERE product_id = 'product-order'").first();
  const order = await db.prepare(`SELECT request_fingerprint, reserved_until, consent_version,
    note, shipping_fee, carrier, tracking_number, internal_note
    FROM orders WHERE idempotency_key = 'checkout-key-0001'`).first();
  const events = await db.prepare(`SELECT event_type, from_value, to_value, note, actor
    FROM order_events WHERE order_id = ? ORDER BY rowid`)
    .bind(createdPayload.order.id)
    .all();
  assert.equal(inventory.reserved, 1);
  assert.match(order.request_fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(new Date(order.reserved_until).getTime() - new Date(createdPayload.order.reservedUntil).getTime(), 0);
  assert.equal(order.consent_version, ORDER_CONSENT_VERSION);
  assert.equal(order.note, "請晚間聯絡");
  assert.equal(order.shipping_fee, 0);
  assert.equal(order.carrier, "中華郵政");
  assert.equal(order.tracking_number, "RR123456789TW");
  assert.equal(order.internal_note, "僅內部：高價件雙層包裝");
  assert.deepEqual(events.results.map((event) => ({
    type: event.event_type,
    from: event.from_value,
    to: event.to_value,
    actor: event.actor,
  })), [
    { type: "order_created", from: "", to: "new", actor: "store-api" },
    { type: "fulfillment_updated", from: "", to: "", actor: "local-preview" },
    { type: "fulfillment_updated", from: "", to: "", actor: "local-preview" },
    { type: "order_status_changed", from: "new", to: "confirmed", actor: "local-preview" },
    { type: "payment_status_changed", from: "uncollected", to: "pending", actor: "local-preview" },
    { type: "payment_status_changed", from: "pending", to: "paid", actor: "authenticated-admin" },
  ]);
  const eventMetadata = JSON.stringify(events.results);
  assert.doesNotMatch(eventMetadata, /王小明|0912345678|a@example\.com|owner@example\.com|高價件雙層包裝/);
});

test("expired reservations release inventory exactly once while pending payments remain held", async () => {
  await seedProduct({ id: "product-expired", slug: "expired-amulet", onHand: 1, reserved: 1 });
  await seedOrder({
    id: "order-expired",
    productId: "product-expired",
    reservedUntil: "2026-08-03T00:00:00.000Z",
  });
  await seedProduct({ id: "product-pending", slug: "pending-amulet", onHand: 1, reserved: 1 });
  await seedOrder({
    id: "order-pending",
    productId: "product-pending",
    paymentStatus: "pending",
    reservedUntil: "2026-08-03T00:00:00.000Z",
  });

  const first = await expireStaleReservations(db, "2026-08-07T00:00:00.000Z");
  assert.deepEqual(first, { expired: 1, skipped: 0 });
  const expiredOrder = await db.prepare("SELECT order_status, expired_at, note, internal_note FROM orders WHERE id = 'order-expired'").first();
  const expiredInventory = await db.prepare("SELECT reserved, version FROM inventory WHERE product_id = 'product-expired'").first();
  const pendingOrder = await db.prepare("SELECT order_status, expired_at FROM orders WHERE id = 'order-pending'").first();
  assert.equal(expiredOrder.order_status, "cancelled");
  assert.equal(expiredOrder.expired_at, "2026-08-07T00:00:00.000Z");
  assert.equal(expiredOrder.note, "");
  assert.match(expiredOrder.internal_note, /保留逾 72 小時/);
  assert.deepEqual(expiredInventory, { reserved: 0, version: 1 });
  assert.deepEqual(pendingOrder, { order_status: "new", expired_at: null });

  const second = await expireStaleReservations(db, "2026-08-07T00:00:00.000Z");
  assert.deepEqual(second, { expired: 0, skipped: 0 });
  const movementCount = await db.prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE order_id = 'order-expired' AND movement_type = 'release'").first();
  const expiryEvents = await db.prepare("SELECT event_type, from_value, to_value, actor FROM order_events WHERE order_id = 'order-expired'").all();
  const inventoryAfterReplay = await db.prepare("SELECT reserved, version FROM inventory WHERE product_id = 'product-expired'").first();
  assert.equal(movementCount.count, 1);
  assert.deepEqual(expiryEvents.results, [{
    event_type: "reservation_expired",
    from_value: "new",
    to_value: "cancelled",
    actor: "system-expiry",
  }]);
  assert.deepEqual(inventoryAfterReplay, { reserved: 0, version: 1 });
});

test("paid order cancellation requires a simultaneous refund and releases stock once", async () => {
  await seedProduct({ id: "product-paid", slug: "paid-amulet", onHand: 1, reserved: 1 });
  await seedOrder({
    id: "order-paid",
    productId: "product-paid",
    paymentStatus: "paid",
    reservedUntil: "2026-08-10T00:00:00.000Z",
  });

  const unsafe = await handleStoreApi(adminPatch("order-paid", { orderStatus: "cancelled" }), { DB: db });
  assert.equal(unsafe.status, 409);
  assert.match((await unsafe.json()).error, /同時.*refunded/);

  const safe = await handleStoreApi(adminPatch("order-paid", {
    orderStatus: "cancelled",
    paymentStatus: "refunded",
  }), { DB: db });
  assert.equal(safe.status, 200);
  const payload = await safe.json();
  assert.equal(payload.order.orderStatus, "cancelled");
  assert.equal(payload.order.paymentStatus, "refunded");
  const inventory = await db.prepare("SELECT reserved, version FROM inventory WHERE product_id = 'product-paid'").first();
  const events = await db.prepare("SELECT event_type, from_value, to_value, actor FROM order_events WHERE order_id = 'order-paid' ORDER BY rowid").all();
  assert.deepEqual(inventory, { reserved: 0, version: 1 });
  assert.deepEqual(events.results, [
    { event_type: "order_status_changed", from_value: "new", to_value: "cancelled", actor: "local-preview" },
    { event_type: "payment_status_changed", from_value: "paid", to_value: "refunded", actor: "local-preview" },
  ]);
});

test("admin order search and private history endpoints are filtered, paginated, and authenticated", async () => {
  const productId = "product-admin-history";
  const paidOrderId = "admin-filter-target-paid";
  const failedOrderId = "admin-filter-target-failed";
  await seedProduct({ id: productId, slug: "admin-history-amulet", onHand: 5 });
  await seedOrder({
    id: paidOrderId,
    productId,
    status: "completed",
    paymentStatus: "paid",
    reservedUntil: "2026-08-20T00:00:00.000Z",
  });
  await seedOrder({
    id: failedOrderId,
    productId,
    status: "confirmed",
    paymentStatus: "failed",
    reservedUntil: "2026-08-20T00:00:00.000Z",
  });
  await db.batch([
    db.prepare(`INSERT INTO order_events
      (id, site_id, order_id, event_type, from_value, to_value, note, actor, created_at)
      VALUES ('event-admin-history-1', ?, ?, 'order_created', '', 'new', '建立測試訂單', 'store-api', '2026-08-04T01:00:00.000Z')`)
      .bind(siteId, paidOrderId),
    db.prepare(`INSERT INTO order_events
      (id, site_id, order_id, event_type, from_value, to_value, note, actor, created_at)
      VALUES ('event-admin-history-2', ?, ?, 'order_status_changed', 'shipped', 'completed', '完成測試訂單', 'local-preview', '2026-08-04T02:00:00.000Z')`)
      .bind(siteId, paidOrderId),
    db.prepare(`INSERT INTO inventory_movements
      (id, site_id, product_id, order_id, movement_type, quantity, on_hand_after, reserved_after, reason, actor, created_at)
      VALUES ('movement-admin-history-1', ?, ?, NULL, 'seed', 5, 5, 0, '初始入庫', 'catalog-seed', '2026-08-04T01:00:00.000Z')`)
      .bind(siteId, productId),
    db.prepare(`INSERT INTO inventory_movements
      (id, site_id, product_id, order_id, movement_type, quantity, on_hand_after, reserved_after, reason, actor, created_at)
      VALUES ('movement-admin-history-2', ?, ?, ?, 'sale', -1, 4, 0, '完成訂單扣庫', 'local-preview', '2026-08-04T02:00:00.000Z')`)
      .bind(siteId, productId, paidOrderId),
  ]);

  const ordersResponse = await handleStoreApi(new Request(
    "http://localhost/api/admin/orders?site=taijuda&q=admin-filter-target&orderStatus=completed&paymentStatus=paid&page=1&limit=1",
  ), { DB: db });
  assert.equal(ordersResponse.status, 200);
  const ordersPayload = await ordersResponse.json();
  assert.deepEqual(ordersPayload.orders.map((order) => order.id), [paidOrderId]);
  assert.deepEqual(ordersPayload.pagination, {
    page: 1,
    limit: 1,
    maxLimit: 50,
    total: 1,
    totalPages: 1,
    returned: 1,
  });

  const invalidFilter = await handleStoreApi(new Request(
    "http://localhost/api/admin/orders?site=taijuda&orderStatus=not-a-status",
  ), { DB: db });
  assert.equal(invalidFilter.status, 400);

  const eventsResponse = await handleStoreApi(new Request(
    `http://localhost/api/admin/orders/${paidOrderId}/events?site=taijuda&page=2&limit=1`,
  ), { DB: db });
  assert.equal(eventsResponse.status, 200);
  const eventsPayload = await eventsResponse.json();
  assert.equal(eventsPayload.events.length, 1);
  assert.equal(eventsPayload.events[0].eventType, "order_created");
  assert.deepEqual(eventsPayload.pagination, {
    page: 2,
    limit: 1,
    maxLimit: 50,
    total: 2,
    totalPages: 2,
    returned: 1,
  });

  const movementsResponse = await handleStoreApi(new Request(
    `http://localhost/api/admin/products/${productId}/movements?site=taijuda&page=1&limit=999`,
  ), { DB: db });
  assert.equal(movementsResponse.status, 200);
  const movementsPayload = await movementsResponse.json();
  assert.equal(movementsPayload.movements[0].movementType, "sale");
  assert.equal(movementsPayload.movements[0].availableAfter, 4);
  assert.equal(movementsPayload.pagination.total, 2);
  assert.equal(movementsPayload.pagination.limit, 50);

  for (const path of [
    `/api/admin/orders/${paidOrderId}/events?site=taijuda`,
    `/api/admin/products/${productId}/movements?site=taijuda`,
  ]) {
    const denied = await handleStoreApi(new Request(`https://shop.example${path}`), { DB: db });
    assert.equal(denied.status, 401);
  }
});
