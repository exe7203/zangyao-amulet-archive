import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  fallbackArticles,
  resolveJournalApiResult,
} from "../app/article-data.ts";

let workerPromise;

async function getWorker() {
  if (!workerPromise) {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("article-test", `${process.pid}-${Date.now()}`);
    workerPromise = import(workerUrl.href).then((module) => module.default);
  }
  return workerPromise;
}

async function renderArticle(slug) {
  const worker = await getWorker();
  return worker.fetch(
    new Request(`http://localhost/articles/${slug}/`, {
      headers: { accept: "text/html" },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("the fallback snapshot defines three unique, indexable SEO articles", () => {
  assert.equal(fallbackArticles.length, 3);
  assert.equal(new Set(fallbackArticles.map((article) => article.slug)).size, 3);

  for (const article of fallbackArticles) {
    assert.match(article.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(article.title.length > 0);
    assert.ok(article.seoTitle.length > 0);
    assert.ok(article.seoDescription.length >= 50);
    assert.equal(article.noindex, false);
    assert.equal(article.status, "published");
    assert.equal(article.contentJson.type, "doc");
  }
});

test("journal API fallback is limited to 404 and 503", () => {
  for (const status of [404, 503]) {
    const result = resolveJournalApiResult(status);
    assert.equal(result.state, "fallback");
    assert.equal(result.articles.length, fallbackArticles.length);
  }

  for (const status of [400, 401, 500, 502]) {
    const result = resolveJournalApiResult(status, { articles: fallbackArticles });
    assert.deepEqual(result, { state: "error", articles: [] });
  }
});

test("a successful empty journal response produces an explicit empty state", () => {
  assert.deepEqual(
    resolveJournalApiResult(200, { articles: [] }),
    { state: "empty", articles: [] },
  );
  assert.deepEqual(
    resolveJournalApiResult(200, { articles: [{ status: "draft" }] }),
    { state: "empty", articles: [] },
  );
});

test("published API articles are normalized while unsafe slugs are excluded", () => {
  const contentJson = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "可閱讀內容" }] }],
  };
  const result = resolveJournalApiResult(200, {
    articles: [
      { id: "safe", slug: "safe-article", title: "安全文章", status: "published", contentJson },
      { id: "unsafe", slug: "../service/contact", title: "錯誤路徑", status: "published", contentJson },
    ],
  });

  assert.equal(result.state, "published");
  assert.deepEqual(result.articles.map((article) => article.slug), ["safe-article"]);
});

test("every fallback article route renders independent SEO and structured data", async () => {
  for (const article of fallbackArticles) {
    const response = await renderArticle(article.slug);
    assert.equal(response.status, 200, article.slug);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

    const html = await response.text();
    assert.ok(html.includes(article.title), `${article.slug} title is missing`);
    assert.ok(html.includes(article.seoDescription), `${article.slug} description is missing`);
    assert.match(html, new RegExp(`rel="canonical"[^>]+articles/${article.slug}/`));
    assert.match(html, /<meta[^>]+name="robots"[^>]+content="index, follow"/i);
    assert.match(html, /<meta[^>]+property="og:type"[^>]+content="article"/i);
    assert.match(html, /"@type":"Article"/);
    assert.match(html, /"@type":"BreadcrumbList"/);
    assert.match(html, /aria-label="麵包屑"/);
    assert.match(html, /返回泰聚達收藏誌/);
  }
});

test("Tiptap renderer never inserts editor HTML directly", async () => {
  const source = await readFile(new URL("../app/article-content.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|innerHTML\s*=|javascript:/i);
  assert.match(source, /safeArticleLinkHref/);
  assert.match(source, /MAX_DOCUMENT_DEPTH/);
});
