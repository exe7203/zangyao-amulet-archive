import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Miniflare } from "miniflare";
import { handleContentApi } from "../worker/content-api.ts";

let miniflare;
let db;

function request(path, method = "GET", body) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body ? { "content-type": "application/json", origin: "http://localhost" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function saveArticle(body) {
  const response = await handleContentApi(request("/api/admin/articles", "POST", body), { DB: db });
  assert.ok(response, "content API did not handle the article request");
  return { response, payload: await response.json() };
}

before(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    compatibilityDate: "2026-05-22",
    d1Databases: { DB: "content-core-test" },
  });
  db = await miniflare.getD1Database("DB");
  for (const statement of [
    "CREATE TABLE schema_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE sites (id TEXT PRIMARY KEY NOT NULL, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, locale TEXT NOT NULL DEFAULT 'zh-Hant-TW', currency TEXT NOT NULL DEFAULT 'TWD', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE articles (id TEXT PRIMARY KEY NOT NULL, site_id TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, excerpt TEXT NOT NULL DEFAULT '', content_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', seo_title TEXT NOT NULL DEFAULT '', seo_description TEXT NOT NULL DEFAULT '', canonical_url TEXT NOT NULL DEFAULT '', og_image_url TEXT NOT NULL DEFAULT '', tag TEXT NOT NULL DEFAULT '收藏誌', keywords_json TEXT NOT NULL DEFAULT '[]', hero_image_url TEXT NOT NULL DEFAULT '', hero_image_alt TEXT NOT NULL DEFAULT '', noindex INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, published_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE article_revisions (id TEXT PRIMARY KEY NOT NULL, article_id TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, excerpt TEXT NOT NULL DEFAULT '', content_json TEXT NOT NULL, seo_title TEXT NOT NULL DEFAULT '', seo_description TEXT NOT NULL DEFAULT '', canonical_url TEXT NOT NULL DEFAULT '', og_image_url TEXT NOT NULL DEFAULT '', tag TEXT NOT NULL DEFAULT '收藏誌', keywords_json TEXT NOT NULL DEFAULT '[]', hero_image_url TEXT NOT NULL DEFAULT '', hero_image_alt TEXT NOT NULL DEFAULT '', noindex INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL, saved_by TEXT NOT NULL DEFAULT 'system', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE UNIQUE INDEX articles_site_slug_unique ON articles (site_id, slug)",
    "CREATE INDEX article_revisions_article_idx ON article_revisions (article_id, created_at)",
  ]) await db.prepare(statement).run();
  await db.batch([
    db.prepare("INSERT INTO schema_metadata (key, value) VALUES ('schema_version', '6')"),
    db.prepare("INSERT INTO sites (id, code, name) VALUES ('site_taijuda', 'taijuda', '泰聚達')"),
  ]);
});

after(async () => {
  await miniflare?.dispose();
});

test("article editor saves, detects stale versions, lists history, and restores to a new draft", async () => {
  const firstDocument = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "第一版文章內容，保留給版本還原測試。" }] }],
  };
  const created = await saveArticle({
    siteCode: "taijuda",
    slug: "versioned-article",
    title: "第一版標題",
    excerpt: "第一版摘要",
    contentJson: firstDocument,
    status: "draft",
    seoTitle: "第一版 SEO 標題",
    seoDescription: "第一版描述",
    tag: "測試",
    keywords: ["佛牌", "版本"],
    version: 0,
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.payload.article.version, 1);
  const articleId = created.payload.article.id;

  const publishedText = "第二版已發布正文".repeat(12);
  const published = await saveArticle({
    ...created.payload.article,
    id: articleId,
    siteCode: "taijuda",
    title: "第二版已發布標題",
    excerpt: "這是一段超過二十個字而且可供搜尋摘要使用的第二版文章摘要。",
    contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: publishedText }] }] },
    status: "published",
    seoTitle: "第二版完整 SEO 文章標題",
    seoDescription: "這是一段超過五十個字的第二版搜尋描述，用來確認文章發布檢查、版本紀錄與公開內容欄位都能正確工作並保留可查證內容。",
    version: 1,
  });
  assert.equal(published.response.status, 200);
  assert.equal(published.payload.article.version, 2);
  assert.equal(published.payload.article.status, "published");
  assert.ok(published.payload.article.publishedAt);

  const stale = await saveArticle({
    ...published.payload.article,
    siteCode: "taijuda",
    title: "不應覆蓋的新標題",
    version: 1,
  });
  assert.equal(stale.response.status, 409);

  const historyResponse = await handleContentApi(
    request(`/api/admin/articles/${encodeURIComponent(articleId)}/revisions?site=taijuda`),
    { DB: db },
  );
  assert.equal(historyResponse?.status, 200);
  const history = await historyResponse.json();
  assert.deepEqual(history.revisions.map((revision) => revision.version).sort(), [1, 2]);
  const firstRevision = history.revisions.find((revision) => revision.version === 1);

  const restoreResponse = await handleContentApi(
    request(`/api/admin/articles/${encodeURIComponent(articleId)}/revisions`, "POST", {
      siteCode: "taijuda",
      revisionId: firstRevision.revisionId,
      version: 2,
    }),
    { DB: db },
  );
  assert.equal(restoreResponse?.status, 200);
  const restored = await restoreResponse.json();
  assert.equal(restored.article.version, 3);
  assert.equal(restored.article.status, "draft");
  assert.equal(restored.article.title, "第一版標題");
  assert.deepEqual(restored.article.contentJson, firstDocument);

  const finalHistory = await db.prepare("SELECT version, status FROM article_revisions WHERE article_id = ? ORDER BY version")
    .bind(articleId).all();
  assert.deepEqual(finalHistory.results, [
    { version: 1, status: "draft" },
    { version: 2, status: "published" },
    { version: 3, status: "draft" },
  ]);
});
