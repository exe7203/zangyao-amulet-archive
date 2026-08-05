import { fallbackArticles } from "../app/article-data";
import { catalogCategories, products } from "../shared/catalog";
import { DEFAULT_BRAND_PAGE } from "../shared/default-page";
import type { DatabaseEnv } from "./api-utils";

export const DEFAULT_SITE_CODE = "taijuda";
export const DEFAULT_SITE_ID = "site_taijuda";
const SEED_TIMESTAMP = "2026-08-04T00:00:00.000Z";
const CURRENT_SCHEMA_VERSION = 7;

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
    db.prepare(`CREATE TABLE IF NOT EXISTS site_settings (
      site_id TEXT PRIMARY KEY NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      settings_json TEXT NOT NULL DEFAULT '{}',
      theme_json TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT NOT NULL DEFAULT 'system',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS site_pages (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      data_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      seo_title TEXT NOT NULL DEFAULT '',
      seo_description TEXT NOT NULL DEFAULT '',
      canonical_url TEXT NOT NULL DEFAULT '',
      og_image_url TEXT NOT NULL DEFAULT '',
      noindex INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS site_page_revisions (
      id TEXT PRIMARY KEY NOT NULL,
      page_id TEXT NOT NULL REFERENCES site_pages(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      data_json TEXT NOT NULL,
      status TEXT NOT NULL,
      seo_title TEXT NOT NULL DEFAULT '',
      seo_description TEXT NOT NULL DEFAULT '',
      canonical_url TEXT NOT NULL DEFAULT '',
      og_image_url TEXT NOT NULL DEFAULT '',
      noindex INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL,
      saved_by TEXT NOT NULL DEFAULT 'local-preview',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      tag TEXT NOT NULL DEFAULT '收藏誌',
      keywords_json TEXT NOT NULL DEFAULT '[]',
      hero_image_url TEXT NOT NULL DEFAULT '',
      hero_image_alt TEXT NOT NULL DEFAULT '',
      noindex INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
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
      tag TEXT NOT NULL DEFAULT '收藏誌',
      keywords_json TEXT NOT NULL DEFAULT '[]',
      hero_image_url TEXT NOT NULL DEFAULT '',
      hero_image_alt TEXT NOT NULL DEFAULT '',
      noindex INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
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
      image_url TEXT NOT NULL DEFAULT '',
      image_alt TEXT NOT NULL DEFAULT '',
      seo_ready INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
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
      request_fingerprint TEXT NOT NULL DEFAULT '',
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
      reserved_until TEXT,
      expired_at TEXT,
      consent_version TEXT NOT NULL DEFAULT 'local-reservation-v1',
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
    db.prepare(`CREATE TABLE IF NOT EXISTS order_events (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      from_value TEXT NOT NULL DEFAULT '',
      to_value TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      actor TEXT NOT NULL DEFAULT 'system',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS site_pages_site_slug_unique ON site_pages (site_id, slug)"),
    db.prepare("CREATE INDEX IF NOT EXISTS site_pages_site_status_updated_idx ON site_pages (site_id, status, updated_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS site_page_revisions_page_created_idx ON site_page_revisions (page_id, created_at DESC)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS articles_site_slug_unique ON articles (site_id, slug)"),
    db.prepare("CREATE INDEX IF NOT EXISTS articles_site_status_updated_idx ON articles (site_id, status, updated_at)"),
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
    db.prepare("CREATE INDEX IF NOT EXISTS order_events_order_created_idx ON order_events (order_id, created_at DESC)"),
  ];
}

async function tableColumnNames(db: D1Database, table: string) {
  const result = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return new Set(result.results.map((column) => column.name));
}

async function addMissingColumns(
  db: D1Database,
  table: string,
  definitions: readonly [name: string, sql: string][],
) {
  const names = await tableColumnNames(db, table);
  for (const [name, definition] of definitions) {
    if (!names.has(name)) await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${definition}`).run();
  }
}

async function upgradeLegacySchema(db: D1Database) {
  await addMissingColumns(db, "articles", [
    ["tag", "tag TEXT NOT NULL DEFAULT '收藏誌'"],
    ["keywords_json", "keywords_json TEXT NOT NULL DEFAULT '[]'"],
    ["hero_image_url", "hero_image_url TEXT NOT NULL DEFAULT ''"],
    ["hero_image_alt", "hero_image_alt TEXT NOT NULL DEFAULT ''"],
    ["version", "version INTEGER NOT NULL DEFAULT 1"],
  ]);
  await addMissingColumns(db, "article_revisions", [
    ["slug", "slug TEXT NOT NULL DEFAULT ''"],
    ["noindex", "noindex INTEGER NOT NULL DEFAULT 0"],
    ["tag", "tag TEXT NOT NULL DEFAULT '收藏誌'"],
    ["keywords_json", "keywords_json TEXT NOT NULL DEFAULT '[]'"],
    ["hero_image_url", "hero_image_url TEXT NOT NULL DEFAULT ''"],
    ["hero_image_alt", "hero_image_alt TEXT NOT NULL DEFAULT ''"],
    ["version", "version INTEGER NOT NULL DEFAULT 1"],
  ]);
  await addMissingColumns(db, "products", [
    ["image_url", "image_url TEXT NOT NULL DEFAULT ''"],
    ["image_alt", "image_alt TEXT NOT NULL DEFAULT ''"],
    ["seo_ready", "seo_ready INTEGER NOT NULL DEFAULT 0"],
    ["version", "version INTEGER NOT NULL DEFAULT 1"],
  ]);
  await addMissingColumns(db, "orders", [
    ["request_fingerprint", "request_fingerprint TEXT NOT NULL DEFAULT ''"],
    ["reserved_until", "reserved_until TEXT"],
    ["expired_at", "expired_at TEXT"],
    ["consent_version", "consent_version TEXT NOT NULL DEFAULT 'local-reservation-v1'"],
  ]);
  await db.batch([
    db.prepare(`UPDATE site_settings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
      WHERE updated_at GLOB '????-??-?? ??:??:??*'`),
    db.prepare(`UPDATE site_pages SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at)
      WHERE created_at GLOB '????-??-?? ??:??:??*'`),
    db.prepare(`UPDATE site_pages SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
      WHERE updated_at GLOB '????-??-?? ??:??:??*'`),
    db.prepare(`UPDATE site_pages SET published_at = strftime('%Y-%m-%dT%H:%M:%fZ', published_at)
      WHERE published_at GLOB '????-??-?? ??:??:??*'`),
    db.prepare(`UPDATE articles SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at)
      WHERE created_at GLOB '????-??-?? ??:??:??*'`),
    db.prepare(`UPDATE articles SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
      WHERE updated_at GLOB '????-??-?? ??:??:??*'`),
    db.prepare(`UPDATE articles SET published_at = strftime('%Y-%m-%dT%H:%M:%fZ', published_at)
      WHERE published_at GLOB '????-??-?? ??:??:??*'`),
    db.prepare(`UPDATE products SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
      WHERE updated_at GLOB '????-??-?? ??:??:??*'`),
  ]);
  await db.prepare(`UPDATE orders
    SET reserved_until = strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+72 hours')
    WHERE reserved_until IS NULL AND order_status = 'new'
      AND payment_status IN ('uncollected', 'failed')`).run();
  await db.prepare("DROP INDEX IF EXISTS orders_site_reservation_expiry_idx").run();
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS orders_reservation_expiry_idx
      ON orders (order_status, payment_status, reserved_until)
      WHERE reserved_until IS NOT NULL`,
  ).run();
  // Older local databases could contain duplicate revision numbers from a
  // concurrent restore. Keep the newest copy before enforcing one immutable
  // revision per page/version.
  await db.prepare(`DELETE FROM site_page_revisions
    WHERE rowid NOT IN (
      SELECT MAX(rowid) FROM site_page_revisions GROUP BY page_id, version
    )`).run();
  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS site_page_revisions_page_version_unique
    ON site_page_revisions (page_id, version)`).run();
}

async function seedCatalog(db: D1Database) {
  await db.prepare("INSERT OR IGNORE INTO sites (id, code, name) VALUES (?, ?, ?)")
    .bind(DEFAULT_SITE_ID, DEFAULT_SITE_CODE, "泰聚達")
    .run();

  await db.prepare(`INSERT OR IGNORE INTO site_settings (
    site_id, settings_json, theme_json, version, updated_by, updated_at
  ) VALUES (?, ?, ?, 1, 'catalog-seed', ?)`)
    .bind(
      DEFAULT_SITE_ID,
      JSON.stringify({
        announcement: "台灣現貨・來源透明",
        brandName: "泰聚達",
        brandSubtitle: "THAI AMULET ARCHIVE",
        footerNote: "展示商品與來源資料正式上架前仍須逐件覆核。",
        homeHeroEyebrow: "AMULET ARCHIVE · TAIWAN",
        homeHeroTitlePrimary: "把來源說清楚，",
        homeHeroTitleSecondary: "才值得長久收藏。",
        homeHeroLead: "精選泰國佛牌與聖物，以實物影像、尺寸材質、法會年份與來源紀錄，陪你從理解文化開始選擇。",
        homePrimaryCtaLabel: "探索本週新藏",
        homeSecondaryCtaLabel: "先讀選牌指南",
        homeCollectionsTitle: "從喜歡的形制開始",
        homeCollectionsIntro: "不確定該怎麼選？先從外型、文化脈絡與收藏偏好認識，不必急著替自己套上答案。",
        homeArrivalsTitle: "本週新藏",
      }),
      JSON.stringify({
        preset: "archive",
        accent: "#b89048",
        surface: "#f4efe4",
        ink: "#171713",
      }),
      SEED_TIMESTAMP,
    )
    .run();

  await db.prepare(`INSERT OR IGNORE INTO site_pages (
    id, site_id, slug, title, data_json, status, seo_title, seo_description,
    canonical_url, og_image_url, noindex, version, published_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, 'published', ?, ?, '', '', ?, 1, ?, ?, ?)`)
    .bind(
      DEFAULT_BRAND_PAGE.id,
      DEFAULT_SITE_ID,
      DEFAULT_BRAND_PAGE.slug,
      DEFAULT_BRAND_PAGE.title,
      JSON.stringify(DEFAULT_BRAND_PAGE.data),
      DEFAULT_BRAND_PAGE.seoTitle,
      DEFAULT_BRAND_PAGE.seoDescription,
      DEFAULT_BRAND_PAGE.noindex ? 1 : 0,
      SEED_TIMESTAMP,
      SEED_TIMESTAMP,
      SEED_TIMESTAMP,
    )
    .run();

  await db.batch(fallbackArticles.map((article) => db.prepare(`INSERT OR IGNORE INTO articles (
    id, site_id, slug, title, excerpt, content_json, status, seo_title,
    seo_description, canonical_url, og_image_url, tag, keywords_json,
    hero_image_url, hero_image_alt, noindex, version, published_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, '', '', ?, 1, ?, ?, ?)`)
    .bind(
      article.id,
      DEFAULT_SITE_ID,
      article.slug,
      article.title,
      article.excerpt,
      JSON.stringify(article.contentJson),
      article.seoTitle,
      article.seoDescription,
      article.canonicalUrl,
      article.ogImageUrl,
      article.tag,
      JSON.stringify(article.keywords),
      article.noindex ? 1 : 0,
      article.publishedAt || "2026-08-04T00:00:00.000Z",
      article.publishedAt || SEED_TIMESTAMP,
      article.updatedAt || SEED_TIMESTAMP,
    )));

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
    seo_title, seo_description, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
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
      product.updatedAt || SEED_TIMESTAMP,
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
  await upgradeLegacySchema(db);
  await seedCatalog(db);
  await db.prepare("PRAGMA optimize").run();
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
