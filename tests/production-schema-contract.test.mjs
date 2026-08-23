import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import { Miniflare } from "miniflare";

import { catalogCategories } from "../shared/catalog.ts";
import {
  CURRENT_SCHEMA_VERSION,
  TENANT_INTEGRITY_TRIGGER_NAMES,
  ensureDatabase,
} from "../worker/database.ts";

const migrationsDirectory = new URL("../drizzle/", import.meta.url);

async function applyLegacyMigrations(db) {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /^000[0-8]_.+\.sql$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"));
  assert.equal(files.length, 9, "legacy fixture must cover migrations 0000 through 0008");
  for (const filename of files) {
    const sql = await readFile(new URL(filename, migrationsDirectory), "utf8");
    for (const statement of sql.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) {
      await db.prepare(statement).run();
    }
  }
}

async function objectNames(db, type) {
  const result = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).bind(type).all();
  return new Set(result.results.map((row) => String(row.name)));
}

async function assertTenantViolation(db, sql, label) {
  await assert.rejects(
    db.prepare(sql).run(),
    /tenant integrity violation|tenant site is immutable/u,
    label,
  );
}

async function seedTenantIntegrityFixtures(db) {
  const statements = [
    "INSERT INTO sites (id, code, name) VALUES ('contract_site_a', 'contract-a', 'Contract A')",
    "INSERT INTO sites (id, code, name) VALUES ('contract_site_b', 'contract-b', 'Contract B')",
    "INSERT INTO categories (id, site_id, slug, name) VALUES ('contract_category_a', 'contract_site_a', 'category-a', 'Category A')",
    "INSERT INTO categories (id, site_id, slug, name) VALUES ('contract_category_b', 'contract_site_b', 'category-b', 'Category B')",
    `INSERT INTO products (
      id, site_id, category_id, sku, slug, name, short_name, price, shape
    ) VALUES (
      'contract_product_a', 'contract_site_a', 'contract_category_a', 'CONTRACT-A',
      'contract-product-a', 'Contract Product A', 'A', 100, 'round'
    )`,
    `INSERT INTO products (
      id, site_id, category_id, sku, slug, name, short_name, price, shape
    ) VALUES (
      'contract_product_b', 'contract_site_b', 'contract_category_b', 'CONTRACT-B',
      'contract-product-b', 'Contract Product B', 'B', 100, 'round'
    )`,
    "INSERT INTO inventory (product_id, site_id, on_hand) VALUES ('contract_product_a', 'contract_site_a', 2)",
    "INSERT INTO members (id, site_id) VALUES ('contract_member_a', 'contract_site_a')",
    "INSERT INTO members (id, site_id) VALUES ('contract_member_b', 'contract_site_b')",
    `INSERT INTO orders (
      id, site_id, member_id, order_number, idempotency_key, customer_name,
      customer_phone, delivery_method, subtotal
    ) VALUES (
      'contract_order_a', 'contract_site_a', 'contract_member_a', 'CONTRACT-A-1',
      'contract-order-a', 'fixture', 'fixture', 'appointment', 100
    )`,
    `INSERT INTO orders (
      id, site_id, member_id, order_number, idempotency_key, customer_name,
      customer_phone, delivery_method, subtotal
    ) VALUES (
      'contract_order_b', 'contract_site_b', 'contract_member_b', 'CONTRACT-B-1',
      'contract-order-b', 'fixture', 'fixture', 'appointment', 100
    )`,
    `INSERT INTO order_items (
      id, order_id, product_id, product_sku, product_name, unit_price, quantity, line_total
    ) VALUES (
      'contract_order_item_a', 'contract_order_a', 'contract_product_a', 'CONTRACT-A',
      'Contract Product A', 100, 1, 100
    )`,
    `INSERT INTO inventory_movements (
      id, site_id, product_id, order_id, movement_type, quantity, on_hand_after, reserved_after
    ) VALUES (
      'contract_movement_a', 'contract_site_a', 'contract_product_a', 'contract_order_a',
      'adjustment', 1, 2, 0
    )`,
    `INSERT INTO order_events (id, site_id, order_id, event_type)
      VALUES ('contract_order_event_a', 'contract_site_a', 'contract_order_a', 'created')`,
    `INSERT INTO member_identities (
      id, site_id, member_id, provider, provider_subject_hash
    ) VALUES (
      'contract_identity_a', 'contract_site_a', 'contract_member_a', 'line', 'subject-a'
    )`,
    `INSERT INTO member_sessions (
      id, site_id, member_id, session_token_hash, csrf_secret_hash, expires_at, purge_after
    ) VALUES (
      'contract_session_a', 'contract_site_a', 'contract_member_a', 'session-a', 'csrf-a',
      '2099-01-01T00:00:00Z', '2099-02-01T00:00:00Z'
    )`,
    `INSERT INTO member_addresses (
      id, site_id, member_id, address_fingerprint_hash, encrypted_payload, encryption_key_version
    ) VALUES (
      'contract_address_a', 'contract_site_a', 'contract_member_a', 'address-a', 'encrypted-a', 'key-1'
    )`,
    `INSERT INTO member_consents (
      id, site_id, member_id, scope, policy_version, decision, source, event_key_hash, purge_after
    ) VALUES (
      'contract_consent_a', 'contract_site_a', 'contract_member_a', 'privacy', 'v1',
      'granted', 'signup', 'consent-a', '2099-01-01T00:00:00Z'
    )`,
    `INSERT INTO carts (id, site_id, member_id, owner_key_hash, expires_at)
      VALUES ('contract_cart_a', 'contract_site_a', 'contract_member_a', 'cart-owner-a', '2099-01-01T00:00:00Z')`,
    `INSERT INTO carts (id, site_id, member_id, owner_key_hash, expires_at)
      VALUES ('contract_cart_b', 'contract_site_b', 'contract_member_b', 'cart-owner-b', '2099-01-01T00:00:00Z')`,
    `INSERT INTO cart_items (
      id, site_id, cart_id, product_id, quantity, unit_price_snapshot
    ) VALUES (
      'contract_cart_item_a', 'contract_site_a', 'contract_cart_a', 'contract_product_a', 1, 100
    )`,
    `INSERT INTO order_customer_snapshots (
      order_id, site_id, phone_hash, encrypted_payload, encryption_key_version, purge_after
    ) VALUES (
      'contract_order_a', 'contract_site_a', 'phone-a', 'encrypted-a', 'key-1', '2099-01-01T00:00:00Z'
    )`,
    `INSERT INTO media_assets (
      id, site_id, storage_key, checksum_sha256, content_type, byte_size, purpose, status
    ) VALUES (
      'contract_media_a', 'contract_site_a', 'contract/a.webp', 'checksum-a', 'image/webp', 1,
      'product', 'ready'
    )`,
    `INSERT INTO media_assets (
      id, site_id, storage_key, checksum_sha256, content_type, byte_size, purpose, status
    ) VALUES (
      'contract_media_b', 'contract_site_b', 'contract/b.webp', 'checksum-b', 'image/webp', 1,
      'product', 'ready'
    )`,
    `INSERT INTO product_media (id, site_id, product_id, media_asset_id)
      VALUES ('contract_product_media_a', 'contract_site_a', 'contract_product_a', 'contract_media_a')`,
    `INSERT INTO payment_transactions (
      id, site_id, order_id, provider, provider_transaction_hash, idempotency_key_hash,
      transaction_type, amount
    ) VALUES (
      'contract_payment_a', 'contract_site_a', 'contract_order_a', 'fixture', 'payment-a',
      'payment-idempotency-a', 'authorization', 100
    )`,
    `INSERT INTO payment_transactions (
      id, site_id, order_id, provider, provider_transaction_hash, idempotency_key_hash,
      transaction_type, amount
    ) VALUES (
      'contract_payment_b', 'contract_site_b', 'contract_order_b', 'fixture', 'payment-b',
      'payment-idempotency-b', 'authorization', 100
    )`,
    `INSERT INTO payment_events (
      id, site_id, transaction_id, provider_event_hash, event_type, payload_hash
    ) VALUES (
      'contract_payment_event_a', 'contract_site_a', 'contract_payment_a', 'payment-event-a',
      'authorized', 'payload-a'
    )`,
    `INSERT INTO shipments (id, site_id, order_id, carrier_code)
      VALUES ('contract_shipment_a', 'contract_site_a', 'contract_order_a', 'fixture')`,
    `INSERT INTO shipments (id, site_id, order_id, carrier_code)
      VALUES ('contract_shipment_b', 'contract_site_b', 'contract_order_b', 'fixture')`,
    `INSERT INTO shipment_events (
      id, site_id, shipment_id, provider_event_hash, event_type, payload_hash
    ) VALUES (
      'contract_shipment_event_a', 'contract_site_a', 'contract_shipment_a',
      'shipment-event-a', 'accepted', 'payload-a'
    )`,
  ];

  for (const sql of statements) await db.prepare(sql).run();
}

test("runtime compatibility bootstrap upgrades legacy category ids into the v10 production contract", async () => {
  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    compatibilityDate: "2026-05-22",
    d1Databases: { DB: `production-schema-${crypto.randomUUID()}` },
  });

  try {
    const db = await miniflare.getD1Database("DB");
    await applyLegacyMigrations(db);
    await db.prepare(
      "INSERT INTO sites (id, code, name) VALUES ('site_taijuda', 'taijuda', 'Legacy Taijuda')",
    ).run();
    const legacyCategoryIds = new Set();
    for (const [index, category] of catalogCategories.entries()) {
      const id = `legacy_category_${index + 1}`;
      legacyCategoryIds.add(id);
      await db.prepare(`INSERT INTO categories (
        id, site_id, slug, name, description, sort_order, status
      ) VALUES (?, 'site_taijuda', ?, ?, ?, ?, ?)`)
        .bind(
          id,
          category.slug,
          category.name,
          category.description,
          category.sortOrder,
          category.status,
        )
        .run();
    }
    await ensureDatabase(db);

    const tables = await objectNames(db, "table");
    for (const table of [
      "admin_audit_log",
      "cart_items",
      "carts",
      "media_assets",
      "member_addresses",
      "member_auth_challenges",
      "member_consents",
      "member_identities",
      "member_sessions",
      "members",
      "order_customer_snapshots",
      "payment_events",
      "payment_transactions",
      "product_media",
      "shipment_events",
      "shipments",
      "webhook_events",
    ]) {
      assert.ok(tables.has(table), `runtime schema is missing ${table}`);
    }

    const schemaVersion = await db.prepare(
      "SELECT value FROM schema_metadata WHERE key = 'schema_version'",
    ).first();
    assert.equal(schemaVersion?.value, String(CURRENT_SCHEMA_VERSION));

    const seededSite = await db.prepare(
      "SELECT id FROM sites WHERE code = 'taijuda' LIMIT 1",
    ).first();
    assert.ok(seededSite?.id, "local compatibility bootstrap must retain the catalog seed path");
    const productCount = await db.prepare("SELECT COUNT(*) AS count FROM products").first();
    assert.ok(Number(productCount?.count) > 0, "local compatibility bootstrap must seed products");
    const seededProductCategories = await db.prepare(
      "SELECT DISTINCT category_id FROM products WHERE site_id = 'site_taijuda'",
    ).all();
    assert.ok(seededProductCategories.results.length > 0);
    assert.ok(
      seededProductCategories.results.every((row) => legacyCategoryIds.has(String(row.category_id))),
      "product seed must resolve the persisted legacy category ids by name",
    );

    const triggers = await objectNames(db, "trigger");
    assert.deepEqual(
      TENANT_INTEGRITY_TRIGGER_NAMES.filter((name) => !triggers.has(name)),
      [],
      "runtime bootstrap must install every tenant-integrity trigger",
    );

    await seedTenantIntegrityFixtures(db);
    const crossTenantInserts = [
      [
        "products.category_id",
        `INSERT INTO products (
          id, site_id, category_id, sku, slug, name, short_name, price, shape
        ) VALUES (
          'contract_cross_product', 'contract_site_a', 'contract_category_b', 'CONTRACT-CROSS',
          'contract-cross-product', 'Cross Product', 'Cross', 100, 'round'
        )`,
      ],
      [
        "inventory.product_id",
        "INSERT INTO inventory (product_id, site_id, on_hand) VALUES ('contract_product_b', 'contract_site_a', 1)",
      ],
      [
        "orders.member_id",
        `INSERT INTO orders (
          id, site_id, member_id, order_number, idempotency_key, customer_name,
          customer_phone, delivery_method, subtotal
        ) VALUES (
          'contract_cross_order', 'contract_site_a', 'contract_member_b', 'CONTRACT-CROSS',
          'contract-cross-order', 'fixture', 'fixture', 'appointment', 100
        )`,
      ],
      [
        "order_items product",
        `INSERT INTO order_items (
          id, order_id, product_id, product_sku, product_name, unit_price, quantity, line_total
        ) VALUES (
          'contract_cross_order_item', 'contract_order_a', 'contract_product_b', 'CONTRACT-B',
          'Contract Product B', 100, 1, 100
        )`,
      ],
      [
        "inventory_movements product",
        `INSERT INTO inventory_movements (
          id, site_id, product_id, order_id, movement_type, quantity, on_hand_after, reserved_after
        ) VALUES (
          'contract_cross_movement', 'contract_site_a', 'contract_product_b', 'contract_order_a',
          'adjustment', 1, 1, 0
        )`,
      ],
      [
        "order_events.order_id",
        `INSERT INTO order_events (id, site_id, order_id, event_type)
          VALUES ('contract_cross_order_event', 'contract_site_a', 'contract_order_b', 'created')`,
      ],
      [
        "member_identities.member_id",
        `INSERT INTO member_identities (id, site_id, member_id, provider, provider_subject_hash)
          VALUES ('contract_cross_identity', 'contract_site_a', 'contract_member_b', 'line', 'subject-cross')`,
      ],
      [
        "member_sessions.member_id",
        `INSERT INTO member_sessions (
          id, site_id, member_id, session_token_hash, csrf_secret_hash, expires_at, purge_after
        ) VALUES (
          'contract_cross_session', 'contract_site_a', 'contract_member_b', 'session-cross',
          'csrf-cross', '2099-01-01T00:00:00Z', '2099-02-01T00:00:00Z'
        )`,
      ],
      [
        "member_addresses.member_id",
        `INSERT INTO member_addresses (
          id, site_id, member_id, address_fingerprint_hash, encrypted_payload, encryption_key_version
        ) VALUES (
          'contract_cross_address', 'contract_site_a', 'contract_member_b', 'address-cross',
          'encrypted-cross', 'key-1'
        )`,
      ],
      [
        "member_consents.member_id",
        `INSERT INTO member_consents (
          id, site_id, member_id, scope, policy_version, decision, source, event_key_hash, purge_after
        ) VALUES (
          'contract_cross_consent', 'contract_site_a', 'contract_member_b', 'privacy', 'v1',
          'granted', 'signup', 'consent-cross', '2099-01-01T00:00:00Z'
        )`,
      ],
      [
        "carts.member_id",
        `INSERT INTO carts (id, site_id, member_id, owner_key_hash, expires_at)
          VALUES ('contract_cross_cart', 'contract_site_a', 'contract_member_b', 'cart-owner-cross', '2099-01-01T00:00:00Z')`,
      ],
      [
        "cart_items product",
        `INSERT INTO cart_items (
          id, site_id, cart_id, product_id, quantity, unit_price_snapshot
        ) VALUES (
          'contract_cross_cart_item', 'contract_site_a', 'contract_cart_a', 'contract_product_b', 1, 100
        )`,
      ],
      [
        "order_customer_snapshots.order_id",
        `INSERT INTO order_customer_snapshots (
          order_id, site_id, phone_hash, encrypted_payload, encryption_key_version, purge_after
        ) VALUES (
          'contract_order_b', 'contract_site_a', 'phone-cross', 'encrypted-cross', 'key-1',
          '2099-01-01T00:00:00Z'
        )`,
      ],
      [
        "product_media media asset",
        `INSERT INTO product_media (id, site_id, product_id, media_asset_id)
          VALUES ('contract_cross_product_media', 'contract_site_a', 'contract_product_a', 'contract_media_b')`,
      ],
      [
        "payment_transactions.order_id",
        `INSERT INTO payment_transactions (
          id, site_id, order_id, provider, provider_transaction_hash, idempotency_key_hash,
          transaction_type, amount
        ) VALUES (
          'contract_cross_payment', 'contract_site_a', 'contract_order_b', 'fixture',
          'payment-cross', 'payment-idempotency-cross', 'authorization', 100
        )`,
      ],
      [
        "payment_events.transaction_id",
        `INSERT INTO payment_events (
          id, site_id, transaction_id, provider_event_hash, event_type, payload_hash
        ) VALUES (
          'contract_cross_payment_event', 'contract_site_a', 'contract_payment_b',
          'payment-event-cross', 'authorized', 'payload-cross'
        )`,
      ],
      [
        "shipments.order_id",
        `INSERT INTO shipments (id, site_id, order_id, carrier_code)
          VALUES ('contract_cross_shipment', 'contract_site_a', 'contract_order_b', 'fixture')`,
      ],
      [
        "shipment_events.shipment_id",
        `INSERT INTO shipment_events (
          id, site_id, shipment_id, provider_event_hash, event_type, payload_hash
        ) VALUES (
          'contract_cross_shipment_event', 'contract_site_a', 'contract_shipment_b',
          'shipment-event-cross', 'accepted', 'payload-cross'
        )`,
      ],
    ];
    for (const [label, sql] of crossTenantInserts) {
      await assertTenantViolation(db, sql, `cross-tenant insert must fail for ${label}`);
    }

    const crossTenantUpdates = [
      ["products.category_id", "UPDATE products SET category_id = 'contract_category_b' WHERE id = 'contract_product_a'"],
      ["inventory.product_id", "UPDATE inventory SET product_id = 'contract_product_b' WHERE product_id = 'contract_product_a'"],
      ["orders.member_id", "UPDATE orders SET member_id = 'contract_member_b' WHERE id = 'contract_order_a'"],
      ["order_items.product_id", "UPDATE order_items SET product_id = 'contract_product_b' WHERE id = 'contract_order_item_a'"],
      ["inventory_movements.product_id", "UPDATE inventory_movements SET product_id = 'contract_product_b' WHERE id = 'contract_movement_a'"],
      ["order_events.order_id", "UPDATE order_events SET order_id = 'contract_order_b' WHERE id = 'contract_order_event_a'"],
      ["member_identities.member_id", "UPDATE member_identities SET member_id = 'contract_member_b' WHERE id = 'contract_identity_a'"],
      ["member_sessions.member_id", "UPDATE member_sessions SET member_id = 'contract_member_b' WHERE id = 'contract_session_a'"],
      ["member_addresses.member_id", "UPDATE member_addresses SET member_id = 'contract_member_b' WHERE id = 'contract_address_a'"],
      ["member_consents.member_id", "UPDATE member_consents SET member_id = 'contract_member_b' WHERE id = 'contract_consent_a'"],
      ["carts.member_id", "UPDATE carts SET member_id = 'contract_member_b' WHERE id = 'contract_cart_a'"],
      ["cart_items.product_id", "UPDATE cart_items SET product_id = 'contract_product_b' WHERE id = 'contract_cart_item_a'"],
      ["order_customer_snapshots.site_id", "UPDATE order_customer_snapshots SET site_id = 'contract_site_b' WHERE order_id = 'contract_order_a'"],
      ["product_media.media_asset_id", "UPDATE product_media SET media_asset_id = 'contract_media_b' WHERE id = 'contract_product_media_a'"],
      ["payment_transactions.order_id", "UPDATE payment_transactions SET order_id = 'contract_order_b' WHERE id = 'contract_payment_a'"],
      ["payment_events.transaction_id", "UPDATE payment_events SET transaction_id = 'contract_payment_b' WHERE id = 'contract_payment_event_a'"],
      ["shipments.order_id", "UPDATE shipments SET order_id = 'contract_order_b' WHERE id = 'contract_shipment_a'"],
      ["shipment_events.shipment_id", "UPDATE shipment_events SET shipment_id = 'contract_shipment_b' WHERE id = 'contract_shipment_event_a'"],
    ];
    for (const [label, sql] of crossTenantUpdates) {
      await assertTenantViolation(db, sql, `cross-tenant update must fail for ${label}`);
    }
    await assertTenantViolation(
      db,
      "UPDATE members SET site_id = 'contract_site_b' WHERE id = 'contract_member_a'",
      "referenced tenant owners cannot move between sites",
    );

    const quickCheck = await db.prepare("PRAGMA quick_check").first();
    assert.equal(quickCheck?.quick_check, "ok");
    const foreignKeyCheck = await db.prepare("PRAGMA foreign_key_check").all();
    assert.deepEqual(foreignKeyCheck.results, []);
  } finally {
    await miniflare.dispose();
  }
});
