import { fallbackArticles } from "../app/article-data";
import { catalogCategories, products } from "../shared/catalog";
import { DEFAULT_BRAND_PAGE } from "../shared/default-page";
import type { DatabaseEnv } from "./api-utils";

export const DEFAULT_SITE_CODE = "taijuda";
export const DEFAULT_SITE_ID = "site_taijuda";
const SEED_TIMESTAMP = "2026-08-04T00:00:00.000Z";
// Production deploys must apply the checked-in Drizzle migrations before
// traffic is switched. This idempotent bootstrap remains for local installs
// and legacy compatibility; a migrated database short-circuits by version.
export const CURRENT_SCHEMA_VERSION = 11;

export type { DatabaseEnv };

// A Worker isolate has one D1 binding. Some local/runtime adapters create a new
// JavaScript wrapper for that binding on every request, so keying readiness by
// object identity would rerun every CREATE/seed statement repeatedly.
let readiness: Promise<void> | null = null;

const TENANT_RELATION_GUARDS = [
  {
    table: "products",
    invalidWhen: "NOT EXISTS (SELECT 1 FROM categories p WHERE p.id = NEW.category_id AND p.site_id = NEW.site_id)",
  },
  {
    table: "inventory",
    invalidWhen: "NOT EXISTS (SELECT 1 FROM products p WHERE p.id = NEW.product_id AND p.site_id = NEW.site_id)",
  },
  {
    table: "orders",
    invalidWhen: "NEW.member_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM members p WHERE p.id = NEW.member_id AND p.site_id = NEW.site_id)",
  },
  {
    table: "order_items",
    invalidWhen: "NOT EXISTS (SELECT 1 FROM orders o JOIN products p ON p.id = NEW.product_id AND p.site_id = o.site_id WHERE o.id = NEW.order_id)",
  },
  {
    table: "inventory_movements",
    invalidWhen: "NOT EXISTS (SELECT 1 FROM products p WHERE p.id = NEW.product_id AND p.site_id = NEW.site_id) OR (NEW.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = NEW.order_id AND o.site_id = NEW.site_id))",
  },
  {
    table: "order_events",
    invalidWhen: "NOT EXISTS (SELECT 1 FROM orders p WHERE p.id = NEW.order_id AND p.site_id = NEW.site_id)",
  },
  ...["member_identities", "member_sessions", "member_addresses", "member_consents"].map((table) => ({
    table,
    invalidWhen: "NOT EXISTS (SELECT 1 FROM members p WHERE p.id = NEW.member_id AND p.site_id = NEW.site_id)",
  })),
  {
    table: "carts",
    invalidWhen: "(NEW.member_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM members m WHERE m.id = NEW.member_id AND m.site_id = NEW.site_id)) OR (NEW.converted_order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = NEW.converted_order_id AND o.site_id = NEW.site_id))",
  },
  {
    table: "cart_items",
    invalidWhen: "NOT EXISTS (SELECT 1 FROM carts c WHERE c.id = NEW.cart_id AND c.site_id = NEW.site_id) OR NOT EXISTS (SELECT 1 FROM products p WHERE p.id = NEW.product_id AND p.site_id = NEW.site_id)",
  },
  {
    table: "order_customer_snapshots",
    invalidWhen: "NOT EXISTS (SELECT 1 FROM orders p WHERE p.id = NEW.order_id AND p.site_id = NEW.site_id)",
  },
  {
    table: "product_media",
    invalidWhen: "NOT EXISTS (SELECT 1 FROM products p WHERE p.id = NEW.product_id AND p.site_id = NEW.site_id) OR NOT EXISTS (SELECT 1 FROM media_assets m WHERE m.id = NEW.media_asset_id AND m.site_id = NEW.site_id)",
  },
  {
    table: "payment_transactions",
    invalidWhen: "NOT EXISTS (SELECT 1 FROM orders p WHERE p.id = NEW.order_id AND p.site_id = NEW.site_id)",
  },
  {
    table: "payment_events",
    invalidWhen: "NOT EXISTS (SELECT 1 FROM payment_transactions p WHERE p.id = NEW.transaction_id AND p.site_id = NEW.site_id)",
  },
  {
    table: "shipments",
    invalidWhen: "NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = NEW.order_id AND o.site_id = NEW.site_id) OR (NEW.shipping_label_asset_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM media_assets m WHERE m.id = NEW.shipping_label_asset_id AND m.site_id = NEW.site_id))",
  },
  {
    table: "shipment_events",
    invalidWhen: "NOT EXISTS (SELECT 1 FROM shipments p WHERE p.id = NEW.shipment_id AND p.site_id = NEW.site_id)",
  },
] as const;

const TENANT_SITE_IMMUTABLE_TABLES = [
  "categories",
  "products",
  "members",
  "orders",
  "carts",
  "media_assets",
  "payment_transactions",
  "shipments",
] as const;

export const TENANT_INTEGRITY_TRIGGER_NAMES = Object.freeze([
  ...TENANT_RELATION_GUARDS.flatMap(({ table }) => [
    `tenant_guard_${table}_insert`,
    `tenant_guard_${table}_update`,
  ]),
  ...TENANT_SITE_IMMUTABLE_TABLES.map((table) => `tenant_guard_${table}_site_immutable`),
]);

function tenantIntegrityStatements(db: D1Database) {
  const relationTriggers = TENANT_RELATION_GUARDS.flatMap(({ table, invalidWhen }) => [
    db.prepare(`CREATE TRIGGER IF NOT EXISTS tenant_guard_${table}_insert
      BEFORE INSERT ON ${table}
      FOR EACH ROW WHEN (${invalidWhen})
      BEGIN
        SELECT RAISE(ABORT, 'tenant integrity violation: ${table}');
      END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS tenant_guard_${table}_update
      BEFORE UPDATE ON ${table}
      FOR EACH ROW WHEN (${invalidWhen})
      BEGIN
        SELECT RAISE(ABORT, 'tenant integrity violation: ${table}');
      END`),
  ]);
  const immutableSiteTriggers = TENANT_SITE_IMMUTABLE_TABLES.map((table) => db.prepare(
    `CREATE TRIGGER IF NOT EXISTS tenant_guard_${table}_site_immutable
      BEFORE UPDATE OF site_id ON ${table}
      FOR EACH ROW WHEN NEW.site_id <> OLD.site_id
      BEGIN
        SELECT RAISE(ABORT, 'tenant site is immutable: ${table}');
      END`,
  ));
  return [...relationTriggers, ...immutableSiteTriggers];
}

async function ensureTenantIntegrityTriggers(db: D1Database) {
  const result = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'tenant_guard_%'",
  ).all<{ name: string }>();
  const installed = new Set(result.results.map(({ name }) => name));
  if (TENANT_INTEGRITY_TRIGGER_NAMES.every((name) => installed.has(name))) return;
  await db.batch(tenantIntegrityStatements(db));
}

function productionSchemaStatements(db: D1Database) {
  return [
    db.prepare(`CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active',
      preferred_locale TEXT NOT NULL DEFAULT 'zh-Hant-TW',
      last_signed_in_at TEXT,
      deletion_requested_at TEXT,
      purge_after TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS member_identities (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_subject_hash TEXT NOT NULL,
      email_hash TEXT,
      phone_hash TEXT,
      verified_at TEXT,
      last_used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      purge_after TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS member_auth_challenges (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      purpose TEXT NOT NULL,
      destination_hash TEXT,
      challenge_hash TEXT,
      oauth_state_hash TEXT,
      pkce_verifier_hash TEXT,
      nonce_hash TEXT,
      requested_ip_hash TEXT NOT NULL DEFAULT '',
      user_agent_hash TEXT NOT NULL DEFAULT '',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      purge_after TEXT NOT NULL,
      CHECK (attempt_count >= 0 AND attempt_count <= max_attempts),
      CHECK (max_attempts > 0),
      CHECK (
        (provider IN ('email_otp', 'phone_otp') AND destination_hash IS NOT NULL AND challenge_hash IS NOT NULL)
        OR (provider IN ('line_oauth', 'google_oauth', 'apple_oauth') AND oauth_state_hash IS NOT NULL AND pkce_verifier_hash IS NOT NULL)
      )
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS member_consents (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
      member_id TEXT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
      scope TEXT NOT NULL,
      policy_version TEXT NOT NULL,
      decision TEXT NOT NULL,
      source TEXT NOT NULL,
      event_key_hash TEXT NOT NULL,
      evidence_hash TEXT NOT NULL DEFAULT '',
      ip_prefix_hash TEXT NOT NULL DEFAULT '',
      user_agent_hash TEXT NOT NULL DEFAULT '',
      recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      purge_after TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS member_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      session_token_hash TEXT NOT NULL,
      csrf_secret_hash TEXT NOT NULL,
      user_agent_hash TEXT NOT NULL DEFAULT '',
      ip_prefix_hash TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      rotated_at TEXT,
      revoked_at TEXT,
      purge_after TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS member_addresses (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      label_code TEXT NOT NULL DEFAULT 'other',
      address_fingerprint_hash TEXT NOT NULL,
      encrypted_payload TEXT NOT NULL,
      encryption_key_version TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      purge_after TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS order_customer_snapshots (
      order_id TEXT PRIMARY KEY NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
      email_hash TEXT,
      phone_hash TEXT NOT NULL,
      encrypted_payload TEXT NOT NULL,
      encryption_key_version TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      purge_after TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS carts (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
      owner_key_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      currency TEXT NOT NULL DEFAULT 'TWD',
      converted_order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS cart_items (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price_snapshot INTEGER NOT NULL CHECK (unit_price_snapshot >= 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      storage_key TEXT NOT NULL,
      checksum_sha256 TEXT NOT NULL,
      content_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
      width INTEGER CHECK (width IS NULL OR width > 0),
      height INTEGER CHECK (height IS NULL OR height > 0),
      alt_text TEXT NOT NULL DEFAULT '',
      purpose TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      uploaded_by_subject_hash TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ready_at TEXT,
      deleted_at TEXT,
      purge_after TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS product_media (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      media_asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
      role TEXT NOT NULL DEFAULT 'gallery',
      sort_order INTEGER NOT NULL DEFAULT 0,
      alt_text_override TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS payment_transactions (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
      provider TEXT NOT NULL,
      provider_transaction_hash TEXT NOT NULL,
      related_transaction_hash TEXT,
      idempotency_key_hash TEXT NOT NULL,
      transaction_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      amount INTEGER NOT NULL CHECK (amount > 0),
      currency TEXT NOT NULL DEFAULT 'TWD',
      failure_code TEXT NOT NULL DEFAULT '',
      provider_response_hash TEXT NOT NULL DEFAULT '',
      processed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS payment_events (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
      transaction_id TEXT NOT NULL REFERENCES payment_transactions(id) ON DELETE CASCADE,
      provider_event_hash TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      event_status TEXT NOT NULL DEFAULT 'received',
      occurred_at TEXT,
      received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS shipments (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
      carrier_code TEXT NOT NULL,
      tracking_number_hash TEXT,
      tracking_payload_encrypted TEXT NOT NULL DEFAULT '',
      encryption_key_version TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      shipping_label_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
      shipped_at TEXT,
      delivered_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS shipment_events (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
      shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      provider_event_hash TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      occurred_at TEXT,
      received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_log (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
      actor_subject_hash TEXT NOT NULL,
      actor_provider TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL DEFAULT '',
      request_id_hash TEXT NOT NULL DEFAULT '',
      ip_prefix_hash TEXT NOT NULL DEFAULT '',
      user_agent_hash TEXT NOT NULL DEFAULT '',
      before_hash TEXT NOT NULL DEFAULT '',
      after_hash TEXT NOT NULL DEFAULT '',
      outcome TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      purge_after TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
      provider TEXT NOT NULL,
      provider_event_hash TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      signature_valid INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'received',
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      last_error_code TEXT NOT NULL DEFAULT '',
      next_attempt_at TEXT,
      received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TEXT,
      purge_after TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS members_site_status_updated_idx ON members (site_id, status, updated_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS members_purge_after_idx ON members (purge_after) WHERE purge_after IS NOT NULL"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS member_identities_site_provider_subject_unique ON member_identities (site_id, provider, provider_subject_hash)"),
    db.prepare("CREATE INDEX IF NOT EXISTS member_identities_member_idx ON member_identities (member_id, deleted_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS member_identities_email_hash_idx ON member_identities (site_id, email_hash) WHERE email_hash IS NOT NULL AND deleted_at IS NULL"),
    db.prepare("CREATE INDEX IF NOT EXISTS member_identities_phone_hash_idx ON member_identities (site_id, phone_hash) WHERE phone_hash IS NOT NULL AND deleted_at IS NULL"),
    db.prepare("CREATE INDEX IF NOT EXISTS member_identities_purge_after_idx ON member_identities (purge_after) WHERE purge_after IS NOT NULL"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS member_auth_challenges_hash_unique ON member_auth_challenges (challenge_hash) WHERE challenge_hash IS NOT NULL"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS member_auth_challenges_oauth_state_unique ON member_auth_challenges (oauth_state_hash) WHERE oauth_state_hash IS NOT NULL"),
    db.prepare("CREATE INDEX IF NOT EXISTS member_auth_challenges_destination_idx ON member_auth_challenges (site_id, provider, destination_hash, created_at) WHERE destination_hash IS NOT NULL"),
    db.prepare("CREATE INDEX IF NOT EXISTS member_auth_challenges_expiry_idx ON member_auth_challenges (expires_at, consumed_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS member_auth_challenges_purge_after_idx ON member_auth_challenges (purge_after)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS member_consents_event_key_hash_unique ON member_consents (event_key_hash)"),
    db.prepare("CREATE INDEX IF NOT EXISTS member_consents_site_member_scope_idx ON member_consents (site_id, member_id, scope, recorded_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS member_consents_purge_after_idx ON member_consents (purge_after)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS member_sessions_token_hash_unique ON member_sessions (session_token_hash)"),
    db.prepare("CREATE INDEX IF NOT EXISTS member_sessions_member_active_idx ON member_sessions (member_id, revoked_at, expires_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS member_sessions_expiry_idx ON member_sessions (expires_at, revoked_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS member_sessions_purge_after_idx ON member_sessions (purge_after)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS member_addresses_member_fingerprint_unique ON member_addresses (member_id, address_fingerprint_hash)"),
    db.prepare("CREATE INDEX IF NOT EXISTS member_addresses_member_active_idx ON member_addresses (member_id, deleted_at, is_default)"),
    db.prepare("CREATE INDEX IF NOT EXISTS member_addresses_purge_after_idx ON member_addresses (purge_after) WHERE purge_after IS NOT NULL"),
    db.prepare("CREATE INDEX IF NOT EXISTS order_customer_snapshots_site_phone_idx ON order_customer_snapshots (site_id, phone_hash)"),
    db.prepare("CREATE INDEX IF NOT EXISTS order_customer_snapshots_site_email_idx ON order_customer_snapshots (site_id, email_hash) WHERE email_hash IS NOT NULL"),
    db.prepare("CREATE INDEX IF NOT EXISTS order_customer_snapshots_purge_after_idx ON order_customer_snapshots (purge_after)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS carts_site_active_owner_unique ON carts (site_id, owner_key_hash) WHERE status = 'active'"),
    db.prepare("CREATE INDEX IF NOT EXISTS carts_member_status_updated_idx ON carts (member_id, status, updated_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS carts_expiry_idx ON carts (status, expires_at)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS carts_converted_order_unique ON carts (converted_order_id) WHERE converted_order_id IS NOT NULL"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS cart_items_cart_product_unique ON cart_items (cart_id, product_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS cart_items_site_cart_idx ON cart_items (site_id, cart_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS cart_items_product_idx ON cart_items (product_id)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS media_assets_site_storage_key_unique ON media_assets (site_id, storage_key)"),
    db.prepare("CREATE INDEX IF NOT EXISTS media_assets_site_status_created_idx ON media_assets (site_id, status, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS media_assets_checksum_idx ON media_assets (site_id, checksum_sha256)"),
    db.prepare("CREATE INDEX IF NOT EXISTS media_assets_purge_after_idx ON media_assets (purge_after) WHERE purge_after IS NOT NULL"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS product_media_product_asset_unique ON product_media (product_id, media_asset_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS product_media_site_product_sort_idx ON product_media (site_id, product_id, sort_order)"),
    db.prepare("CREATE INDEX IF NOT EXISTS product_media_product_sort_idx ON product_media (product_id, sort_order)"),
    db.prepare("CREATE INDEX IF NOT EXISTS product_media_asset_idx ON product_media (media_asset_id)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_provider_reference_unique ON payment_transactions (provider, provider_transaction_hash)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_idempotency_hash_unique ON payment_transactions (site_id, idempotency_key_hash)"),
    db.prepare("CREATE INDEX IF NOT EXISTS payment_transactions_order_created_idx ON payment_transactions (order_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS payment_transactions_related_hash_idx ON payment_transactions (provider, related_transaction_hash) WHERE related_transaction_hash IS NOT NULL"),
    db.prepare("CREATE INDEX IF NOT EXISTS payment_transactions_site_status_updated_idx ON payment_transactions (site_id, status, updated_at)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS payment_events_site_provider_event_unique ON payment_events (site_id, provider_event_hash)"),
    db.prepare("CREATE INDEX IF NOT EXISTS payment_events_transaction_received_idx ON payment_events (transaction_id, received_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS shipments_order_created_idx ON shipments (order_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS shipments_site_status_updated_idx ON shipments (site_id, status, updated_at)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS shipments_carrier_tracking_hash_unique ON shipments (carrier_code, tracking_number_hash) WHERE tracking_number_hash IS NOT NULL"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS shipment_events_site_provider_event_unique ON shipment_events (site_id, provider_event_hash)"),
    db.prepare("CREATE INDEX IF NOT EXISTS shipment_events_shipment_received_idx ON shipment_events (shipment_id, received_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS admin_audit_log_site_created_idx ON admin_audit_log (site_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS admin_audit_log_entity_created_idx ON admin_audit_log (entity_type, entity_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS admin_audit_log_actor_created_idx ON admin_audit_log (actor_subject_hash, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS admin_audit_log_purge_after_idx ON admin_audit_log (purge_after)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_site_provider_event_unique ON webhook_events (site_id, provider, provider_event_hash)"),
    db.prepare("CREATE INDEX IF NOT EXISTS webhook_events_retry_idx ON webhook_events (status, next_attempt_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS webhook_events_purge_after_idx ON webhook_events (purge_after)"),
  ];
}

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
    db.prepare(`CREATE TABLE IF NOT EXISTS site_settings_revisions (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      settings_json TEXT NOT NULL,
      theme_json TEXT NOT NULL,
      version INTEGER NOT NULL,
      saved_by TEXT NOT NULL DEFAULT 'system',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      tag TEXT NOT NULL DEFAULT '佛牌知識',
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
      tag TEXT NOT NULL DEFAULT '佛牌知識',
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
      member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
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
      shipping_fee INTEGER CHECK (shipping_fee IS NULL OR shipping_fee >= 0),
      carrier TEXT NOT NULL DEFAULT '',
      tracking_number TEXT NOT NULL DEFAULT '',
      internal_note TEXT NOT NULL DEFAULT '',
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
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS site_settings_revisions_site_version_unique ON site_settings_revisions (site_id, version)"),
    db.prepare("CREATE INDEX IF NOT EXISTS site_settings_revisions_site_created_idx ON site_settings_revisions (site_id, created_at DESC)"),
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
    ...productionSchemaStatements(db),
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
    ["tag", "tag TEXT NOT NULL DEFAULT '佛牌知識'"],
    ["keywords_json", "keywords_json TEXT NOT NULL DEFAULT '[]'"],
    ["hero_image_url", "hero_image_url TEXT NOT NULL DEFAULT ''"],
    ["hero_image_alt", "hero_image_alt TEXT NOT NULL DEFAULT ''"],
    ["version", "version INTEGER NOT NULL DEFAULT 1"],
  ]);
  await addMissingColumns(db, "article_revisions", [
    ["slug", "slug TEXT NOT NULL DEFAULT ''"],
    ["noindex", "noindex INTEGER NOT NULL DEFAULT 0"],
    ["tag", "tag TEXT NOT NULL DEFAULT '佛牌知識'"],
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
    ["member_id", "member_id TEXT REFERENCES members(id) ON DELETE SET NULL"],
    ["request_fingerprint", "request_fingerprint TEXT NOT NULL DEFAULT ''"],
    ["reserved_until", "reserved_until TEXT"],
    ["expired_at", "expired_at TEXT"],
    ["consent_version", "consent_version TEXT NOT NULL DEFAULT 'local-reservation-v1'"],
    ["shipping_fee", "shipping_fee INTEGER CHECK (shipping_fee IS NULL OR shipping_fee >= 0)"],
    ["carrier", "carrier TEXT NOT NULL DEFAULT ''"],
    ["tracking_number", "tracking_number TEXT NOT NULL DEFAULT ''"],
    ["internal_note", "internal_note TEXT NOT NULL DEFAULT ''"],
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
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS orders_site_member_created_idx
      ON orders (site_id, member_id, created_at)
      WHERE member_id IS NOT NULL`,
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
  // Article saves and restores use optimistic versions. Legacy local databases
  // may contain duplicate version numbers from the old archive path, so retain
  // the newest row before enforcing one immutable revision per version.
  await db.prepare(`DELETE FROM article_revisions
    WHERE rowid NOT IN (
      SELECT MAX(rowid) FROM article_revisions GROUP BY article_id, version
    )`).run();
  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS article_revisions_article_version_unique
    ON article_revisions (article_id, version)`).run();
  // Site settings predate immutable history. Backfill exactly one snapshot of
  // the current version so a v10 local database can immediately save/restore.
  await db.prepare(`DELETE FROM site_settings_revisions
    WHERE rowid NOT IN (
      SELECT MAX(rowid) FROM site_settings_revisions GROUP BY site_id, version
    )`).run();
  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS site_settings_revisions_site_version_unique
    ON site_settings_revisions (site_id, version)`).run();
}

async function backfillSiteSettingsRevisions(db: D1Database) {
  await db.prepare(`INSERT OR IGNORE INTO site_settings_revisions (
    id, site_id, settings_json, theme_json, version, saved_by, created_at
  ) SELECT lower(hex(randomblob(16))), site_id, settings_json, theme_json,
    version, updated_by, updated_at FROM site_settings`).run();
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
        announcement: "商品資料整理中，確認後才開放訂購",
        brandName: "泰聚達",
        brandSubtitle: "THAI AMULET ARCHIVE",
        footerNote: "商品資訊與客服管道確認後才會開放正式訂購。",
        businessLegalName: "",
        businessAddress: "",
        contactEmail: "",
        contactPhone: "",
        contactHours: "",
        lineOfficialUrl: "",
        shippingPolicySummary: "台灣本島宅配為主；運費、偏遠加價與出貨時間於客服確認訂單後告知。網站小計不含運費。",
        returnsPolicySummary: "退換貨申請管道與退貨地址將於正式開放訂購前公布；七日解除權適用範圍依實際商品與法規辦理。",
        paymentPolicySummary: "目前不提供線上刷卡。訂單確認後由客服通知可使用的付款方式與期限。",
        homeHeroEyebrow: "泰國佛牌與收藏品",
        homeHeroTitlePrimary: "清楚的商品資訊，",
        homeHeroTitleSecondary: "讓選擇更有依據。",
        homeHeroLead: "提供商品尺寸、材質、年份、來源與保存狀況等資訊，讓你在選購前先了解商品內容。",
        homePrimaryCtaLabel: "查看最新商品",
        homeSecondaryCtaLabel: "閱讀選購指南",
        homeCollectionsTitle: "依商品類型瀏覽",
        homeCollectionsIntro: "從佛牌、神尊與符印等分類查看商品，並參考材質、尺寸與來源說明。",
        homeArrivalsTitle: "最新商品",
      }),
      JSON.stringify({
        preset: "archive",
        accent: "#c5a15a",
        surface: "#fbf9f2",
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

  // Legacy local databases may already contain a category with the same name
  // under a user-generated id. INSERT OR IGNORE keeps that row, so products
  // must bind the persisted id instead of assuming the static seed id won.
  const categoryRows = await db.prepare(
    "SELECT id, name FROM categories WHERE site_id = ?",
  ).bind(DEFAULT_SITE_ID).all<{ id: string; name: string }>();
  const categoryIds = new Map(categoryRows.results.map(({ id, name }) => [name, id]));
  for (const category of catalogCategories) {
    if (!categoryIds.has(category.name)) {
      throw new Error(`Catalog category was not persisted: ${category.name}`);
    }
  }
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
    if (Number(versionRow?.value || 0) >= CURRENT_SCHEMA_VERSION) {
      await ensureTenantIntegrityTriggers(db);
      return;
    }
  } catch {
    // Legacy databases do not have the metadata table yet. The idempotent
    // schema statements below create it without removing any existing data.
  }

  await db.batch(schemaStatements(db));
  await upgradeLegacySchema(db);
  await ensureTenantIntegrityTriggers(db);
  await seedCatalog(db);
  await backfillSiteSettingsRevisions(db);
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
