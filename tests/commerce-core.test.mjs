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
  reservationDeadline,
} from "../worker/store-api.ts";

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
const categoryId = "category_amulet";

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
    "CREATE TABLE orders (id TEXT PRIMARY KEY NOT NULL, site_id TEXT NOT NULL, order_number TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_fingerprint TEXT NOT NULL, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, customer_email TEXT NOT NULL DEFAULT '', customer_line_id TEXT NOT NULL DEFAULT '', delivery_method TEXT NOT NULL, address TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', subtotal INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'TWD', payment_status TEXT NOT NULL DEFAULT 'uncollected', order_status TEXT NOT NULL DEFAULT 'new', reserved_until TEXT, expired_at TEXT, consent_version TEXT NOT NULL DEFAULT 'local-reservation-v1', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
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
    db.prepare("INSERT INTO schema_metadata (key, value) VALUES ('schema_version', '7')"),
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
});

test("admin product writes persist image SEO fields and advance product and inventory versions", async () => {
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
    badge: "本週新藏",
    tone: "sand",
    shape: "arch",
    theme: "守護",
    purchaseLimit: 1,
    stock: 1,
    status: "active",
    seoTitle: "SEO 已覆核佛牌商品｜泰聚達",
    seoDescription: "這是一段超過五十個字的商品搜尋摘要，用於確認後台商品儲存時會完整保存主圖、替代文字、SEO 覆核狀態與版本資料，並可安全地提供公開頁面使用。",
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
  assert.equal(updatedPayload.product.inventory.version, 1);
  assert.equal(updatedPayload.product.seoReady, true);

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

test("order creation persists a deadline, replays the same request, and rejects key collisions", async () => {
  await seedProduct({ id: "product-order", slug: "order-amulet", onHand: 2 });
  const body = {
    siteCode: "taijuda",
    idempotencyKey: "checkout-key-0001",
    customer: { name: "王小明", phone: "0912345678", email: "a@example.com", lineId: "" },
    deliveryMethod: "appointment",
    address: "",
    note: "",
    items: [{ productId: "product-order", quantity: 1 }],
  };

  const created = await handleStoreApi(orderRequest(body), { DB: db });
  assert.equal(created.status, 201);
  const createdPayload = await created.json();
  assert.equal(createdPayload.replayed, false);
  assert.match(createdPayload.order.reservedUntil, /^\d{4}-\d{2}-\d{2}T/);

  const replay = await handleStoreApi(orderRequest(body), { DB: db });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).replayed, true);

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
  const order = await db.prepare("SELECT request_fingerprint, reserved_until, consent_version FROM orders WHERE idempotency_key = 'checkout-key-0001'").first();
  const events = await db.prepare(`SELECT event_type, from_value, to_value, note, actor
    FROM order_events WHERE order_id = ? ORDER BY rowid`)
    .bind(createdPayload.order.id)
    .all();
  assert.equal(inventory.reserved, 1);
  assert.match(order.request_fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(new Date(order.reserved_until).getTime() - new Date(createdPayload.order.reservedUntil).getTime(), 0);
  assert.equal(order.consent_version, ORDER_CONSENT_VERSION);
  assert.deepEqual(events.results.map((event) => ({
    type: event.event_type,
    from: event.from_value,
    to: event.to_value,
    actor: event.actor,
  })), [
    { type: "order_created", from: "", to: "new", actor: "store-api" },
    { type: "order_status_changed", from: "new", to: "confirmed", actor: "local-preview" },
    { type: "payment_status_changed", from: "uncollected", to: "pending", actor: "local-preview" },
    { type: "payment_status_changed", from: "pending", to: "paid", actor: "authenticated-admin" },
  ]);
  const eventMetadata = JSON.stringify(events.results);
  assert.doesNotMatch(eventMetadata, /王小明|0912345678|a@example\.com|owner@example\.com/);
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
  const expiredOrder = await db.prepare("SELECT order_status, expired_at, note FROM orders WHERE id = 'order-expired'").first();
  const expiredInventory = await db.prepare("SELECT reserved, version FROM inventory WHERE product_id = 'product-expired'").first();
  const pendingOrder = await db.prepare("SELECT order_status, expired_at FROM orders WHERE id = 'order-pending'").first();
  assert.equal(expiredOrder.order_status, "cancelled");
  assert.equal(expiredOrder.expired_at, "2026-08-07T00:00:00.000Z");
  assert.match(expiredOrder.note, /保留逾 72 小時/);
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
