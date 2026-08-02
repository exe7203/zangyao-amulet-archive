import type {
  ProductCategory,
  ProductShape,
  ProductStatus,
} from "../shared/catalog";
import {
  adminIdentity,
  cleanSlug,
  cleanText,
  isRecord,
  json,
  publicJson,
  readJsonObject,
  validateWriteRequest,
} from "./api-utils";
import {
  DEFAULT_SITE_CODE,
  ensureDatabase,
  findSite,
  type DatabaseEnv,
} from "./database";

const PRODUCT_CATEGORIES = new Set<ProductCategory>(["佛牌", "神尊", "符印"]);
const PRODUCT_SHAPES = new Set<ProductShape>(["arch", "oval", "round", "statue"]);
const PRODUCT_STATUSES = new Set<ProductStatus>(["draft", "active", "sold_out", "archived"]);
const DELIVERY_METHODS = new Set(["home_delivery", "convenience_store", "appointment"]);
const ORDER_STATUSES = new Set(["new", "confirmed", "processing", "shipped", "completed", "cancelled"]);
const PAYMENT_STATUSES = new Set(["uncollected", "pending", "paid", "failed", "refunded"]);
const ORDER_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  new: new Set(["new", "confirmed", "cancelled"]),
  confirmed: new Set(["confirmed", "processing", "cancelled"]),
  processing: new Set(["processing", "shipped", "cancelled"]),
  shipped: new Set(["shipped", "completed"]),
  completed: new Set(["completed"]),
  cancelled: new Set(["cancelled"]),
};

const productSelect = `SELECT
  p.*, c.name AS category_name,
  i.on_hand, i.reserved, i.version,
  (i.on_hand - i.reserved) AS available_stock
FROM products p
JOIN categories c ON c.id = p.category_id AND c.site_id = p.site_id
JOIN inventory i ON i.product_id = p.id AND i.site_id = p.site_id`;

function numberValue(value: unknown) {
  return typeof value === "number" ? value : Number(value || 0);
}

function parseProductRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    sku: String(row.sku),
    slug: String(row.slug),
    name: String(row.name),
    shortName: String(row.short_name),
    description: String(row.description || ""),
    category: String(row.category_name) as ProductCategory,
    origin: String(row.origin || ""),
    temple: String(row.temple || ""),
    buddhistYear: String(row.buddhist_year || ""),
    westernYear: String(row.western_year || ""),
    material: String(row.material || ""),
    dimensions: String(row.dimensions || ""),
    price: numberValue(row.price),
    badge: String(row.badge || ""),
    tone: String(row.tone || "sand"),
    shape: String(row.shape) as ProductShape,
    theme: String(row.theme || ""),
    purchaseLimit: numberValue(row.purchase_limit),
    stock: numberValue(row.available_stock),
    status: String(row.status) as ProductStatus,
    seoTitle: String(row.seo_title || ""),
    seoDescription: String(row.seo_description || ""),
    inventory: {
      onHand: numberValue(row.on_hand),
      reserved: numberValue(row.reserved),
      available: numberValue(row.available_stock),
      version: numberValue(row.version),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseOrderRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    orderNumber: String(row.order_number),
    idempotencyKey: String(row.idempotency_key),
    customer: {
      name: String(row.customer_name),
      phone: String(row.customer_phone),
      email: String(row.customer_email || ""),
      lineId: String(row.customer_line_id || ""),
    },
    deliveryMethod: String(row.delivery_method),
    address: String(row.address || ""),
    note: String(row.note || ""),
    subtotal: numberValue(row.subtotal),
    currency: String(row.currency || "TWD"),
    paymentStatus: String(row.payment_status),
    orderStatus: String(row.order_status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseOrderItemRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    sku: String(row.product_sku),
    name: String(row.product_name),
    unitPrice: numberValue(row.unit_price),
    quantity: numberValue(row.quantity),
    lineTotal: numberValue(row.line_total),
  };
}

function integerInRange(value: unknown, minimum: number, maximum: number) {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum
    ? Number(value)
    : null;
}

function cleanIdentifier(value: unknown, maxLength = 100) {
  const identifier = cleanText(value, maxLength);
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(identifier) ? identifier : "";
}

function emailIsValid(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function orderNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `TJD-${date}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function orderWithItems(db: D1Database, siteId: unknown, condition: string, value: string) {
  const row = await db.prepare(`SELECT * FROM orders WHERE site_id = ? AND ${condition} = ? LIMIT 1`)
    .bind(siteId, value)
    .first<Record<string, unknown>>();
  if (!row) return null;

  const items = await db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at, id")
    .bind(row.id)
    .all<Record<string, unknown>>();
  return { ...parseOrderRow(row), items: items.results.map(parseOrderItemRow) };
}

function publicOrderReceipt(order: NonNullable<Awaited<ReturnType<typeof orderWithItems>>>) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.orderStatus,
    total: order.subtotal,
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    items: order.items.map((item) => ({
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
  };
}

async function listPublicProducts(request: Request, db: D1Database, slug?: string) {
  const siteCode = cleanSlug(new URL(request.url).searchParams.get("site")) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return publicJson({ error: "找不到指定站台" }, { status: 404 });

  if (slug) {
    const row = await db.prepare(`${productSelect}
      WHERE p.site_id = ? AND p.slug = ? AND p.status = 'active'
        AND c.status = 'active' AND (i.on_hand - i.reserved) > 0
      LIMIT 1`)
      .bind(site.id, cleanSlug(slug))
      .first<Record<string, unknown>>();
    return row
      ? publicJson({ site, product: parseProductRow(row) })
      : publicJson({ error: "找不到商品" }, { status: 404 });
  }

  const rows = await db.prepare(`${productSelect}
    WHERE p.site_id = ? AND p.status = 'active'
      AND c.status = 'active' AND (i.on_hand - i.reserved) > 0
    ORDER BY c.sort_order, p.created_at, p.id
    LIMIT 100`)
    .bind(site.id)
    .all<Record<string, unknown>>();
  return publicJson({ site, products: rows.results.map(parseProductRow) });
}

function normalizeCartItems(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    return { error: "訂單商品需為 1 至 50 筆" } as const;
  }

  const merged = new Map<string, number>();
  for (const candidate of value) {
    if (!isRecord(candidate)) return { error: "訂單商品格式不正確" } as const;
    const productId = cleanIdentifier(candidate.productId);
    const quantity = integerInRange(candidate.quantity, 1, 100);
    if (!productId || quantity === null) return { error: "商品編號或數量不正確" } as const;
    const next = (merged.get(productId) || 0) + quantity;
    if (next > 100) return { error: "單一商品數量不可超過 100" } as const;
    merged.set(productId, next);
  }

  return {
    items: Array.from(merged, ([productId, quantity]) => ({ productId, quantity })),
  };
}

async function createOrder(request: Request, db: D1Database) {
  const parsed = await readJsonObject(request, 64_000);
  if (parsed.response) return parsed.response;
  const payload = parsed.value;
  const customer = isRecord(payload.customer) ? payload.customer : null;
  const name = cleanText(customer?.name, 80);
  const phone = cleanText(customer?.phone, 30);
  const email = cleanText(customer?.email, 254).toLowerCase();
  const lineId = cleanText(customer?.lineId, 100);
  const deliveryMethod = cleanText(payload.deliveryMethod, 40);
  const address = cleanText(payload.address, 300);
  const note = cleanText(payload.note, 1000);
  const website = cleanText(payload.website, 200);
  const idempotencyKey = cleanIdentifier(payload.idempotencyKey, 120);
  const normalizedItems = normalizeCartItems(payload.items);

  if (website) {
    return json({
      order: {
        id: "accepted",
        orderNumber: "TJD-RECEIVED",
        status: "received",
        total: 0,
        currency: "TWD",
        paymentStatus: "uncollected",
        items: [],
      },
      replayed: false,
    }, { status: 201 });
  }
  if (!name || !phone || phone.replace(/\D/g, "").length < 8) {
    return json({ error: "請提供姓名與可聯絡的電話" }, { status: 400 });
  }
  if (!emailIsValid(email)) return json({ error: "電子信箱格式不正確" }, { status: 400 });
  if (!DELIVERY_METHODS.has(deliveryMethod)) {
    return json({ error: "配送方式不正確" }, { status: 400 });
  }
  if (deliveryMethod === "home_delivery" && !address) {
    return json({ error: "此配送方式需要填寫地址或取貨門市" }, { status: 400 });
  }
  if (!idempotencyKey || idempotencyKey.length < 8) {
    return json({ error: "idempotencyKey 至少需要 8 個英數字元" }, { status: 400 });
  }
  if ("error" in normalizedItems) return json({ error: normalizedItems.error }, { status: 400 });

  const url = new URL(request.url);
  const siteCode = cleanSlug(url.searchParams.get("site") || payload.siteCode) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return json({ error: "找不到指定站台" }, { status: 404 });

  const existing = await orderWithItems(db, site.id, "idempotency_key", idempotencyKey);
  if (existing) return json({ order: publicOrderReceipt(existing), replayed: true });

  const items = normalizedItems.items;
  const placeholders = items.map(() => "?").join(", ");
  const rows = await db.prepare(`${productSelect}
    WHERE p.site_id = ? AND c.status = 'active' AND p.id IN (${placeholders})`)
    .bind(site.id, ...items.map((item) => item.productId))
    .all<Record<string, unknown>>();
  const productsById = new Map(rows.results.map((row) => {
    const product = parseProductRow(row);
    return [product.id, product];
  }));

  if (productsById.size !== items.length) {
    return json({ error: "訂單包含不存在的商品，請重新整理購物車" }, { status: 409 });
  }

  for (const item of items) {
    const product = productsById.get(item.productId)!;
    if (product.status !== "active" || product.stock <= 0) {
      return json({ error: `${product.name}目前無法購買` }, { status: 409 });
    }
    if (item.quantity > product.purchaseLimit) {
      return json({ error: `${product.name}每筆訂單最多 ${product.purchaseLimit} 件` }, { status: 409 });
    }
    if (item.quantity > product.stock) {
      return json({ error: `${product.name}庫存不足，目前可購買 ${product.stock} 件` }, { status: 409 });
    }
  }

  const subtotal = items.reduce((total, item) =>
    total + productsById.get(item.productId)!.price * item.quantity, 0);
  const id = `order_${crypto.randomUUID()}`;
  const number = orderNumber();
  const now = new Date().toISOString();
  const availabilityClauses = items.map(() =>
    "(p.id = ? AND p.price = ? AND p.purchase_limit >= ? AND (i.on_hand - i.reserved) >= ?)").join(" OR ");
  const availabilityBindings = items.flatMap((item) => {
    const product = productsById.get(item.productId)!;
    return [item.productId, product.price, item.quantity, item.quantity];
  });

  const statements = [
    db.prepare(`INSERT INTO orders (
      id, site_id, order_number, idempotency_key,
      customer_name, customer_phone, customer_email, customer_line_id,
      delivery_method, address, note, subtotal, currency,
      payment_status, order_status, created_at, updated_at
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      'uncollected', 'new', ?, ?
    WHERE (SELECT COUNT(*) FROM products p
      JOIN inventory i ON i.product_id = p.id AND i.site_id = p.site_id
      JOIN categories c ON c.id = p.category_id AND c.site_id = p.site_id
      WHERE p.site_id = ? AND p.status = 'active' AND c.status = 'active'
        AND (${availabilityClauses})
    ) = ?`)
      .bind(
        id, site.id, number, idempotencyKey,
        name, phone, email, lineId,
        deliveryMethod, address, note, subtotal, String(site.currency || "TWD"),
        now, now,
        site.id, ...availabilityBindings, items.length,
      ),
  ];

  for (const item of items) {
    const product = productsById.get(item.productId)!;
    statements.push(
      db.prepare(`INSERT INTO order_items (
        id, order_id, product_id, product_sku, product_name,
        unit_price, quantity, line_total, created_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND site_id = ?)`)
        .bind(
          `order_item_${crypto.randomUUID()}`,
          id,
          product.id,
          product.sku,
          product.name,
          product.price,
          item.quantity,
          product.price * item.quantity,
          now,
          id,
          site.id,
        ),
      db.prepare(`UPDATE inventory SET
        reserved = reserved + ?, version = version + 1, updated_at = ?
      WHERE product_id = ? AND site_id = ?
        AND (on_hand - reserved) >= ?
        AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND site_id = ?)`)
        .bind(item.quantity, now, product.id, site.id, item.quantity, id, site.id),
      db.prepare(`INSERT INTO inventory_movements (
        id, site_id, product_id, order_id, movement_type, quantity,
        on_hand_after, reserved_after, reason, actor, created_at
      ) SELECT ?, ?, i.product_id, ?, 'reservation', ?,
        i.on_hand, i.reserved, ?, 'store-api', ?
      FROM inventory i
      WHERE i.product_id = ? AND i.site_id = ?
        AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND site_id = ?)`)
        .bind(
          `movement_${crypto.randomUUID()}`,
          site.id,
          id,
          item.quantity,
          `訂單 ${number} 保留庫存`,
          now,
          product.id,
          site.id,
          id,
          site.id,
        ),
    );
  }

  try {
    await db.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("orders_site_idempotency_unique") || message.includes("UNIQUE")) {
      const replay = await orderWithItems(db, site.id, "idempotency_key", idempotencyKey);
      if (replay) return json({ order: publicOrderReceipt(replay), replayed: true });
    }
    throw error;
  }

  const order = await orderWithItems(db, site.id, "id", id);
  return order
    ? json({ order: publicOrderReceipt(order), replayed: false }, { status: 201 })
    : json({ error: "商品庫存已變更，請重新整理購物車" }, { status: 409 });
}

async function listAdminProducts(request: Request, db: D1Database) {
  const siteCode = cleanSlug(new URL(request.url).searchParams.get("site")) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return json({ error: "找不到指定站台" }, { status: 404 });
  const rows = await db.prepare(`${productSelect}
    WHERE p.site_id = ? ORDER BY p.updated_at DESC, p.created_at DESC LIMIT 200`)
    .bind(site.id)
    .all<Record<string, unknown>>();
  return json({ site, products: rows.results.map(parseProductRow) });
}

function normalizeProductPayload(payload: Record<string, unknown>) {
  const id = payload.id === undefined ? "" : cleanIdentifier(payload.id);
  const sku = cleanText(payload.sku, 60).toUpperCase();
  const slug = cleanSlug(payload.slug || payload.name);
  const name = cleanText(payload.name, 180);
  const shortName = cleanText(payload.shortName, 80);
  const description = cleanText(payload.description, 2000);
  const category = cleanText(payload.category, 30) as ProductCategory;
  const origin = cleanText(payload.origin, 120);
  const temple = cleanText(payload.temple, 180);
  const buddhistYear = cleanText(payload.buddhistYear, 60);
  const westernYear = cleanText(payload.westernYear, 60);
  const material = cleanText(payload.material, 120);
  const dimensions = cleanText(payload.dimensions, 120);
  const price = integerInRange(payload.price, 0, 100_000_000);
  const badge = cleanText(payload.badge, 80);
  const tone = cleanText(payload.tone, 40) || "sand";
  const shape = cleanText(payload.shape, 30) as ProductShape;
  const theme = cleanText(payload.theme, 120);
  const purchaseLimit = integerInRange(payload.purchaseLimit, 1, 100);
  const stock = integerInRange(payload.stock, 0, 100_000);
  const inventoryVersion = payload.inventoryVersion === undefined
    ? null
    : integerInRange(payload.inventoryVersion, 0, 2_147_483_647);
  const status = cleanText(payload.status, 30) as ProductStatus;
  const seoTitle = cleanText(payload.seoTitle, 180);
  const seoDescription = cleanText(payload.seoDescription, 500);

  if ((payload.id !== undefined && !id) || !/^[A-Z0-9][A-Z0-9_-]{2,59}$/.test(sku) ||
      !slug || !name || !shortName || !PRODUCT_CATEGORIES.has(category) ||
      price === null || !PRODUCT_SHAPES.has(shape) || purchaseLimit === null ||
      stock === null || (payload.inventoryVersion !== undefined && inventoryVersion === null) ||
      !PRODUCT_STATUSES.has(status)) {
    return { error: "商品欄位不完整或格式不正確" } as const;
  }

  return {
    product: {
      id, sku, slug, name, shortName, description, category,
      origin, temple, buddhistYear, westernYear, material, dimensions,
      price, badge, tone, shape, theme, purchaseLimit, stock, status,
      seoTitle, seoDescription, inventoryVersion,
    },
  };
}

async function saveAdminProduct(request: Request, db: D1Database, actor: string) {
  const parsed = await readJsonObject(request, 64_000);
  if (parsed.response) return parsed.response;
  const normalized = normalizeProductPayload(parsed.value);
  if ("error" in normalized) return json({ error: normalized.error }, { status: 400 });
  const input = normalized.product;
  const siteCode = cleanSlug(parsed.value.siteCode) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return json({ error: "找不到指定站台" }, { status: 404 });

  const category = await db.prepare(`SELECT id FROM categories
    WHERE site_id = ? AND name = ? AND status = 'active' LIMIT 1`)
    .bind(site.id, input.category)
    .first<Record<string, unknown>>();
  if (!category) return json({ error: "找不到商品分類" }, { status: 400 });

  const id = input.id || `product_${crypto.randomUUID()}`;
  const existing = await db.prepare(`${productSelect} WHERE p.site_id = ? AND p.id = ? LIMIT 1`)
    .bind(site.id, id)
    .first<Record<string, unknown>>();
  const current = existing ? parseProductRow(existing) : null;
  if (current && input.inventoryVersion === null) {
    return json({ error: "商品資料已更新，請重新整理後再儲存" }, { status: 409 });
  }
  if (current && input.stock < current.inventory.reserved) {
    return json({ error: `已有 ${current.inventory.reserved} 件庫存被訂單保留，不可調低至 ${input.stock}` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const productStatement = current
    ? db.prepare(`UPDATE products SET
        category_id = ?, sku = ?, slug = ?, name = ?, short_name = ?, description = ?,
        origin = ?, temple = ?, buddhist_year = ?, western_year = ?, material = ?,
        dimensions = ?, price = ?, badge = ?, tone = ?, shape = ?, theme = ?,
        purchase_limit = ?, stock = ?, status = ?, seo_title = ?, seo_description = ?,
        updated_at = ?
      WHERE id = ? AND site_id = ?
        AND EXISTS (
          SELECT 1 FROM inventory i
          WHERE i.product_id = products.id AND i.site_id = products.site_id AND i.version = ?
        )`)
      .bind(
        category.id, input.sku, input.slug, input.name, input.shortName, input.description,
        input.origin, input.temple, input.buddhistYear, input.westernYear, input.material,
        input.dimensions, input.price, input.badge, input.tone, input.shape, input.theme,
        input.purchaseLimit, input.stock, input.status, input.seoTitle, input.seoDescription,
        now, id, site.id, input.inventoryVersion,
      )
    : db.prepare(`INSERT INTO products (
        id, site_id, category_id, sku, slug, name, short_name, description,
        origin, temple, buddhist_year, western_year, material, dimensions,
        price, badge, tone, shape, theme, purchase_limit, stock, status,
        seo_title, seo_description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        id, site.id, category.id, input.sku, input.slug, input.name, input.shortName, input.description,
        input.origin, input.temple, input.buddhistYear, input.westernYear, input.material,
        input.dimensions, input.price, input.badge, input.tone, input.shape, input.theme,
        input.purchaseLimit, input.stock, input.status, input.seoTitle, input.seoDescription,
        now, now,
      );
  const inventoryStatement = current
    ? db.prepare(`UPDATE inventory SET on_hand = ?, version = version + 1, updated_at = ?
        WHERE product_id = ? AND site_id = ? AND version = ?`)
      .bind(input.stock, now, id, site.id, input.inventoryVersion)
    : db.prepare(`INSERT INTO inventory (product_id, site_id, on_hand, reserved, version, updated_at)
        VALUES (?, ?, ?, 0, 0, ?)`)
      .bind(id, site.id, input.stock, now);
  try {
    const results = await db.batch([
      productStatement,
      inventoryStatement,
      db.prepare(`INSERT INTO inventory_movements (
        id, site_id, product_id, order_id, movement_type, quantity,
        on_hand_after, reserved_after, reason, actor, created_at
      ) SELECT ?, ?, i.product_id, NULL, 'adjustment', ?, i.on_hand, i.reserved, ?, ?, ?
      FROM inventory i WHERE i.product_id = ? AND i.site_id = ?
        AND i.version = ? AND i.updated_at = ?`)
        .bind(
          `movement_${crypto.randomUUID()}`,
          site.id,
          input.stock - (current?.inventory.onHand || 0),
          current ? "後台調整商品庫存" : "後台建立商品庫存",
          actor,
          now,
          id,
          site.id,
          current ? input.inventoryVersion! + 1 : 0,
          now,
        ),
    ]);
    if (Number(results[0]?.meta.changes || 0) !== 1 || Number(results[1]?.meta.changes || 0) !== 1) {
      return json({ error: "商品或庫存已被其他操作更新，請重新整理" }, { status: 409 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE") || message.includes("products_site_")) {
      return json({ error: "商品網址或 SKU 已被使用" }, { status: 409 });
    }
    if (message.includes("CHECK") || message.includes("inventory_reserved_valid")) {
      return json({ error: "庫存已被新訂單保留，請重新整理後再調整" }, { status: 409 });
    }
    throw error;
  }

  const saved = await db.prepare(`${productSelect} WHERE p.site_id = ? AND p.id = ? LIMIT 1`)
    .bind(site.id, id)
    .first<Record<string, unknown>>();
  return json({ product: saved ? parseProductRow(saved) : null }, { status: current ? 200 : 201 });
}

async function archiveAdminProduct(request: Request, db: D1Database, productId: string) {
  const siteCode = cleanSlug(new URL(request.url).searchParams.get("site")) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return json({ error: "找不到指定站台" }, { status: 404 });
  const id = cleanIdentifier(productId);
  if (!id) return json({ error: "商品編號不正確" }, { status: 400 });

  const result = await db.prepare(`UPDATE products SET status = 'archived', updated_at = ?
    WHERE id = ? AND site_id = ?`)
    .bind(new Date().toISOString(), id, site.id)
    .run();
  return result.meta.changes > 0
    ? json({ ok: true, id, status: "archived" })
    : json({ error: "找不到商品" }, { status: 404 });
}

async function listAdminOrders(request: Request, db: D1Database) {
  const siteCode = cleanSlug(new URL(request.url).searchParams.get("site")) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return json({ error: "找不到指定站台" }, { status: 404 });
  const rows = await db.prepare(`SELECT * FROM orders WHERE site_id = ?
    ORDER BY created_at DESC LIMIT 200`)
    .bind(site.id)
    .all<Record<string, unknown>>();
  if (rows.results.length === 0) return json({ site, orders: [] });

  const placeholders = rows.results.map(() => "?").join(", ");
  const itemRows = await db.prepare(`SELECT * FROM order_items WHERE order_id IN (${placeholders})
    ORDER BY created_at, id`)
    .bind(...rows.results.map((row) => row.id))
    .all<Record<string, unknown>>();
  const itemsByOrder = new Map<string, ReturnType<typeof parseOrderItemRow>[]>();
  for (const row of itemRows.results) {
    const orderId = String(row.order_id);
    const items = itemsByOrder.get(orderId) || [];
    items.push(parseOrderItemRow(row));
    itemsByOrder.set(orderId, items);
  }

  return json({
    site,
    orders: rows.results.map((row) => ({
      ...parseOrderRow(row),
      items: itemsByOrder.get(String(row.id)) || [],
    })),
  });
}

async function updateAdminOrder(request: Request, db: D1Database, orderId: string, actor: string) {
  const parsed = await readJsonObject(request, 16_000);
  if (parsed.response) return parsed.response;
  const siteCode = cleanSlug(new URL(request.url).searchParams.get("site") || parsed.value.siteCode) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return json({ error: "找不到指定站台" }, { status: 404 });
  const id = cleanIdentifier(orderId);
  if (!id) return json({ error: "訂單編號不正確" }, { status: 400 });

  const row = await db.prepare("SELECT * FROM orders WHERE id = ? AND site_id = ? LIMIT 1")
    .bind(id, site.id)
    .first<Record<string, unknown>>();
  if (!row) return json({ error: "找不到訂單" }, { status: 404 });
  const current = parseOrderRow(row);
  const hasOrderStatus = Object.hasOwn(parsed.value, "orderStatus");
  const hasPaymentStatus = Object.hasOwn(parsed.value, "paymentStatus");
  const hasNote = Object.hasOwn(parsed.value, "note");
  const nextOrderStatus = hasOrderStatus ? cleanText(parsed.value.orderStatus, 30) : current.orderStatus;
  const nextPaymentStatus = hasPaymentStatus ? cleanText(parsed.value.paymentStatus, 30) : current.paymentStatus;
  const nextNote = hasNote ? cleanText(parsed.value.note, 1000) : current.note;

  if ((!hasOrderStatus && !hasPaymentStatus && !hasNote) ||
      !ORDER_STATUSES.has(nextOrderStatus) || !PAYMENT_STATUSES.has(nextPaymentStatus)) {
    return json({ error: "沒有可更新的訂單欄位，或狀態不正確" }, { status: 400 });
  }
  if (current.orderStatus === "cancelled" && nextOrderStatus !== "cancelled") {
    return json({ error: "已取消的訂單不可重新開啟" }, { status: 409 });
  }
  if (current.orderStatus === "completed" && nextOrderStatus !== "completed") {
    return json({ error: "已完成的訂單不可回復到先前狀態" }, { status: 409 });
  }
  if (!ORDER_TRANSITIONS[current.orderStatus]?.has(nextOrderStatus)) {
    return json({ error: `訂單不可從 ${current.orderStatus} 直接變更為 ${nextOrderStatus}` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const shouldRelease = current.orderStatus !== "cancelled" && nextOrderStatus === "cancelled";
  const shouldConsume = current.orderStatus !== "completed" && nextOrderStatus === "completed";
  if (!shouldRelease && !shouldConsume) {
    const result = await db.prepare(`UPDATE orders SET order_status = ?, payment_status = ?, note = ?, updated_at = ?
      WHERE id = ? AND site_id = ? AND order_status = ?`)
      .bind(nextOrderStatus, nextPaymentStatus, nextNote, now, id, site.id, current.orderStatus)
      .run();
    if (Number(result.meta.changes || 0) !== 1) {
      return json({ error: "訂單已被其他操作更新，請重新整理" }, { status: 409 });
    }
  } else {
    const items = await db.prepare("SELECT product_id, quantity FROM order_items WHERE order_id = ?")
      .bind(id)
      .all<Record<string, unknown>>();
    if (items.results.length === 0) {
      return json({ error: "訂單沒有商品明細，請先人工確認" }, { status: 409 });
    }
    const inventoryRows = await db.prepare(`SELECT product_id, on_hand, reserved FROM inventory
      WHERE site_id = ? AND product_id IN (${items.results.map(() => "?").join(", ")})`)
      .bind(site.id, ...items.results.map((item) => item.product_id))
      .all<Record<string, unknown>>();
    const inventoryByProduct = new Map(inventoryRows.results.map((item) => [String(item.product_id), {
      onHand: numberValue(item.on_hand),
      reserved: numberValue(item.reserved),
    }]));
    if (items.results.some((item) => {
      const inventory = inventoryByProduct.get(String(item.product_id));
      const quantity = numberValue(item.quantity);
      return !inventory || inventory.reserved < quantity || (shouldConsume && inventory.onHand < quantity);
    })) {
      return json({ error: "訂單保留庫存資料不一致，請先人工確認" }, { status: 409 });
    }

    const movementType = shouldRelease ? "release" : "sale";
    const statements = [
      db.prepare(`UPDATE orders SET order_status = ?, payment_status = ?, note = ?, updated_at = ?
        WHERE id = ? AND site_id = ? AND order_status = ?
          AND NOT EXISTS (
            SELECT 1 FROM order_items oi
            LEFT JOIN inventory i ON i.product_id = oi.product_id AND i.site_id = ?
            WHERE oi.order_id = ? AND (
              i.product_id IS NULL OR i.reserved < oi.quantity
              ${shouldConsume ? "OR i.on_hand < oi.quantity" : ""}
            )
          )`)
        .bind(
          nextOrderStatus,
          nextPaymentStatus,
          nextNote,
          now,
          id,
          site.id,
          current.orderStatus,
          site.id,
          id,
        ),
    ];
    for (const item of items.results) {
      const productId = String(item.product_id);
      const quantity = numberValue(item.quantity);
      statements.push(
        shouldRelease
          ? db.prepare(`UPDATE inventory SET reserved = reserved - ?, version = version + 1, updated_at = ?
              WHERE product_id = ? AND site_id = ? AND reserved >= ?
                AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND site_id = ? AND order_status = ?)`)
            .bind(quantity, now, productId, site.id, quantity, id, site.id, nextOrderStatus)
          : db.prepare(`UPDATE inventory SET on_hand = on_hand - ?, reserved = reserved - ?,
              version = version + 1, updated_at = ?
              WHERE product_id = ? AND site_id = ? AND reserved >= ? AND on_hand >= ?
                AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND site_id = ? AND order_status = ?)`)
            .bind(quantity, quantity, now, productId, site.id, quantity, quantity, id, site.id, nextOrderStatus),
        db.prepare(`INSERT INTO inventory_movements (
          id, site_id, product_id, order_id, movement_type, quantity,
          on_hand_after, reserved_after, reason, actor, created_at
        ) SELECT ?, ?, i.product_id, ?, ?, ?, i.on_hand, i.reserved, ?, ?, ?
        FROM inventory i WHERE i.product_id = ? AND i.site_id = ?
          AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND site_id = ? AND order_status = ?)`)
          .bind(
            `movement_${crypto.randomUUID()}`,
            site.id,
            id,
            movementType,
            -quantity,
            shouldRelease
              ? `取消訂單 ${current.orderNumber} 釋放庫存`
              : `完成訂單 ${current.orderNumber} 扣除庫存`,
            actor,
            now,
            productId,
            site.id,
            id,
            site.id,
            nextOrderStatus,
          ),
      );
    }
    try {
      const results = await db.batch(statements);
      if (Number(results[0]?.meta.changes || 0) !== 1) {
        return json({ error: "訂單或庫存已被其他操作更新，請重新整理" }, { status: 409 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("inventory_movements_order_product_type_unique") || message.includes("UNIQUE")) {
        const replay = await orderWithItems(db, site.id, "id", id);
        if (replay?.orderStatus === nextOrderStatus) return json({ order: replay, replayed: true });
      }
      throw error;
    }
  }

  const order = await orderWithItems(db, site.id, "id", id);
  if (order && order.orderStatus !== nextOrderStatus) {
    return json({ error: "訂單狀態已被其他操作更新，請重新整理" }, { status: 409 });
  }
  return json({ order });
}

function adminDenied(request: Request) {
  const hasAuthenticatedEmail = Boolean(request.headers.get("oai-authenticated-user-email"));
  return hasAuthenticatedEmail
    ? json({ error: "此帳號不在後台允許名單內" }, { status: 403 })
    : json({ error: "請先登入後台再繼續", signInUrl: "/signin-with-chatgpt?return_to=%2Fadmin" }, { status: 401 });
}

export async function handleStoreApi(request: Request, env: DatabaseEnv) {
  const url = new URL(request.url);
  const isPublicProducts = url.pathname === "/api/store/products" ||
    url.pathname.startsWith("/api/store/products/");
  const isPublicOrders = url.pathname === "/api/store/orders";
  const isAdminProducts = url.pathname === "/api/admin/products" ||
    url.pathname.startsWith("/api/admin/products/");
  const isAdminOrders = url.pathname === "/api/admin/orders" ||
    url.pathname.startsWith("/api/admin/orders/");
  if (!isPublicProducts && !isPublicOrders && !isAdminProducts && !isAdminOrders) return null;

  if (!env.DB) return json({ error: "商店資料庫尚未連線" }, { status: 503 });

  try {
    await ensureDatabase(env.DB);

    if (isPublicProducts && request.method === "GET") {
      const slug = url.pathname.startsWith("/api/store/products/")
        ? decodeURIComponent(url.pathname.slice("/api/store/products/".length))
        : undefined;
      return listPublicProducts(request, env.DB, slug);
    }
    if (isPublicOrders && request.method === "POST") {
      const invalidWrite = validateWriteRequest(request);
      return invalidWrite || createOrder(request, env.DB);
    }
    if (isPublicProducts || isPublicOrders) {
      return json({ error: "不支援的操作" }, { status: 405, headers: { allow: isPublicProducts ? "GET" : "POST" } });
    }

    const identity = adminIdentity(request, env);
    if (!identity) return adminDenied(request);
    const invalidWrite = validateWriteRequest(request);
    if (invalidWrite) return invalidWrite;

    if (url.pathname === "/api/admin/products" && request.method === "GET") {
      return listAdminProducts(request, env.DB);
    }
    if (url.pathname === "/api/admin/products" && request.method === "POST") {
      return saveAdminProduct(request, env.DB, identity);
    }
    if (url.pathname.startsWith("/api/admin/products/") && request.method === "DELETE") {
      return archiveAdminProduct(
        request,
        env.DB,
        decodeURIComponent(url.pathname.slice("/api/admin/products/".length)),
      );
    }
    if (url.pathname === "/api/admin/orders" && request.method === "GET") {
      return listAdminOrders(request, env.DB);
    }
    if (url.pathname.startsWith("/api/admin/orders/") && request.method === "PATCH") {
      return updateAdminOrder(
        request,
        env.DB,
        decodeURIComponent(url.pathname.slice("/api/admin/orders/".length)),
        identity,
      );
    }

    return json({ error: "不支援的操作" }, { status: 405, headers: { allow: "GET, POST, PATCH, DELETE" } });
  } catch {
    return json(
      { error: "商店服務暫時無法使用" },
      { status: 500 },
    );
  }
}
