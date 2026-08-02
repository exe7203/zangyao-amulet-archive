import { catalogCategories, products } from "../shared/catalog";
import type { DatabaseEnv } from "./api-utils";

export const DEFAULT_SITE_CODE = "taijuda";
export const DEFAULT_SITE_ID = "site_taijuda";
const CURRENT_SCHEMA_VERSION = 3;

export type { DatabaseEnv };

// A Worker isolate has one D1 binding. Some local/runtime adapters create a new
// JavaScript wrapper for that binding on every request, so keying readiness by
// object identity would rerun every CREATE/seed statement repeatedly.
let readiness: Promise<void> | null = null;

function schemaStatements(db: D1Database) {
  return [
    db.prepare(`CREATE TABLE IF NOT EXISTS schema_metadata (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY NOT NULL,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      locale TEXT NOT NULL DEFAULT 'zh-Hant-TW',
      currency TEXT NOT NULL DEFAULT 'TWD',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      excerpt TEXT NOT NULL DEFAULT '',
      content_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      seo_title TEXT NOT NULL DEFAULT '',
      seo_description TEXT NOT NULL DEFAULT '',
      canonical_url TEXT NOT NULL DEFAULT '',
      og_image_url TEXT NOT NULL DEFAULT '',
      noindex INTEGER NOT NULL DEFAULT 0,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS article_revisions (
      id TEXT PRIMARY KEY NOT NULL,
      article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      slug TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      excerpt TEXT NOT NULL DEFAULT '',
      content_json TEXT NOT NULL,
      seo_title TEXT NOT NULL DEFAULT '',
      seo_description TEXT NOT NULL DEFAULT '',
      canonical_url TEXT NOT NULL DEFAULT '',
      og_image_url TEXT NOT NULL DEFAULT '',
      noindex INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      saved_by TEXT NOT NULL DEFAULT 'local-preview',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      sku TEXT NOT NULL,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      origin TEXT NOT NULL DEFAULT '',
      temple TEXT NOT NULL DEFAULT '',
      buddhist_year TEXT NOT NULL DEFAULT '',
      western_year TEXT NOT NULL DEFAULT '',
      material TEXT NOT NULL DEFAULT '',
      dimensions TEXT NOT NULL DEFAULT '',
      price INTEGER NOT NULL,
      badge TEXT NOT NULL DEFAULT '',
      tone TEXT NOT NULL DEFAULT 'sand',
      shape TEXT NOT NULL,
      theme TEXT NOT NULL DEFAULT '',
      purchase_limit INTEGER NOT NULL DEFAULT 1,
      stock INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      seo_title TEXT NOT NULL DEFAULT '',
      seo_description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS inventory (
      product_id TEXT PRIMARY KEY NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      on_hand INTEGER NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
      reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= on_hand),
      version INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
      order_number TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT NOT NULL DEFAULT '',
      customer_line_id TEXT NOT NULL DEFAULT '',
      delivery_method TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'TWD',
      payment_status TEXT NOT NULL DEFAULT 'uncollected',
      order_status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY NOT NULL,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      product_sku TEXT NOT NULL,
      product_name TEXT NOT NULL,
      unit_price INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      line_total INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
      movement_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      on_hand_after INTEGER NOT NULL,
      reserved_after INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      actor TEXT NOT NULL DEFAULT 'system',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS articles_site_slug_unique ON articles (site_id, slug)"),
    db.prepare("CREATE INDEX IF NOT EXISTS article_revisions_article_idx ON article_revisions (article_id, created_at DESC)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS categories_site_slug_unique ON categories (site_id, slug)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS categories_site_name_unique ON categories (site_id, name)"),
    db.prepare("CREATE INDEX IF NOT EXISTS categories_site_status_idx ON categories (site_id, status, sort_order)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS products_site_slug_unique ON products (site_id, slug)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS products_site_sku_unique ON products (site_id, sku)"),
    db.prepare("CREATE INDEX IF NOT EXISTS products_site_status_stock_idx ON products (site_id, status, stock)"),
    db.prepare("CREATE INDEX IF NOT EXISTS products_category_idx ON products (category_id)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS inventory_site_product_unique ON inventory (site_id, product_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS inventory_site_available_idx ON inventory (site_id, on_hand, reserved)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS orders_site_number_unique ON orders (site_id, order_number)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS orders_site_idempotency_unique ON orders (site_id, idempotency_key)"),
    db.prepare("CREATE INDEX IF NOT EXISTS orders_site_created_idx ON orders (site_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS orders_site_status_idx ON orders (site_id, order_status, payment_status)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS order_items_order_product_unique ON order_items (order_id, product_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS order_items_product_idx ON order_items (product_id)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS inventory_movements_order_product_type_unique ON inventory_movements (order_id, product_id, movement_type)"),
    db.prepare("CREATE INDEX IF NOT EXISTS inventory_movements_product_created_idx ON inventory_movements (product_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS inventory_movements_order_idx ON inventory_movements (order_id)"),
  ];
}

async function addLegacyArticleColumns(db: D1Database) {
  const revisionColumns = await db
    .prepare("PRAGMA table_info(article_revisions)")
    .all<{ name: string }>();
  const names = new Set(revisionColumns.results.map((column) => column.name));
  if (!names.has("slug")) {
    await db.prepare("ALTER TABLE article_revisions ADD COLUMN slug TEXT NOT NULL DEFAULT ''").run();
  }
  if (!names.has("noindex")) {
    await db.prepare("ALTER TABLE article_revisions ADD COLUMN noindex INTEGER NOT NULL DEFAULT 0").run();
  }
}

async function seedCatalog(db: D1Database) {
  await db.prepare("INSERT OR IGNORE INTO sites (id, code, name) VALUES (?, ?, ?)")
    .bind(DEFAULT_SITE_ID, DEFAULT_SITE_CODE, "泰聚達")
    .run();

  await db.batch(catalogCategories.map((category) => db.prepare(`INSERT OR IGNORE INTO categories (
    id, site_id, slug, name, description, sort_order, status
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      category.id,
      DEFAULT_SITE_ID,
      category.slug,
      category.name,
      category.description,
      category.sortOrder,
      category.status,
    )));

  const categoryIds = new Map(catalogCategories.map((category) => [category.name, category.id]));
  await db.batch(products.map((product) => db.prepare(`INSERT OR IGNORE INTO products (
    id, site_id, category_id, sku, slug, name, short_name, description,
    origin, temple, buddhist_year, western_year, material, dimensions,
    price, badge, tone, shape, theme, purchase_limit, stock, status,
    seo_title, seo_description
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      product.id,
      DEFAULT_SITE_ID,
      categoryIds.get(product.category),
      product.sku,
      product.slug,
      product.name,
      product.shortName,
      product.description,
      product.origin,
      product.temple,
      product.buddhistYear,
      product.westernYear,
      product.material,
      product.dimensions,
      product.price,
      product.badge,
      product.tone,
      product.shape,
      product.theme,
      product.purchaseLimit,
      product.stock,
      product.status,
      product.seoTitle,
      product.seoDescription,
    )));

  await db.batch(products.flatMap((product) => [
    db.prepare(`INSERT OR IGNORE INTO inventory (
      product_id, site_id, on_hand, reserved, version
    ) VALUES (?, ?, ?, 0, 0)`)
      .bind(product.id, DEFAULT_SITE_ID, product.stock),
    db.prepare(`INSERT OR IGNORE INTO inventory_movements (
      id, site_id, product_id, order_id, movement_type, quantity,
      on_hand_after, reserved_after, reason, actor
    ) VALUES (?, ?, ?, NULL, 'seed', ?, ?, 0, ?, 'catalog-seed')`)
      .bind(
        `movement_seed_${product.id}`,
        DEFAULT_SITE_ID,
        product.id,
        product.stock,
        product.stock,
        "初始商品庫存",
      ),
  ]));
}

async function initializeDatabase(db: D1Database) {
  try {
    const versionRow = await db.prepare(
      "SELECT value FROM schema_metadata WHERE key = 'schema_version' LIMIT 1",
    ).first<Record<string, unknown>>();
    if (Number(versionRow?.value || 0) >= CURRENT_SCHEMA_VERSION) return;
  } catch {
    // Legacy databases do not have the metadata table yet. The idempotent
    // schema statements below create it without removing any existing data.
  }

  await db.batch(schemaStatements(db));
  await addLegacyArticleColumns(db);
  await seedCatalog(db);
  await db.prepare(`INSERT INTO schema_metadata (key, value, updated_at)
    VALUES ('schema_version', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .bind(String(CURRENT_SCHEMA_VERSION), new Date().toISOString())
    .run();
}

export function ensureDatabase(db: D1Database) {
  if (readiness) return readiness;

  const pending = initializeDatabase(db).catch((error) => {
    readiness = null;
    throw error;
  });
  readiness = pending;
  return pending;
}

export function findSite(db: D1Database, code: string) {
  return db.prepare("SELECT id, code, name, locale, currency FROM sites WHERE code = ? LIMIT 1")
    .bind(code)
    .first<Record<string, unknown>>();
}
