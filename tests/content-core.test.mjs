import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Miniflare } from "miniflare";
import {
  ARTICLE_PUBLISH_ERROR_MESSAGE,
  ARTICLE_PUBLISH_REQUIREMENTS,
  articleDocumentTextLength,
  evaluateArticlePublishReadiness,
} from "../lib/article-content-contract.ts";
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
    "CREATE TABLE articles (id TEXT PRIMARY KEY NOT NULL, site_id TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, excerpt TEXT NOT NULL DEFAULT '', content_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', seo_title TEXT NOT NULL DEFAULT '', seo_description TEXT NOT NULL DEFAULT '', canonical_url TEXT NOT NULL DEFAULT '', og_image_url TEXT NOT NULL DEFAULT '', tag TEXT NOT NULL DEFAULT '佛牌知識', keywords_json TEXT NOT NULL DEFAULT '[]', hero_image_url TEXT NOT NULL DEFAULT '', hero_image_alt TEXT NOT NULL DEFAULT '', noindex INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, published_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE article_revisions (id TEXT PRIMARY KEY NOT NULL, article_id TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, excerpt TEXT NOT NULL DEFAULT '', content_json TEXT NOT NULL, seo_title TEXT NOT NULL DEFAULT '', seo_description TEXT NOT NULL DEFAULT '', canonical_url TEXT NOT NULL DEFAULT '', og_image_url TEXT NOT NULL DEFAULT '', tag TEXT NOT NULL DEFAULT '佛牌知識', keywords_json TEXT NOT NULL DEFAULT '[]', hero_image_url TEXT NOT NULL DEFAULT '', hero_image_alt TEXT NOT NULL DEFAULT '', noindex INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL, saved_by TEXT NOT NULL DEFAULT 'system', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE UNIQUE INDEX articles_site_slug_unique ON articles (site_id, slug)",
    "CREATE INDEX article_revisions_article_idx ON article_revisions (article_id, created_at)",
  ]) await db.prepare(statement).run();
  await db.batch([
    db.prepare("INSERT INTO schema_metadata (key, value) VALUES ('schema_version', '7')"),
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

  const publishedText = "第二版已發布正文".repeat(40);
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

  const staleArchiveResponse = await handleContentApi(
    request(`/api/admin/articles/${encodeURIComponent(articleId)}?site=taijuda`, "DELETE", {
      siteCode: "taijuda",
      expectedVersion: 2,
    }),
    { DB: db },
  );
  assert.equal(staleArchiveResponse?.status, 409);

  const archiveResponse = await handleContentApi(
    request(`/api/admin/articles/${encodeURIComponent(articleId)}?site=taijuda`, "DELETE", {
      siteCode: "taijuda",
      expectedVersion: 3,
    }),
    { DB: db },
  );
  assert.equal(archiveResponse?.status, 200);
  assert.deepEqual(await archiveResponse.json(), { ok: true, version: 4 });

  const archivedArticle = await db.prepare(
    "SELECT status, version FROM articles WHERE id = ?",
  ).bind(articleId).first();
  assert.deepEqual(archivedArticle, { status: "archived", version: 4 });
  const archivedHistory = await db.prepare(
    "SELECT version, status FROM article_revisions WHERE article_id = ? ORDER BY version",
  ).bind(articleId).all();
  assert.deepEqual(archivedHistory.results, [
    { version: 1, status: "draft" },
    { version: 2, status: "published" },
    { version: 3, status: "draft" },
    { version: 4, status: "archived" },
  ]);
});

test("article publishing requires 300 body characters and keeps summary and SEO gates", async () => {
  const document = (text) => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
  const validMetadata = {
    excerpt: "這是一段超過二十個字並可提供搜尋摘要使用的完整文章摘要。",
    seoTitle: "符合發布條件的 SEO 文章標題",
    seoDescription: "這是一段超過五十個字的搜尋描述，用來證明文章發布時仍會保留摘要、SEO 標題、SEO 描述與正文長度等所有必要條件。",
  };
  const shortDocument = document("字".repeat(ARTICLE_PUBLISH_REQUIREMENTS.bodyTextLength - 1));
  assert.equal(articleDocumentTextLength(shortDocument), 299);
  assert.equal(evaluateArticlePublishReadiness({ ...validMetadata, contentJson: shortDocument }).bodyReady, false);

  const shortResponse = await saveArticle({
    siteCode: "taijuda",
    slug: "too-short-to-publish",
    title: "正文不足三百字",
    ...validMetadata,
    contentJson: shortDocument,
    status: "published",
    version: 0,
  });
  assert.equal(shortResponse.response.status, 400);
  assert.equal(shortResponse.payload.error, ARTICLE_PUBLISH_ERROR_MESSAGE);

  await db.prepare(`INSERT INTO articles (
    id, site_id, slug, title, excerpt, content_json, status, seo_title,
    seo_description, noindex, version, published_at
  ) VALUES (?, 'site_taijuda', ?, ?, ?, ?, 'published', ?, ?, 0, 1, ?)`)
    .bind(
      "legacy-short-demo",
      "legacy-short-demo",
      "既有短篇示範文章",
      validMetadata.excerpt,
      JSON.stringify(shortDocument),
      validMetadata.seoTitle,
      validMetadata.seoDescription,
      new Date().toISOString(),
    )
    .run();
  const legacyPublicResponse = await handleContentApi(
    request("/api/content/articles/legacy-short-demo?site=taijuda"),
    { DB: db },
  );
  assert.equal(legacyPublicResponse?.status, 200);
  const legacyPublic = await legacyPublicResponse.json();
  assert.equal(legacyPublic.article.noindex, true);

  const completeDocument = document("字".repeat(ARTICLE_PUBLISH_REQUIREMENTS.bodyTextLength));
  const missingSummaryResponse = await saveArticle({
    siteCode: "taijuda",
    slug: "missing-summary-gate",
    title: "摘要條件仍須保留",
    ...validMetadata,
    excerpt: "摘要太短",
    contentJson: completeDocument,
    status: "published",
    version: 0,
  });
  assert.equal(missingSummaryResponse.response.status, 400);
  assert.equal(missingSummaryResponse.payload.error, ARTICLE_PUBLISH_ERROR_MESSAGE);

  const accepted = await saveArticle({
    siteCode: "taijuda",
    slug: "exact-publish-threshold",
    title: "剛好符合發布條件",
    ...validMetadata,
    contentJson: completeDocument,
    status: "published",
    version: 0,
  });
  assert.equal(accepted.response.status, 201);
  assert.equal(accepted.payload.article.status, "published");
});

test("article API accepts the editor whitelist and rejects hidden public-renderer drift", async () => {
  const richDocument = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "來源整理" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "可查證來源", marks: [{ type: "bold" }, { type: "link", attrs: { href: "https://example.com/source", target: null, rel: null, class: null, title: null } }] },
          { type: "hardBreak" },
          { type: "text", text: "補充說明", marks: [{ type: "underline" }] },
        ],
      },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "項目" }] }] }] },
      { type: "orderedList", attrs: { start: 1, type: null }, content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "步驟" }] }] }] },
      { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "引用" }] }] },
      { type: "codeBlock", attrs: { language: null }, content: [{ type: "text", text: "source: verified" }] },
      {
        type: "image",
        attrs: {
          src: "https://cdn.example.com/article-detail.webp",
          alt: "佛牌背面印記細節",
          caption: "公開來源圖片，館藏編號 TJD-01",
          title: null,
          width: null,
          height: null,
        },
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null }, content: [{ type: "paragraph", content: [{ type: "text", text: "年代" }] }] },
              { type: "tableHeader", attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null }, content: [{ type: "paragraph", content: [{ type: "text", text: "材質" }] }] },
            ],
          },
          {
            type: "tableRow",
            content: [
              { type: "tableCell", attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null }, content: [{ type: "paragraph", content: [{ type: "text", text: "佛曆 2520" }] }] },
              { type: "tableCell", attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null }, content: [{ type: "paragraph", content: [{ type: "text", text: "粉質" }] }] },
            ],
          },
        ],
      },
      { type: "horizontalRule" },
    ],
  };
  const accepted = await saveArticle({ siteCode: "taijuda", slug: "rich-editor-contract", title: "完整格式測試", contentJson: richDocument, status: "draft", version: 0 });
  assert.equal(accepted.response.status, 201);
  assert.deepEqual(accepted.payload.article.contentJson, richDocument);

  const invalidHeading = await saveArticle({
    siteCode: "taijuda",
    slug: "invalid-heading",
    title: "錯誤標題層級",
    contentJson: { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "不可使用 H1" }] }] },
    status: "draft",
    version: 0,
  });
  assert.equal(invalidHeading.response.status, 400);

  const unsafeLink = await saveArticle({
    siteCode: "taijuda",
    slug: "unsafe-link",
    title: "不安全連結",
    contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "連結", marks: [{ type: "link", attrs: { href: "//evil.example" } }] }] }] },
    status: "draft",
    version: 0,
  });
  assert.equal(unsafeLink.response.status, 400);

  const missingImageAlt = await saveArticle({
    siteCode: "taijuda",
    slug: "missing-image-alt",
    title: "缺少圖片替代文字",
    contentJson: { type: "doc", content: [{ type: "image", attrs: { src: "https://example.com/photo.jpg", alt: "", caption: null, title: null, width: null, height: null } }] },
    status: "draft",
    version: 0,
  });
  assert.equal(missingImageAlt.response.status, 400);

  const unsafeImage = await saveArticle({
    siteCode: "taijuda",
    slug: "unsafe-inline-image",
    title: "不安全內文圖片",
    contentJson: { type: "doc", content: [{ type: "image", attrs: { src: "https://user:secret@example.com/photo.jpg", alt: "不安全圖片", caption: null, title: null, width: null, height: null } }] },
    status: "draft",
    version: 0,
  });
  assert.equal(unsafeImage.response.status, 400);

  const oversizedImage = await saveArticle({
    siteCode: "taijuda",
    slug: "oversized-inline-image",
    title: "超出限制內文圖片",
    contentJson: { type: "doc", content: [{ type: "image", attrs: { src: "https://example.com/photo.jpg", alt: "替".repeat(301), caption: null, title: null, width: null, height: null } }] },
    status: "draft",
    version: 0,
  });
  assert.equal(oversizedImage.response.status, 400);

  const malformedTable = await saveArticle({
    siteCode: "taijuda",
    slug: "malformed-inline-table",
    title: "結構錯誤表格",
    contentJson: {
      type: "doc",
      content: [{
        type: "table",
        content: [
          { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph" }] }, { type: "tableHeader", content: [{ type: "paragraph" }] }] },
          { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph" }] }] },
        ],
      }],
    },
    status: "draft",
    version: 0,
  });
  assert.equal(malformedTable.response.status, 400);

  const oversizedTable = await saveArticle({
    siteCode: "taijuda",
    slug: "oversized-inline-table",
    title: "超出限制表格",
    contentJson: {
      type: "doc",
      content: [{
        type: "table",
        content: [{
          type: "tableRow",
          content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "字".repeat(2001) }] }] }],
        }],
      }],
    },
    status: "draft",
    version: 0,
  });
  assert.equal(oversizedTable.response.status, 400);
});

test("admin article list searches, filters, paginates, and escapes LIKE wildcards", async () => {
  const document = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });
  const rows = [
    ["list-audit-a", "list-audit-a", "稽核清單 LIST%_TOKEN", "draft", "2026-08-12T08:05:00.000Z"],
    ["list-audit-b", "list-audit-b", "稽核清單 第二篇", "draft", "2026-08-12T08:04:00.000Z"],
    ["list-audit-c", "list-audit-c", "稽核清單 第三篇", "draft", "2026-08-12T08:03:00.000Z"],
    ["list-audit-d", "list-audit-d", "稽核清單 已發布", "published", "2026-08-12T08:02:00.000Z"],
    ["list-audit-e", "list-audit-e", "稽核清單 已封存", "archived", "2026-08-12T08:01:00.000Z"],
  ];
  await db.batch(rows.map(([id, slug, title, status, updatedAt]) => db.prepare(`INSERT INTO articles (
    id, site_id, slug, title, excerpt, content_json, status, tag, updated_at
  ) VALUES (?, 'site_taijuda', ?, ?, '分頁測試摘要', ?, ?, '清單稽核', ?)`)
    .bind(id, slug, title, document, status, updatedAt)));

  const filteredResponse = await handleContentApi(
    request("/api/admin/articles?site=taijuda&q=%E7%A8%BD%E6%A0%B8%E6%B8%85%E5%96%AE&status=draft&page=1&limit=2"),
    { DB: db },
  );
  assert.equal(filteredResponse?.status, 200);
  const filtered = await filteredResponse.json();
  assert.equal(filtered.site.code, "taijuda");
  assert.equal(filtered.articles.length, 2);
  assert.ok(filtered.articles.every((article) => article.status === "draft"));
  assert.deepEqual(filtered.pagination, {
    page: 1,
    limit: 2,
    maxLimit: 100,
    total: 3,
    totalPages: 2,
    returned: 2,
  });

  const secondPageResponse = await handleContentApi(
    request("/api/admin/articles?site=taijuda&q=%E7%A8%BD%E6%A0%B8%E6%B8%85%E5%96%AE&status=draft&page=2&limit=2"),
    { DB: db },
  );
  const secondPage = await secondPageResponse.json();
  assert.equal(secondPage.articles.length, 1);
  assert.equal(secondPage.pagination.returned, 1);

  const outOfRangeResponse = await handleContentApi(
    request("/api/admin/articles?site=taijuda&q=%E7%A8%BD%E6%A0%B8%E6%B8%85%E5%96%AE&status=draft&page=99&limit=2"),
    { DB: db },
  );
  const outOfRange = await outOfRangeResponse.json();
  assert.deepEqual(outOfRange.articles, []);
  assert.equal(outOfRange.pagination.page, 99);
  assert.equal(outOfRange.pagination.total, 3);
  assert.equal(outOfRange.pagination.returned, 0);

  const literalResponse = await handleContentApi(
    request(`/api/admin/articles?site=taijuda&q=${encodeURIComponent("LIST%_TOKEN")}`),
    { DB: db },
  );
  const literal = await literalResponse.json();
  assert.equal(literal.pagination.limit, 40);
  assert.equal(literal.pagination.total, 1);
  assert.equal(literal.articles[0].id, "list-audit-a");

  const cappedResponse = await handleContentApi(
    request("/api/admin/articles?site=taijuda&q=%E7%A8%BD%E6%A0%B8%E6%B8%85%E5%96%AE&limit=999"),
    { DB: db },
  );
  const capped = await cappedResponse.json();
  assert.equal(capped.pagination.limit, 100);
  assert.equal(capped.pagination.returned, 5);

  const invalidStatusResponse = await handleContentApi(
    request("/api/admin/articles?site=taijuda&status=unknown"),
    { DB: db },
  );
  assert.equal(invalidStatusResponse?.status, 400);
});
