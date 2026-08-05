import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SafePublicImage, safePublicImageUrl } from "../app/product-artwork.tsx";

const snapshot = JSON.parse(await readFile(
  new URL("../content/published-site.json", import.meta.url),
  "utf8",
));
const publishedArticles = snapshot.articles;

let workerPromise;

async function getWorker() {
  if (!workerPromise) {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("article-test", `${process.pid}-${Date.now()}`);
    workerPromise = import(workerUrl.href).then((module) => module.default);
  }
  return workerPromise;
}

async function renderRoute(pathname) {
  const worker = await getWorker();
  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("the published snapshot defines unique SEO article routes", () => {
  assert.ok(publishedArticles.length > 0);
  assert.equal(
    new Set(publishedArticles.map((article) => article.slug)).size,
    publishedArticles.length,
  );

  for (const article of publishedArticles) {
    assert.match(article.slug, /^[\p{Letter}\p{Number}]+(?:-[\p{Letter}\p{Number}]+)*$/u);
    assert.ok(article.title.length > 0);
    assert.ok(article.seoTitle.length >= 8);
    assert.ok(article.seoDescription.length >= 50);
    assert.equal(typeof article.noindex, "boolean");
    assert.equal(article.status, "published");
    assert.equal(article.contentJson.type, "doc");
    assert.ok(Number.isFinite(Date.parse(article.publishedAt)));
    assert.ok(Number.isFinite(Date.parse(article.updatedAt)));
  }
});

test("the article index renders a crawlable collection and links every snapshot article", async () => {
  const response = await renderRoute("/articles/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<h1[^>]*>泰聚達收藏誌<\/h1>/);
  assert.match(html, /"@type":"CollectionPage"/);
  assert.match(html, /"@type":"ItemList"/);
  assert.match(html, /"@type":"BreadcrumbList"/);
  assert.match(html, /aria-label="麵包屑"/);
  for (const article of publishedArticles) {
    assert.ok(html.includes(article.title), `${article.slug} is missing from the article index`);
    assert.match(html, new RegExp(`href="[^"]*\/articles\/${article.slug}\/?"`));
  }
});

test("every published article route renders independent SEO and structured data", async () => {
  for (const article of publishedArticles) {
    const response = await renderRoute(`/articles/${encodeURIComponent(article.slug)}/`);
    assert.equal(response.status, 200, article.slug);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

    const html = await response.text();
    assert.ok(html.includes(article.title), `${article.slug} title is missing`);
    assert.ok(html.includes(article.seoDescription), `${article.slug} description is missing`);
    assert.match(html, new RegExp(`rel="canonical"[^>]+articles/${article.slug}/`));
    assert.match(
      html,
      article.noindex
        ? /<meta[^>]+name="robots"[^>]+content="noindex, follow"/i
        : /<meta[^>]+name="robots"[^>]+content="index, follow"/i,
    );
    assert.match(html, /<meta[^>]+property="og:type"[^>]+content="article"/i);
    assert.match(html, /"@type":"Article"/);
    assert.match(html, /"@type":"BreadcrumbList"/);
    assert.ok(html.includes(`"datePublished":"${article.publishedAt}"`));
    assert.ok(html.includes(`"dateModified":"${article.updatedAt}"`));
    assert.match(html, /aria-label="麵包屑"/);
    assert.match(html, /href="[^"]*\/articles\/"[^>]*>← 返回泰聚達收藏誌/);
  }
});

test("an unknown article slug returns a real 404", async () => {
  const response = await renderRoute("/articles/not-a-published-article/");
  assert.equal(response.status, 404);
});

test("Tiptap renderer never inserts editor HTML directly", async () => {
  const source = await readFile(new URL("../app/article-content.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|innerHTML\s*=|javascript:/i);
  assert.match(source, /safeArticleLinkHref/);
  assert.match(source, /MAX_DOCUMENT_DEPTH/);
});

test("public image fields accept only safe HTTP sources and preserve a Pages base path", () => {
  assert.equal(safePublicImageUrl("/media/amulet.webp"), "/media/amulet.webp");
  assert.equal(
    safePublicImageUrl("/media/amulet.webp", "https://example.com/archive/"),
    "https://example.com/archive/media/amulet.webp",
  );
  assert.equal(
    safePublicImageUrl("https://cdn.example.com/article.webp"),
    "https://cdn.example.com/article.webp",
  );
  for (const unsafe of [
    "javascript:alert(1)",
    "data:image/svg+xml,<svg/>",
    "//cdn.example.com/image.webp",
    "/\\cdn.example.com/image.webp",
    "https://user:secret@example.com/image.webp",
    "https://example.com/image.webp\u0000",
  ]) assert.equal(safePublicImageUrl(unsafe), "", unsafe);

  const imageHtml = renderToStaticMarkup(createElement(SafePublicImage, {
    src: "https://cdn.example.com/amulet.webp",
    alt: "佛牌正面實拍",
  }));
  assert.match(imageHtml, /<img[^>]+src="https:\/\/cdn\.example\.com\/amulet\.webp"/);
  assert.match(imageHtml, /alt="佛牌正面實拍"/);

  const fallbackHtml = renderToStaticMarkup(createElement(SafePublicImage, {
    src: "data:image/svg+xml,<svg/>",
    alt: "不安全圖片",
    fallback: createElement("span", null, "圖片載入失敗"),
  }));
  assert.equal(fallbackHtml, "<span>圖片載入失敗</span>");
});

test("article routes connect hero image fields to the safe image fallback", async () => {
  const source = await readFile(new URL("../app/articles/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(source, /article\.heroImageUrl/);
  assert.match(source, /article\.heroImageAlt/);
  assert.match(source, /<SafePublicImage/);
  assert.match(source, /首圖暫時無法顯示/);
});
