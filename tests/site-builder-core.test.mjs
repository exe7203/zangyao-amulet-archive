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
    "CREATE TABLE site_settings (site_id TEXT PRIMARY KEY NOT NULL, settings_json TEXT NOT NULL DEFAULT '{}', theme_json TEXT NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 1, updated_by TEXT NOT NULL DEFAULT 'system', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE site_pages (id TEXT PRIMARY KEY NOT NULL, site_id TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, data_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', seo_title TEXT NOT NULL DEFAULT '', seo_description TEXT NOT NULL DEFAULT '', canonical_url TEXT NOT NULL DEFAULT '', og_image_url TEXT NOT NULL DEFAULT '', noindex INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, published_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE site_page_revisions (id TEXT PRIMARY KEY NOT NULL, page_id TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, data_json TEXT NOT NULL, status TEXT NOT NULL, seo_title TEXT NOT NULL DEFAULT '', seo_description TEXT NOT NULL DEFAULT '', canonical_url TEXT NOT NULL DEFAULT '', og_image_url TEXT NOT NULL DEFAULT '', noindex INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL, saved_by TEXT NOT NULL DEFAULT 'system', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE UNIQUE INDEX site_pages_site_slug_unique ON site_pages (site_id, slug)",
    "CREATE UNIQUE INDEX site_page_revisions_page_version_unique ON site_page_revisions (page_id, version)",
  ]) await db.prepare(statement).run();
  await db.batch([
    db.prepare("INSERT INTO schema_metadata (key, value) VALUES ('schema_version', '7')"),
    db.prepare("INSERT INTO sites (id, code, name) VALUES ('site_taijuda', 'taijuda', '泰聚達')"),
  ]);
});

test("site identity settings are versioned, sanitized, and available to the public storefront", async () => {
  const initialResponse = await handleSiteApi(
    jsonRequest("/api/admin/site-settings?site=taijuda"),
    { DB: db },
  );
  assert.equal(initialResponse?.status, 200);
  const initial = await initialResponse.json();

  const saveResponse = await handleSiteApi(jsonRequest("/api/admin/site-settings", "POST", {
    siteCode: "taijuda",
    version: initial.siteSettings.version,
    settings: {
      announcement: "來源清楚，安心收藏",
      brandName: "泰聚達",
      brandSubtitle: "TAIJUDA ARCHIVE",
      footerNote: "正式商品均須完成來源與實物覆核。",
      secretInternalNote: "must-not-be-stored",
    },
    theme: { accent: "#b89048", surface: "#faf7ef", ink: "javascript:alert(1)" },
  }), { DB: db });
  assert.equal(saveResponse?.status, 200);

  const publicResponse = await handleSiteApi(
    jsonRequest("/api/content/site-settings?site=taijuda"),
    { DB: db },
  );
  assert.equal(publicResponse?.status, 200);
  const payload = await publicResponse.json();
  assert.equal(payload.siteSettings.settings.announcement, "來源清楚，安心收藏");
  assert.equal(payload.siteSettings.theme.accent, "#b89048");
  assert.equal(payload.siteSettings.theme.ink, "#171713");
  assert.equal(payload.siteSettings.settings.secretInternalNote, undefined);
  assert.equal(payload.siteSettings.updatedBy, undefined);
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

  const historyResponse = await handleSiteApi(
    jsonRequest(`/api/admin/pages/${encodeURIComponent(updated.page.id)}/revisions?site=taijuda`),
    { DB: db },
  );
  assert.equal(historyResponse?.status, 200);
  const history = await historyResponse.json();
  assert.deepEqual(history.revisions.map((revision) => revision.version).sort(), [1, 2]);
  const firstRevision = history.revisions.find((revision) => revision.version === 1);

  const restoreResponse = await handleSiteApi(
    jsonRequest(`/api/admin/pages/${encodeURIComponent(updated.page.id)}/revisions`, "POST", {
      siteCode: "taijuda",
      revisionId: firstRevision.revisionId,
      version: 2,
    }),
    { DB: db },
  );
  assert.equal(restoreResponse?.status, 200);
  const restored = await restoreResponse.json();
  assert.equal(restored.page.title, "收藏入門頁");
  assert.equal(restored.page.status, "draft");
  assert.equal(restored.page.version, 3);

  const staleRestoreResponse = await handleSiteApi(
    jsonRequest(`/api/admin/pages/${encodeURIComponent(updated.page.id)}/revisions`, "POST", {
      siteCode: "taijuda",
      revisionId: firstRevision.revisionId,
      version: 2,
    }),
    { DB: db },
  );
  assert.equal(staleRestoreResponse?.status, 409);

  const revisions = await db.prepare("SELECT version, status, saved_by FROM site_page_revisions WHERE page_id = ? ORDER BY version")
    .bind(updated.page.id).all();
  assert.deepEqual(revisions.results, [
    { version: 1, status: "published", saved_by: "local-preview" },
    { version: 2, status: "published", saved_by: "local-preview" },
    { version: 3, status: "draft", saved_by: "local-preview" },
  ]);
});
