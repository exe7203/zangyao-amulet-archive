import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const schemaMetadata = sqliteTable("schema_metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sites = sqliteTable("sites", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  locale: text("locale").notNull().default("zh-Hant-TW"),
  currency: text("currency").notNull().default("TWD"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["active", "disabled", "deleted"] }).notNull().default("active"),
    preferredLocale: text("preferred_locale").notNull().default("zh-Hant-TW"),
    lastSignedInAt: text("last_signed_in_at"),
    deletionRequestedAt: text("deletion_requested_at"),
    purgeAfter: text("purge_after"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("members_site_status_updated_idx").on(table.siteId, table.status, table.updatedAt),
    index("members_purge_after_idx")
      .on(table.purgeAfter)
      .where(sql`${table.purgeAfter} IS NOT NULL`),
  ],
);

// Every *_hash identity, credential, request, and provider reference below is
// a server-keyed HMAC, never a raw value or an unsalted digest. Payload fields
// marked encrypted are opaque authenticated ciphertext with a key version.
export const memberIdentities = sqliteTable(
  "member_identities",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["email_otp", "phone_otp", "line", "google", "apple"] }).notNull(),
    providerSubjectHash: text("provider_subject_hash").notNull(),
    emailHash: text("email_hash"),
    phoneHash: text("phone_hash"),
    verifiedAt: text("verified_at"),
    lastUsedAt: text("last_used_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
    purgeAfter: text("purge_after"),
  },
  (table) => [
    uniqueIndex("member_identities_site_provider_subject_unique")
      .on(table.siteId, table.provider, table.providerSubjectHash),
    index("member_identities_member_idx").on(table.memberId, table.deletedAt),
    index("member_identities_email_hash_idx")
      .on(table.siteId, table.emailHash)
      .where(sql`${table.emailHash} IS NOT NULL AND ${table.deletedAt} IS NULL`),
    index("member_identities_phone_hash_idx")
      .on(table.siteId, table.phoneHash)
      .where(sql`${table.phoneHash} IS NOT NULL AND ${table.deletedAt} IS NULL`),
    index("member_identities_purge_after_idx")
      .on(table.purgeAfter)
      .where(sql`${table.purgeAfter} IS NOT NULL`),
  ],
);

export const memberAuthChallenges = sqliteTable(
  "member_auth_challenges",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    provider: text("provider", {
      enum: ["email_otp", "phone_otp", "line_oauth", "google_oauth", "apple_oauth"],
    }).notNull(),
    purpose: text("purpose", { enum: ["sign_in", "link_identity", "account_recovery"] }).notNull(),
    destinationHash: text("destination_hash"),
    challengeHash: text("challenge_hash"),
    oauthStateHash: text("oauth_state_hash"),
    pkceVerifierHash: text("pkce_verifier_hash"),
    nonceHash: text("nonce_hash"),
    requestedIpHash: text("requested_ip_hash").notNull().default(""),
    userAgentHash: text("user_agent_hash").notNull().default(""),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    purgeAfter: text("purge_after").notNull(),
  },
  (table) => [
    uniqueIndex("member_auth_challenges_hash_unique")
      .on(table.challengeHash)
      .where(sql`${table.challengeHash} IS NOT NULL`),
    uniqueIndex("member_auth_challenges_oauth_state_unique")
      .on(table.oauthStateHash)
      .where(sql`${table.oauthStateHash} IS NOT NULL`),
    index("member_auth_challenges_destination_idx")
      .on(table.siteId, table.provider, table.destinationHash, table.createdAt)
      .where(sql`${table.destinationHash} IS NOT NULL`),
    index("member_auth_challenges_expiry_idx").on(table.expiresAt, table.consumedAt),
    index("member_auth_challenges_purge_after_idx").on(table.purgeAfter),
    check("member_auth_challenges_attempts_valid", sql`${table.attemptCount} >= 0 AND ${table.attemptCount} <= ${table.maxAttempts}`),
    check("member_auth_challenges_max_attempts_positive", sql`${table.maxAttempts} > 0`),
    check(
      "member_auth_challenges_secret_shape_valid",
      sql`(${table.provider} IN ('email_otp', 'phone_otp') AND ${table.destinationHash} IS NOT NULL AND ${table.challengeHash} IS NOT NULL)
        OR (${table.provider} IN ('line_oauth', 'google_oauth', 'apple_oauth') AND ${table.oauthStateHash} IS NOT NULL AND ${table.pkceVerifierHash} IS NOT NULL)`,
    ),
  ],
);

export const memberConsents = sqliteTable(
  "member_consents",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    scope: text("scope", { enum: ["terms", "privacy", "marketing"] }).notNull(),
    policyVersion: text("policy_version").notNull(),
    decision: text("decision", { enum: ["granted", "revoked"] }).notNull(),
    source: text("source", { enum: ["signup", "checkout", "account", "admin", "import"] }).notNull(),
    eventKeyHash: text("event_key_hash").notNull(),
    evidenceHash: text("evidence_hash").notNull().default(""),
    ipPrefixHash: text("ip_prefix_hash").notNull().default(""),
    userAgentHash: text("user_agent_hash").notNull().default(""),
    recordedAt: text("recorded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    purgeAfter: text("purge_after").notNull(),
  },
  (table) => [
    uniqueIndex("member_consents_event_key_hash_unique").on(table.eventKeyHash),
    index("member_consents_site_member_scope_idx")
      .on(table.siteId, table.memberId, table.scope, table.recordedAt),
    index("member_consents_purge_after_idx").on(table.purgeAfter),
  ],
);

export const memberSessions = sqliteTable(
  "member_sessions",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    sessionTokenHash: text("session_token_hash").notNull(),
    csrfSecretHash: text("csrf_secret_hash").notNull(),
    userAgentHash: text("user_agent_hash").notNull().default(""),
    ipPrefixHash: text("ip_prefix_hash").notNull().default(""),
    expiresAt: text("expires_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    rotatedAt: text("rotated_at"),
    revokedAt: text("revoked_at"),
    purgeAfter: text("purge_after").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("member_sessions_token_hash_unique").on(table.sessionTokenHash),
    index("member_sessions_member_active_idx").on(table.memberId, table.revokedAt, table.expiresAt),
    index("member_sessions_expiry_idx").on(table.expiresAt, table.revokedAt),
    index("member_sessions_purge_after_idx").on(table.purgeAfter),
  ],
);

export const memberAddresses = sqliteTable(
  "member_addresses",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    labelCode: text("label_code", { enum: ["home", "work", "other"] }).notNull().default("other"),
    addressFingerprintHash: text("address_fingerprint_hash").notNull(),
    encryptedPayload: text("encrypted_payload").notNull(),
    encryptionKeyVersion: text("encryption_key_version").notNull(),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
    purgeAfter: text("purge_after"),
  },
  (table) => [
    uniqueIndex("member_addresses_member_fingerprint_unique")
      .on(table.memberId, table.addressFingerprintHash),
    index("member_addresses_member_active_idx").on(table.memberId, table.deletedAt, table.isDefault),
    index("member_addresses_purge_after_idx")
      .on(table.purgeAfter)
      .where(sql`${table.purgeAfter} IS NOT NULL`),
  ],
);

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

export const siteSettingsRevisions = sqliteTable(
  "site_settings_revisions",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    settingsJson: text("settings_json").notNull(),
    themeJson: text("theme_json").notNull(),
    version: integer("version").notNull(),
    savedBy: text("saved_by").notNull().default("system"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("site_settings_revisions_site_version_unique").on(table.siteId, table.version),
    index("site_settings_revisions_site_created_idx").on(table.siteId, table.createdAt),
  ],
);

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
  (table) => [
    uniqueIndex("site_page_revisions_page_version_unique").on(table.pageId, table.version),
    index("site_page_revisions_page_created_idx").on(table.pageId, table.createdAt),
  ],
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
    memberId: text("member_id").references(() => members.id, { onDelete: "set null" }),
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
    shippingFee: integer("shipping_fee"),
    carrier: text("carrier").notNull().default(""),
    trackingNumber: text("tracking_number").notNull().default(""),
    internalNote: text("internal_note").notNull().default(""),
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
    index("orders_site_member_created_idx")
      .on(table.siteId, table.memberId, table.createdAt)
      .where(sql`${table.memberId} IS NOT NULL`),
    index("orders_site_status_idx").on(table.siteId, table.orderStatus, table.paymentStatus),
    index("orders_reservation_expiry_idx")
      .on(table.orderStatus, table.paymentStatus, table.reservedUntil)
      .where(sql`${table.reservedUntil} IS NOT NULL`),
    check("orders_shipping_fee_nonnegative", sql`${table.shippingFee} IS NULL OR ${table.shippingFee} >= 0`),
  ],
);

// New production order flows should use this encrypted snapshot. The raw
// customer columns on orders are retained only for additive v9/local-runtime
// compatibility and require a controlled backfill before live PII is accepted.
export const orderCustomerSnapshots = sqliteTable(
  "order_customer_snapshots",
  {
    orderId: text("order_id")
      .primaryKey()
      .references(() => orders.id, { onDelete: "cascade" }),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    emailHash: text("email_hash"),
    phoneHash: text("phone_hash").notNull(),
    encryptedPayload: text("encrypted_payload").notNull(),
    encryptionKeyVersion: text("encryption_key_version").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    purgeAfter: text("purge_after").notNull(),
  },
  (table) => [
    index("order_customer_snapshots_site_phone_idx").on(table.siteId, table.phoneHash),
    index("order_customer_snapshots_site_email_idx")
      .on(table.siteId, table.emailHash)
      .where(sql`${table.emailHash} IS NOT NULL`),
    index("order_customer_snapshots_purge_after_idx").on(table.purgeAfter),
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

export const carts = sqliteTable(
  "carts",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    memberId: text("member_id").references(() => members.id, { onDelete: "set null" }),
    ownerKeyHash: text("owner_key_hash").notNull(),
    status: text("status", { enum: ["active", "converted", "abandoned", "expired"] }).notNull().default("active"),
    currency: text("currency").notNull().default("TWD"),
    convertedOrderId: text("converted_order_id").references(() => orders.id, { onDelete: "set null" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("carts_site_active_owner_unique")
      .on(table.siteId, table.ownerKeyHash)
      .where(sql`${table.status} = 'active'`),
    index("carts_member_status_updated_idx").on(table.memberId, table.status, table.updatedAt),
    index("carts_expiry_idx").on(table.status, table.expiresAt),
    uniqueIndex("carts_converted_order_unique")
      .on(table.convertedOrderId)
      .where(sql`${table.convertedOrderId} IS NOT NULL`),
  ],
);

export const cartItems = sqliteTable(
  "cart_items",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    cartId: text("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unitPriceSnapshot: integer("unit_price_snapshot").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("cart_items_cart_product_unique").on(table.cartId, table.productId),
    index("cart_items_site_cart_idx").on(table.siteId, table.cartId),
    index("cart_items_product_idx").on(table.productId),
    check("cart_items_quantity_positive", sql`${table.quantity} > 0`),
    check("cart_items_price_nonnegative", sql`${table.unitPriceSnapshot} >= 0`),
  ],
);

export const mediaAssets = sqliteTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    altText: text("alt_text").notNull().default(""),
    purpose: text("purpose", { enum: ["product", "article", "site", "shipping_label"] }).notNull(),
    status: text("status", { enum: ["pending", "ready", "quarantined", "deleted"] }).notNull().default("pending"),
    uploadedBySubjectHash: text("uploaded_by_subject_hash").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    readyAt: text("ready_at"),
    deletedAt: text("deleted_at"),
    purgeAfter: text("purge_after"),
  },
  (table) => [
    uniqueIndex("media_assets_site_storage_key_unique").on(table.siteId, table.storageKey),
    index("media_assets_site_status_created_idx").on(table.siteId, table.status, table.createdAt),
    index("media_assets_checksum_idx").on(table.siteId, table.checksumSha256),
    index("media_assets_purge_after_idx")
      .on(table.purgeAfter)
      .where(sql`${table.purgeAfter} IS NOT NULL`),
    check("media_assets_byte_size_nonnegative", sql`${table.byteSize} >= 0`),
    check("media_assets_width_valid", sql`${table.width} IS NULL OR ${table.width} > 0`),
    check("media_assets_height_valid", sql`${table.height} IS NULL OR ${table.height} > 0`),
  ],
);

export const productMedia = sqliteTable(
  "product_media",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    mediaAssetId: text("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" }),
    role: text("role", { enum: ["primary", "gallery"] }).notNull().default("gallery"),
    sortOrder: integer("sort_order").notNull().default(0),
    altTextOverride: text("alt_text_override").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("product_media_product_asset_unique").on(table.productId, table.mediaAssetId),
    index("product_media_site_product_sort_idx").on(table.siteId, table.productId, table.sortOrder),
    index("product_media_product_sort_idx").on(table.productId, table.sortOrder),
    index("product_media_asset_idx").on(table.mediaAssetId),
  ],
);

export const paymentTransactions = sqliteTable(
  "payment_transactions",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerTransactionHash: text("provider_transaction_hash").notNull(),
    relatedTransactionHash: text("related_transaction_hash"),
    idempotencyKeyHash: text("idempotency_key_hash").notNull(),
    transactionType: text("transaction_type", { enum: ["authorization", "capture", "void", "refund"] }).notNull(),
    status: text("status", { enum: ["pending", "succeeded", "failed", "cancelled"] }).notNull().default("pending"),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("TWD"),
    failureCode: text("failure_code").notNull().default(""),
    providerResponseHash: text("provider_response_hash").notNull().default(""),
    processedAt: text("processed_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("payment_transactions_provider_reference_unique")
      .on(table.provider, table.providerTransactionHash),
    uniqueIndex("payment_transactions_idempotency_hash_unique")
      .on(table.siteId, table.idempotencyKeyHash),
    index("payment_transactions_order_created_idx").on(table.orderId, table.createdAt),
    index("payment_transactions_related_hash_idx")
      .on(table.provider, table.relatedTransactionHash)
      .where(sql`${table.relatedTransactionHash} IS NOT NULL`),
    index("payment_transactions_site_status_updated_idx").on(table.siteId, table.status, table.updatedAt),
    check("payment_transactions_amount_positive", sql`${table.amount} > 0`),
  ],
);

export const paymentEvents = sqliteTable(
  "payment_events",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => paymentTransactions.id, { onDelete: "cascade" }),
    providerEventHash: text("provider_event_hash").notNull(),
    eventType: text("event_type").notNull(),
    payloadHash: text("payload_hash").notNull(),
    eventStatus: text("event_status").notNull().default("received"),
    occurredAt: text("occurred_at"),
    receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    processedAt: text("processed_at"),
  },
  (table) => [
    uniqueIndex("payment_events_site_provider_event_unique").on(table.siteId, table.providerEventHash),
    index("payment_events_transaction_received_idx").on(table.transactionId, table.receivedAt),
  ],
);

export const shipments = sqliteTable(
  "shipments",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    carrierCode: text("carrier_code").notNull(),
    trackingNumberHash: text("tracking_number_hash"),
    trackingPayloadEncrypted: text("tracking_payload_encrypted").notNull().default(""),
    encryptionKeyVersion: text("encryption_key_version").notNull().default(""),
    status: text("status", { enum: ["pending", "label_created", "shipped", "delivered", "failed", "cancelled"] }).notNull().default("pending"),
    shippingLabelAssetId: text("shipping_label_asset_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    shippedAt: text("shipped_at"),
    deliveredAt: text("delivered_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("shipments_order_created_idx").on(table.orderId, table.createdAt),
    index("shipments_site_status_updated_idx").on(table.siteId, table.status, table.updatedAt),
    uniqueIndex("shipments_carrier_tracking_hash_unique")
      .on(table.carrierCode, table.trackingNumberHash)
      .where(sql`${table.trackingNumberHash} IS NOT NULL`),
  ],
);

export const shipmentEvents = sqliteTable(
  "shipment_events",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    shipmentId: text("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    providerEventHash: text("provider_event_hash").notNull(),
    eventType: text("event_type").notNull(),
    payloadHash: text("payload_hash").notNull(),
    occurredAt: text("occurred_at"),
    receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("shipment_events_site_provider_event_unique").on(table.siteId, table.providerEventHash),
    index("shipment_events_shipment_received_idx").on(table.shipmentId, table.receivedAt),
  ],
);

export const adminAuditLog = sqliteTable(
  "admin_audit_log",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    actorSubjectHash: text("actor_subject_hash").notNull(),
    actorProvider: text("actor_provider").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull().default(""),
    requestIdHash: text("request_id_hash").notNull().default(""),
    ipPrefixHash: text("ip_prefix_hash").notNull().default(""),
    userAgentHash: text("user_agent_hash").notNull().default(""),
    beforeHash: text("before_hash").notNull().default(""),
    afterHash: text("after_hash").notNull().default(""),
    outcome: text("outcome", { enum: ["succeeded", "denied", "failed"] }).notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    purgeAfter: text("purge_after").notNull(),
  },
  (table) => [
    index("admin_audit_log_site_created_idx").on(table.siteId, table.createdAt),
    index("admin_audit_log_entity_created_idx").on(table.entityType, table.entityId, table.createdAt),
    index("admin_audit_log_actor_created_idx").on(table.actorSubjectHash, table.createdAt),
    index("admin_audit_log_purge_after_idx").on(table.purgeAfter),
  ],
);

export const webhookEvents = sqliteTable(
  "webhook_events",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerEventHash: text("provider_event_hash").notNull(),
    eventType: text("event_type").notNull(),
    payloadHash: text("payload_hash").notNull(),
    signatureValid: integer("signature_valid", { mode: "boolean" }).notNull(),
    status: text("status", { enum: ["received", "processing", "processed", "failed", "discarded"] }).notNull().default("received"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastErrorCode: text("last_error_code").notNull().default(""),
    nextAttemptAt: text("next_attempt_at"),
    receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    processedAt: text("processed_at"),
    purgeAfter: text("purge_after").notNull(),
  },
  (table) => [
    uniqueIndex("webhook_events_site_provider_event_unique")
      .on(table.siteId, table.provider, table.providerEventHash),
    index("webhook_events_retry_idx").on(table.status, table.nextAttemptAt),
    index("webhook_events_purge_after_idx").on(table.purgeAfter),
    check("webhook_events_attempt_count_nonnegative", sql`${table.attemptCount} >= 0`),
  ],
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

export const articleRevisions = sqliteTable(
  "article_revisions",
  {
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
  },
  (table) => [
    uniqueIndex("article_revisions_article_version_unique").on(table.articleId, table.version),
    index("article_revisions_article_idx").on(table.articleId, table.createdAt),
  ],
);
