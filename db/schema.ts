import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const sites = sqliteTable("sites", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  locale: text("locale").notNull().default("zh-Hant-TW"),
  currency: text("currency").notNull().default("TWD"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const siteSettings = sqliteTable("site_settings", {
  siteId: text("site_id")
    .primaryKey()
    .references(() => sites.id, { onDelete: "cascade" }),
  settingsJson: text("settings_json").notNull().default("{}"),
  themeJson: text("theme_json").notNull().default("{}"),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by").notNull().default("system"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sitePages = sqliteTable(
  "site_pages",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    dataJson: text("data_json").notNull(),
    status: text("status", { enum: ["draft", "published", "archived"] }).notNull().default("draft"),
    seoTitle: text("seo_title").notNull().default(""),
    seoDescription: text("seo_description").notNull().default(""),
    canonicalUrl: text("canonical_url").notNull().default(""),
    ogImageUrl: text("og_image_url").notNull().default(""),
    noindex: integer("noindex", { mode: "boolean" }).notNull().default(false),
    version: integer("version").notNull().default(1),
    publishedAt: text("published_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("site_pages_site_slug_unique").on(table.siteId, table.slug),
    index("site_pages_site_status_updated_idx").on(table.siteId, table.status, table.updatedAt),
  ],
);

export const sitePageRevisions = sqliteTable(
  "site_page_revisions",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id")
      .notNull()
      .references(() => sitePages.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    dataJson: text("data_json").notNull(),
    status: text("status").notNull(),
    seoTitle: text("seo_title").notNull().default(""),
    seoDescription: text("seo_description").notNull().default(""),
    canonicalUrl: text("canonical_url").notNull().default(""),
    ogImageUrl: text("og_image_url").notNull().default(""),
    noindex: integer("noindex", { mode: "boolean" }).notNull().default(false),
    version: integer("version").notNull(),
    savedBy: text("saved_by").notNull().default("local-preview"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("site_page_revisions_page_created_idx").on(table.pageId, table.createdAt)],
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("categories_site_slug_unique").on(table.siteId, table.slug),
    uniqueIndex("categories_site_name_unique").on(table.siteId, table.name),
    index("categories_site_status_idx").on(table.siteId, table.status, table.sortOrder),
  ],
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    sku: text("sku").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    description: text("description").notNull().default(""),
    origin: text("origin").notNull().default(""),
    temple: text("temple").notNull().default(""),
    buddhistYear: text("buddhist_year").notNull().default(""),
    westernYear: text("western_year").notNull().default(""),
    material: text("material").notNull().default(""),
    dimensions: text("dimensions").notNull().default(""),
    price: integer("price").notNull(),
    badge: text("badge").notNull().default(""),
    tone: text("tone").notNull().default("sand"),
    shape: text("shape", { enum: ["arch", "oval", "round", "statue"] }).notNull(),
    theme: text("theme").notNull().default(""),
    purchaseLimit: integer("purchase_limit").notNull().default(1),
    stock: integer("stock").notNull().default(0),
    status: text("status", { enum: ["draft", "active", "sold_out", "archived"] }).notNull().default("draft"),
    seoTitle: text("seo_title").notNull().default(""),
    seoDescription: text("seo_description").notNull().default(""),
    imageUrl: text("image_url").notNull().default(""),
    imageAlt: text("image_alt").notNull().default(""),
    seoReady: integer("seo_ready", { mode: "boolean" }).notNull().default(false),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("products_site_slug_unique").on(table.siteId, table.slug),
    uniqueIndex("products_site_sku_unique").on(table.siteId, table.sku),
    index("products_site_status_stock_idx").on(table.siteId, table.status, table.stock),
    index("products_category_idx").on(table.categoryId),
  ],
);

export const inventory = sqliteTable(
  "inventory",
  {
    productId: text("product_id")
      .primaryKey()
      .references(() => products.id, { onDelete: "cascade" }),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    onHand: integer("on_hand").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    version: integer("version").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("inventory_site_product_unique").on(table.siteId, table.productId),
    index("inventory_site_available_idx").on(table.siteId, table.onHand, table.reserved),
    check("inventory_on_hand_nonnegative", sql`${table.onHand} >= 0`),
    check("inventory_reserved_valid", sql`${table.reserved} >= 0 AND ${table.reserved} <= ${table.onHand}`),
  ],
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    orderNumber: text("order_number").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull().default(""),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerEmail: text("customer_email").notNull().default(""),
    customerLineId: text("customer_line_id").notNull().default(""),
    deliveryMethod: text("delivery_method", {
      enum: ["home_delivery", "convenience_store", "appointment"],
    }).notNull(),
    address: text("address").notNull().default(""),
    note: text("note").notNull().default(""),
    subtotal: integer("subtotal").notNull(),
    currency: text("currency").notNull().default("TWD"),
    paymentStatus: text("payment_status", {
      enum: ["uncollected", "pending", "paid", "failed", "refunded"],
    }).notNull().default("uncollected"),
    orderStatus: text("order_status", {
      enum: ["new", "confirmed", "processing", "shipped", "completed", "cancelled"],
    }).notNull().default("new"),
    reservedUntil: text("reserved_until"),
    expiredAt: text("expired_at"),
    consentVersion: text("consent_version").notNull().default("local-reservation-v1"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("orders_site_number_unique").on(table.siteId, table.orderNumber),
    uniqueIndex("orders_site_idempotency_unique").on(table.siteId, table.idempotencyKey),
    index("orders_site_created_idx").on(table.siteId, table.createdAt),
    index("orders_site_status_idx").on(table.siteId, table.orderStatus, table.paymentStatus),
    index("orders_reservation_expiry_idx")
      .on(table.orderStatus, table.paymentStatus, table.reservedUntil)
      .where(sql`${table.reservedUntil} IS NOT NULL`),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    productSku: text("product_sku").notNull(),
    productName: text("product_name").notNull(),
    unitPrice: integer("unit_price").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotal: integer("line_total").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("order_items_order_product_unique").on(table.orderId, table.productId),
    index("order_items_order_idx").on(table.orderId),
    index("order_items_product_idx").on(table.productId),
  ],
);

export const inventoryMovements = sqliteTable(
  "inventory_movements",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    orderId: text("order_id").references(() => orders.id, { onDelete: "set null" }),
    movementType: text("movement_type", {
      enum: ["seed", "adjustment", "reservation", "release", "sale", "return"],
    }).notNull(),
    quantity: integer("quantity").notNull(),
    onHandAfter: integer("on_hand_after").notNull(),
    reservedAfter: integer("reserved_after").notNull(),
    reason: text("reason").notNull().default(""),
    actor: text("actor").notNull().default("system"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("inventory_movements_order_product_type_unique")
      .on(table.orderId, table.productId, table.movementType),
    index("inventory_movements_product_created_idx").on(table.productId, table.createdAt),
    index("inventory_movements_order_idx").on(table.orderId),
  ],
);

export const orderEvents = sqliteTable(
  "order_events",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    fromValue: text("from_value").notNull().default(""),
    toValue: text("to_value").notNull().default(""),
    note: text("note").notNull().default(""),
    actor: text("actor").notNull().default("system"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("order_events_order_created_idx").on(table.orderId, table.createdAt)],
);

export const articles = sqliteTable(
  "articles",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    contentJson: text("content_json").notNull(),
    status: text("status", { enum: ["draft", "published", "archived"] })
      .notNull()
      .default("draft"),
    seoTitle: text("seo_title").notNull().default(""),
    seoDescription: text("seo_description").notNull().default(""),
    canonicalUrl: text("canonical_url").notNull().default(""),
    ogImageUrl: text("og_image_url").notNull().default(""),
    tag: text("tag").notNull().default("收藏誌"),
    keywordsJson: text("keywords_json").notNull().default("[]"),
    heroImageUrl: text("hero_image_url").notNull().default(""),
    heroImageAlt: text("hero_image_alt").notNull().default(""),
    noindex: integer("noindex", { mode: "boolean" }).notNull().default(false),
    version: integer("version").notNull().default(1),
    publishedAt: text("published_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("articles_site_slug_unique").on(table.siteId, table.slug),
    index("articles_site_status_updated_idx").on(table.siteId, table.status, table.updatedAt),
  ],
);

export const articleRevisions = sqliteTable("article_revisions", {
  id: text("id").primaryKey(),
  articleId: text("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().default(""),
  title: text("title").notNull(),
  excerpt: text("excerpt").notNull().default(""),
  contentJson: text("content_json").notNull(),
  seoTitle: text("seo_title").notNull().default(""),
  seoDescription: text("seo_description").notNull().default(""),
  canonicalUrl: text("canonical_url").notNull().default(""),
  ogImageUrl: text("og_image_url").notNull().default(""),
  tag: text("tag").notNull().default("收藏誌"),
  keywordsJson: text("keywords_json").notNull().default("[]"),
  heroImageUrl: text("hero_image_url").notNull().default(""),
  heroImageAlt: text("hero_image_alt").notNull().default(""),
  noindex: integer("noindex", { mode: "boolean" }).notNull().default(false),
  version: integer("version").notNull().default(1),
  status: text("status").notNull(),
  savedBy: text("saved_by").notNull().default("local-preview"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
