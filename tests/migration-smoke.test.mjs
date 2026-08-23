import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import { Miniflare } from "miniflare";

import { TENANT_INTEGRITY_TRIGGER_NAMES } from "../worker/database.ts";

const migrationsDirectory = new URL("../drizzle/", import.meta.url);
const statementBreakpoint = "--> statement-breakpoint";

async function migrationFiles() {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /^\d{4}_.+\.sql$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"));
}

function migrationStatements(sql) {
  return sql
    .split(statementBreakpoint)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function objectNames(db, type) {
  const result = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).bind(type).all();
  return new Set(result.results.map((row) => String(row.name)));
}

async function columnNames(db, table) {
  assert.match(table, /^[a-z_]+$/u);
  const result = await db.prepare(`PRAGMA table_info("${table}")`).all();
  return new Set(result.results.map((row) => String(row.name)));
}

function assertIncludes(actual, expected, label) {
  const missing = expected.filter((name) => !actual.has(name));
  assert.deepEqual(missing, [], `missing ${label}: ${missing.join(", ")}`);
}

async function assertTenantViolation(db, sql, label) {
  await assert.rejects(
    db.prepare(sql).run(),
    /tenant integrity violation|tenant site is immutable/u,
    label,
  );
}

test("all Drizzle migrations build the required schema from a blank D1 database", async () => {
  const files = await migrationFiles();
  assert.ok(files.length > 0, "no drizzle SQL migrations were discovered");
  assert.equal(new Set(files).size, files.length, "migration filenames must be unique");

  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    compatibilityDate: "2026-05-22",
    d1Databases: { DB: `migration-smoke-${crypto.randomUUID()}` },
  });

  try {
    const db = await miniflare.getD1Database("DB");
    let executedStatements = 0;

    for (const filename of files) {
      if (filename.startsWith("0009_")) {
        await db.prepare(
          "INSERT INTO sites (id, code, name) VALUES ('site_migration_fixture', 'migration-fixture', 'Migration fixture')",
        ).run();
        await db.prepare(`INSERT INTO orders (
          id, site_id, order_number, idempotency_key, customer_name,
          customer_phone, delivery_method, subtotal
        ) VALUES (
          'order_migration_fixture', 'site_migration_fixture', 'MIGRATION-0001',
          'migration-idempotency', 'fixture', 'fixture', 'appointment', 100
        )`).run();
      }
      if (filename.startsWith("0010_")) {
        await db.prepare(`INSERT INTO site_settings (
          site_id, settings_json, theme_json, version, updated_by, updated_at
        ) VALUES (
          'site_migration_fixture', '{"brandName":"v10 fixture"}',
          '{"accent":"#b89048"}', 7, 'v10-admin', '2026-08-12T00:00:00.000Z'
        )`).run();
      }
      const sql = await readFile(new URL(filename, migrationsDirectory), "utf8");
      const statements = migrationStatements(sql);
      assert.ok(statements.length > 0, `${filename} does not contain an executable statement`);
      for (const [index, statement] of statements.entries()) {
        try {
          await db.prepare(statement).run();
        } catch (cause) {
          throw new Error(`${filename} statement ${index + 1} failed`, { cause });
        }
        executedStatements += 1;
      }
    }

    assert.ok(executedStatements >= files.length, "each migration must execute at least one statement");

    const tables = await objectNames(db, "table");
    assertIncludes(tables, [
      "admin_audit_log",
      "article_revisions",
      "articles",
      "cart_items",
      "carts",
      "categories",
      "inventory",
      "inventory_movements",
      "media_assets",
      "member_addresses",
      "member_auth_challenges",
      "member_consents",
      "member_identities",
      "member_sessions",
      "members",
      "order_customer_snapshots",
      "order_events",
      "order_items",
      "orders",
      "payment_events",
      "payment_transactions",
      "product_media",
      "products",
      "schema_metadata",
      "shipment_events",
      "shipments",
      "site_page_revisions",
      "site_pages",
      "site_settings",
      "site_settings_revisions",
      "sites",
      "webhook_events",
    ], "tables");

    const indexes = await objectNames(db, "index");
    assertIncludes(indexes, [
      "article_revisions_article_idx",
      "article_revisions_article_version_unique",
      "articles_site_slug_unique",
      "cart_items_cart_product_unique",
      "carts_site_active_owner_unique",
      "inventory_movements_order_product_type_unique",
      "inventory_site_product_unique",
      "media_assets_site_storage_key_unique",
      "member_auth_challenges_hash_unique",
      "member_auth_challenges_oauth_state_unique",
      "member_consents_event_key_hash_unique",
      "member_identities_site_provider_subject_unique",
      "member_sessions_token_hash_unique",
      "order_events_order_created_idx",
      "orders_reservation_expiry_idx",
      "orders_site_idempotency_unique",
      "orders_site_member_created_idx",
      "order_customer_snapshots_site_phone_idx",
      "payment_transactions_idempotency_hash_unique",
      "product_media_product_asset_unique",
      "products_site_sku_unique",
      "products_site_slug_unique",
      "shipment_events_site_provider_event_unique",
      "site_page_revisions_page_version_unique",
      "site_pages_site_slug_unique",
      "site_settings_revisions_site_version_unique",
      "sites_code_unique",
      "webhook_events_site_provider_event_unique",
    ], "indexes");

    const requiredColumns = {
      article_revisions: ["slug", "tag", "keywords_json", "hero_image_url", "hero_image_alt", "noindex", "version"],
      articles: ["content_json", "seo_title", "seo_description", "tag", "keywords_json", "hero_image_url", "hero_image_alt", "version"],
      inventory: ["on_hand", "reserved", "version"],
      media_assets: ["storage_key", "checksum_sha256", "content_type", "byte_size", "purge_after"],
      member_addresses: ["label_code", "address_fingerprint_hash", "encrypted_payload", "encryption_key_version", "purge_after"],
      member_auth_challenges: ["destination_hash", "challenge_hash", "oauth_state_hash", "pkce_verifier_hash", "nonce_hash", "attempt_count", "expires_at", "consumed_at", "purge_after"],
      member_consents: ["scope", "policy_version", "decision", "source", "event_key_hash", "evidence_hash", "recorded_at", "purge_after"],
      member_identities: ["provider_subject_hash", "email_hash", "phone_hash", "verified_at", "purge_after"],
      member_sessions: ["session_token_hash", "csrf_secret_hash", "expires_at", "revoked_at", "purge_after"],
      members: ["site_id", "status", "deletion_requested_at", "purge_after"],
      order_customer_snapshots: ["email_hash", "phone_hash", "encrypted_payload", "encryption_key_version", "purge_after"],
      orders: [
        "member_id",
        "idempotency_key",
        "request_fingerprint",
        "reserved_until",
        "expired_at",
        "consent_version",
        "payment_status",
        "order_status",
        "shipping_fee",
        "carrier",
        "tracking_number",
        "internal_note",
      ],
      cart_items: ["site_id", "cart_id", "product_id", "quantity"],
      payment_events: ["site_id", "transaction_id", "provider_event_hash", "payload_hash"],
      payment_transactions: ["provider_transaction_hash", "related_transaction_hash", "idempotency_key_hash", "transaction_type", "amount"],
      product_media: ["site_id", "product_id", "media_asset_id", "sort_order"],
      shipment_events: ["site_id", "shipment_id", "provider_event_hash", "payload_hash"],
      shipments: ["tracking_number_hash", "tracking_payload_encrypted", "encryption_key_version", "shipping_label_asset_id"],
      products: ["purchase_limit", "stock", "image_url", "image_alt", "seo_ready", "version"],
      site_pages: ["data_json", "seo_title", "seo_description", "canonical_url", "og_image_url", "noindex", "version"],
      site_settings: ["settings_json", "theme_json", "version", "updated_by"],
      site_settings_revisions: ["site_id", "settings_json", "theme_json", "version", "saved_by", "created_at"],
      webhook_events: ["provider_event_hash", "payload_hash", "signature_valid", "attempt_count", "purge_after"],
    };
    for (const [table, columns] of Object.entries(requiredColumns)) {
      assertIncludes(await columnNames(db, table), columns, `${table} columns`);
    }

    const forbiddenRawColumns = {
      member_addresses: ["recipient_name", "phone", "address", "postal_code"],
      member_auth_challenges: ["destination", "challenge", "oauth_state", "pkce_verifier", "nonce", "otp"],
      member_consents: ["event_key", "evidence", "ip_address", "user_agent"],
      member_identities: ["provider_subject", "email", "phone"],
      member_sessions: ["session_token", "csrf_secret", "ip_address", "user_agent"],
      order_customer_snapshots: ["customer_name", "email", "phone", "address", "postal_code"],
      payment_events: ["payload", "provider_event_id"],
      payment_transactions: ["provider_transaction_id", "idempotency_key", "provider_response"],
      shipment_events: ["payload", "provider_event_id"],
      shipments: ["tracking_number"],
      webhook_events: ["payload", "provider_event_id"],
    };
    for (const [table, forbidden] of Object.entries(forbiddenRawColumns)) {
      const columns = await columnNames(db, table);
      assert.deepEqual(
        forbidden.filter((column) => columns.has(column)),
        [],
        `${table} must not persist raw PII, credentials, or provider payloads`,
      );
    }
    const mediaColumns = await columnNames(db, "media_assets");
    assert.deepEqual(
      ["body", "blob", "blob_data", "bytes"].filter((column) => mediaColumns.has(column)),
      [],
      "media_assets must contain metadata only; media bytes belong in R2",
    );

    const triggers = await objectNames(db, "trigger");
    assertIncludes(triggers, TENANT_INTEGRITY_TRIGGER_NAMES, "tenant-integrity triggers");

    const orderForeignKeys = await db.prepare('PRAGMA foreign_key_list("orders")').all();
    const memberForeignKey = orderForeignKeys.results.find((row) => row.from === "member_id");
    assert.equal(memberForeignKey?.table, "members");
    assert.equal(String(memberForeignKey?.on_delete).toUpperCase(), "SET NULL");

    const schemaVersion = await db.prepare(
      "SELECT value FROM schema_metadata WHERE key = 'schema_version'",
    ).first();
    assert.equal(schemaVersion?.value, "11");

    const migratedSettingsRevision = await db.prepare(`SELECT version, saved_by, settings_json
      FROM site_settings_revisions WHERE site_id = 'site_migration_fixture'`).first();
    assert.equal(migratedSettingsRevision?.version, 7, "v10 setting version must be backfilled into immutable history");
    assert.equal(migratedSettingsRevision?.saved_by, "v10-admin");
    assert.equal(JSON.parse(migratedSettingsRevision?.settings_json || "{}").brandName, "v10 fixture");

    const migratedOrder = await db.prepare(
      "SELECT id, member_id FROM orders WHERE id = 'order_migration_fixture'",
    ).first();
    assert.equal(migratedOrder?.id, "order_migration_fixture", "v9 order data must survive v10 migration");
    assert.equal(migratedOrder?.member_id, null, "existing guest orders remain guest orders");

    await db.prepare(
      "INSERT INTO sites (id, code, name) VALUES ('site_tenant_b', 'tenant-b', 'Tenant B')",
    ).run();
    await db.prepare(
      "INSERT INTO members (id, site_id) VALUES ('member_tenant_a', 'site_migration_fixture')",
    ).run();
    await db.prepare(
      "INSERT INTO members (id, site_id) VALUES ('member_tenant_b', 'site_tenant_b')",
    ).run();
    await db.prepare(
      "UPDATE orders SET member_id = 'member_tenant_a' WHERE id = 'order_migration_fixture'",
    ).run();
    await assertTenantViolation(
      db,
      "UPDATE orders SET member_id = 'member_tenant_b' WHERE id = 'order_migration_fixture'",
      "orders.member_id update must stay in the order tenant",
    );
    await assertTenantViolation(
      db,
      `INSERT INTO orders (
        id, site_id, member_id, order_number, idempotency_key, customer_name,
        customer_phone, delivery_method, subtotal
      ) VALUES (
        'order_cross_tenant', 'site_migration_fixture', 'member_tenant_b', 'MIGRATION-CROSS',
        'migration-cross-idempotency', 'fixture', 'fixture', 'appointment', 100
      )`,
      "cross-tenant order insert must fail",
    );
    await db.batch([
      db.prepare("INSERT INTO categories (id, site_id, slug, name) VALUES ('category_tenant_a', 'site_migration_fixture', 'category-a', 'Category A')"),
      db.prepare("INSERT INTO categories (id, site_id, slug, name) VALUES ('category_tenant_b', 'site_tenant_b', 'category-b', 'Category B')"),
    ]);
    await db.batch([
      db.prepare(`INSERT INTO products (
        id, site_id, category_id, sku, slug, name, short_name, price, shape
      ) VALUES (
        'product_tenant_a', 'site_migration_fixture', 'category_tenant_a', 'SKU-A',
        'product-a', 'Product A', 'A', 100, 'round'
      )`),
      db.prepare(`INSERT INTO products (
        id, site_id, category_id, sku, slug, name, short_name, price, shape
      ) VALUES (
        'product_tenant_b', 'site_tenant_b', 'category_tenant_b', 'SKU-B',
        'product-b', 'Product B', 'B', 100, 'round'
      )`),
    ]);
    await db.prepare(`INSERT INTO carts (
      id, site_id, member_id, owner_key_hash, expires_at
    ) VALUES (
      'cart_tenant_a', 'site_migration_fixture', 'member_tenant_a', 'owner-a', '2099-01-01T00:00:00Z'
    )`).run();
    await assertTenantViolation(
      db,
      `INSERT INTO cart_items (
        id, site_id, cart_id, product_id, quantity, unit_price_snapshot
      ) VALUES (
        'cart_item_cross', 'site_migration_fixture', 'cart_tenant_a', 'product_tenant_b', 1, 100
      )`,
      "cross-tenant cart item insert must fail",
    );
    await db.prepare(`INSERT INTO cart_items (
      id, site_id, cart_id, product_id, quantity, unit_price_snapshot
    ) VALUES (
      'cart_item_tenant_a', 'site_migration_fixture', 'cart_tenant_a', 'product_tenant_a', 1, 100
    )`).run();
    await assertTenantViolation(
      db,
      "UPDATE cart_items SET product_id = 'product_tenant_b' WHERE id = 'cart_item_tenant_a'",
      "cross-tenant cart item update must fail",
    );

    await db.prepare(`UPDATE orders SET member_id = 'member_tenant_a'
      WHERE id = 'order_migration_fixture'`).run();
    await db.prepare("DELETE FROM members WHERE id = 'member_tenant_a'").run();
    const unlinkedOrder = await db.prepare(
      "SELECT member_id FROM orders WHERE id = 'order_migration_fixture'",
    ).first();
    assert.equal(unlinkedOrder?.member_id, null, "member deletion must retain the order audit record");

    const quickCheck = await db.prepare("PRAGMA quick_check").first();
    assert.equal(quickCheck?.quick_check, "ok");
    const foreignKeyCheck = await db.prepare("PRAGMA foreign_key_check").all();
    assert.deepEqual(foreignKeyCheck.results, []);
  } finally {
    await miniflare.dispose();
  }
});
