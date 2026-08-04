import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Miniflare } from "miniflare";
import { createStarterPageData } from "../app/site-builder/types.ts";
import { validatePageData } from "../app/site-builder/validation.ts";
import { handleSiteApi } from "../worker/site-api.ts";

let miniflare;
let db;

function jsonRequest(path, method = "GET", body) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body ? { "content-type": "application/json", origin: "http://localhost" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

before(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    compatibilityDate: "2026-05-22",
    d1Databases: { DB: "site-builder-core-test" },
  });
  db = await miniflare.getD1Database("DB");
  for (const statement of [
    "CREATE TABLE schema_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE sites (id TEXT PRIMARY KEY NOT NULL, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, locale TEXT NOT NULL DEFAULT 'zh-Hant-TW', currency TEXT NOT NULL DEFAULT 'TWD', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE site_pages (id TEXT PRIMARY KEY NOT NULL, site_id TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, data_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', seo_title TEXT NOT NULL DEFAULT '', seo_description TEXT NOT NULL DEFAULT '', canonical_url TEXT NOT NULL DEFAULT '', og_image_url TEXT NOT NULL DEFAULT '', noindex INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, published_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE site_page_revisions (id TEXT PRIMARY KEY NOT NULL, page_id TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, data_json TEXT NOT NULL, status TEXT NOT NULL, seo_title TEXT NOT NULL DEFAULT '', seo_description TEXT NOT NULL DEFAULT '', canonical_url TEXT NOT NULL DEFAULT '', og_image_url TEXT NOT NULL DEFAULT '', noindex INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL, saved_by TEXT NOT NULL DEFAULT 'system', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE UNIQUE INDEX site_pages_site_slug_unique ON site_pages (site_id, slug)",
  ]) await db.prepare(statement).run();
  await db.batch([
    db.prepare("INSERT INTO schema_metadata (key, value) VALUES ('schema_version', '6')"),
    db.prepare("INSERT INTO sites (id, code, name) VALUES ('site_taijuda', 'taijuda', '泰聚達')"),
  ]);
});

after(async () => {
  await miniflare?.dispose();
});

test("Puck page validation rejects unsafe or ambiguous block documents", () => {
  const valid = createStarterPageData();
  assert.equal(validatePageData(valid).ok, true);

  const duplicateIds = structuredClone(valid);
  duplicateIds.content[1].props.id = duplicateIds.content[0].props.id;
  assert.equal(validatePageData(duplicateIds).ok, false);

  const unsafeLink = structuredClone(valid);
  unsafeLink.content[0].props.primaryHref = "javascript:alert(1)";
  assert.equal(validatePageData(unsafeLink).ok, false);

  const arbitraryHtml = structuredClone(valid);
  arbitraryHtml.content.push({ type: "RawHtml", props: { id: "raw", html: "<script>alert(1)</script>" } });
  assert.equal(validatePageData(arbitraryHtml).ok, false);
});

test("site editor publishes a versioned page and protects stale writes", async () => {
  const pageData = createStarterPageData();
  const initialResponse = await handleSiteApi(jsonRequest("/api/admin/pages", "POST", {
    siteCode: "taijuda",
    slug: "collection-guide",
    title: "收藏入門頁",
    data: pageData,
    status: "published",
    seoTitle: "泰國佛牌收藏入門頁｜泰聚達",
    seoDescription: "這是一段超過五十個字的網站頁面描述，用來確認頁面編輯器發布、版本控管、公開讀取與搜尋引擎欄位都能安全且一致地運作。",
    canonicalUrl: "",
    ogImageUrl: "",
    noindex: false,
    version: 0,
  }), { DB: db });
  assert.equal(initialResponse?.status, 201);
  const initial = await initialResponse.json();
  assert.equal(initial.page.version, 1);
  assert.equal(initial.page.status, "published");

  const staleResponse = await handleSiteApi(jsonRequest("/api/admin/pages", "POST", {
    ...initial.page,
    siteCode: "taijuda",
    title: "過期寫入不應成功",
    version: 0,
  }), { DB: db });
  assert.equal(staleResponse?.status, 409);

  const updatedResponse = await handleSiteApi(jsonRequest("/api/admin/pages", "POST", {
    ...initial.page,
    siteCode: "taijuda",
    title: "收藏入門頁第二版",
    version: 1,
  }), { DB: db });
  assert.equal(updatedResponse?.status, 200);
  const updated = await updatedResponse.json();
  assert.equal(updated.page.version, 2);

  const publicResponse = await handleSiteApi(
    jsonRequest("/api/content/pages/collection-guide?site=taijuda"),
    { DB: db },
  );
  assert.equal(publicResponse?.status, 200);
  const publicPayload = await publicResponse.json();
  assert.equal(publicPayload.page.title, "收藏入門頁第二版");
  assert.equal(publicPayload.page.status, "published");

  const revisions = await db.prepare("SELECT version, status, saved_by FROM site_page_revisions WHERE page_id = ? ORDER BY version")
    .bind(updated.page.id).all();
  assert.deepEqual(revisions.results, [
    { version: 1, status: "published", saved_by: "local-preview" },
    { version: 2, status: "published", saved_by: "local-preview" },
  ]);
});
