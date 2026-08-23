import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Miniflare } from "miniflare";
import {
  handleAdminSystemApi,
  productVersionSignature,
} from "../worker/admin-system-api.ts";

let miniflare;
let db;

before(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    compatibilityDate: "2026-05-22",
    d1Databases: { DB: "admin-system-test" },
  });
  db = await miniflare.getD1Database("DB");
});

after(async () => {
  await miniflare?.dispose();
});

test("admin status summarizes every shared CMS and commerce module without customer data", async () => {
  const response = await handleAdminSystemApi(
    new Request("http://localhost/api/admin/system-status?site=taijuda"),
    { DB: db },
  );
  assert.equal(response?.status, 200);
  const payload = await response.json();
  assert.equal(payload.site.code, "taijuda");
  assert.equal(payload.runtime.mode, "local");
  assert.equal(payload.runtime.schemaVersion, 11);
  assert.equal(payload.publishing.inSync, false);
  assert.match(payload.publishing.snapshotHash, /^[a-f0-9]{16,64}$/);
  assert.ok(payload.content.articles.total >= payload.content.articles.published);
  assert.ok(payload.content.pages.total >= payload.content.pages.published);
  assert.ok(payload.commerce.products.total >= payload.commerce.products.active);
  assert.equal(payload.commerce.inventory.trackedProducts, payload.commerce.products.total);
  assert.equal(payload.commerce.orders.total, 0);
  assert.doesNotMatch(JSON.stringify(payload), /customer_name|customer_phone|customer_email|line_id/i);
});

test("admin status rejects unauthenticated non-local requests", async () => {
  const response = await handleAdminSystemApi(
    new Request("https://admin.example/api/admin/system-status?site=taijuda"),
    { DB: db, ADMIN_EMAIL_ALLOWLIST: "owner@example.com" },
  );
  assert.equal(response?.status, 401);
});

test("publishing signature detects inventory-only stock changes", () => {
  const snapshotProducts = [{
    id: "product-versioned-stock",
    version: 3,
    inventoryVersion: 7,
    stock: 2,
  }];
  const matchingLiveProducts = [{
    id: "product-versioned-stock",
    version: 3,
    inventory_version: 7,
    available_stock: 2,
  }];
  const reservedLiveProducts = [{
    id: "product-versioned-stock",
    version: 3,
    inventory_version: 8,
    available_stock: 1,
  }];

  assert.equal(
    productVersionSignature(matchingLiveProducts),
    productVersionSignature(snapshotProducts),
  );
  assert.notEqual(
    productVersionSignature(reservedLiveProducts),
    productVersionSignature(snapshotProducts),
  );
});
