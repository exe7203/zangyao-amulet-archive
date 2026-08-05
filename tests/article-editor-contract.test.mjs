import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ArticleContent from "../app/article-content.tsx";
import {
  ADMIN_IMAGE_ALT_MAX_LENGTH,
  ADMIN_IMAGE_URL_MAX_LENGTH,
  validateHttpUrlField,
  validateImagePair,
} from "../app/admin/image-field-contract.ts";
import {
  ARTICLE_HEADING_LEVELS,
  ARTICLE_MAX_DOCUMENT_DEPTH,
  ARTICLE_MARK_TYPES,
  ARTICLE_NODE_TYPES,
  ARTICLE_PUBLISH_ERROR_MESSAGE,
  ARTICLE_PUBLISH_REQUIREMENTS,
  articleHrefForPublicSite,
  evaluateArticlePublishReadiness,
  safeArticleLinkHref,
  validateArticleDocument,
} from "../lib/article-content-contract.ts";

test("article editor contract exposes the reviewed SEO-safe schema", () => {
  assert.deepEqual(ARTICLE_HEADING_LEVELS, [2, 3, 4]);
  assert.ok(ARTICLE_NODE_TYPES.includes("horizontalRule"));
  assert.ok(ARTICLE_NODE_TYPES.includes("codeBlock"));
  assert.ok(ARTICLE_MARK_TYPES.includes("underline"));
  assert.ok(ARTICLE_MARK_TYPES.includes("link"));
  assert.ok(!ARTICLE_NODE_TYPES.includes("image"));
  assert.ok(!ARTICLE_NODE_TYPES.includes("taskList"));
  assert.equal(ARTICLE_PUBLISH_REQUIREMENTS.bodyTextLength, 300);
  assert.match(ARTICLE_PUBLISH_ERROR_MESSAGE, /摘要（至少 20 字）.*SEO 標題（至少 8 字）.*SEO 描述（至少 50 字）.*正文（至少 300 字）/);
  assert.equal(evaluateArticlePublishReadiness({
    excerpt: "摘要太短",
    seoTitle: "完整 SEO 標題",
    seoDescription: "字".repeat(50),
    contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "字".repeat(300) }] }] },
  }).ok, false);
  assert.equal(articleHrefForPublicSite("/articles/example/", "/zangyao-amulet-archive"), "/zangyao-amulet-archive/articles/example/");
});

test("article links share one strict URL policy", () => {
  assert.equal(safeArticleLinkHref("/articles/example/"), "/articles/example/");
  assert.equal(safeArticleLinkHref("#source"), "#source");
  assert.equal(safeArticleLinkHref("mailto:editor@example.com"), "mailto:editor@example.com");
  assert.equal(safeArticleLinkHref("tel:+886912345678"), "tel:+886912345678");
  assert.equal(safeArticleLinkHref("https://example.com/source"), "https://example.com/source");
  assert.equal(safeArticleLinkHref("//evil.example"), null);
  assert.equal(safeArticleLinkHref("javascript:alert(1)"), null);
  assert.equal(safeArticleLinkHref("data:text/html,hello"), null);
  assert.equal(safeArticleLinkHref("https://user:password@example.com"), null);
});

test("all first-stage editor formatting renders as safe public HTML", () => {
  const document = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "二級標題" }] },
      { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "三級標題" }] },
      { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "四級標題" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "粗體", marks: [{ type: "bold" }] },
          { type: "text", text: "斜體", marks: [{ type: "italic" }] },
          { type: "text", text: "底線", marks: [{ type: "underline" }] },
          { type: "text", text: "刪除", marks: [{ type: "strike" }] },
          { type: "text", text: "程式", marks: [{ type: "code" }] },
          { type: "hardBreak" },
          { type: "text", text: "外部來源", marks: [{ type: "link", attrs: { href: "https://example.com/source" } }] },
          { type: "text", text: "站內來源", marks: [{ type: "link", attrs: { href: "/articles/source/" } }] },
        ],
      },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "項目" }] }] }] },
      { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "步驟" }] }] }] },
      { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "引用" }] }] },
      { type: "codeBlock", attrs: { language: null }, content: [{ type: "text", text: "const source = true" }] },
      { type: "horizontalRule" },
    ],
  };

  assert.equal(validateArticleDocument(document), true);
  const previousBasePath = process.env.PAGES_BASE_PATH;
  process.env.PAGES_BASE_PATH = "/zangyao-amulet-archive";
  const html = renderToStaticMarkup(createElement(ArticleContent, { content: document }));
  if (previousBasePath === undefined) delete process.env.PAGES_BASE_PATH;
  else process.env.PAGES_BASE_PATH = previousBasePath;
  for (const fragment of ["<h2>", "<h3>", "<h4>", "<strong>", "<em>", "<u>", "<s>", "<code>", "<br/>", "<ul>", "<ol>", "<blockquote>", "<pre>", "<hr/>"]) {
    assert.ok(html.includes(fragment), `missing rendered fragment: ${fragment}`);
  }
  assert.match(html, /href="https:\/\/example\.com\/source" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /href="\/zangyao-amulet-archive\/articles\/source\/">站內來源<\/a>/);
  assert.doesNotMatch(html, /dangerouslySetInnerHTML|<script|onerror=|javascript:/i);
});

test("shared validation rejects content deeper than the public renderer", () => {
  let nested = { type: "text", text: "不應消失的內容" };
  for (let index = 0; index <= ARTICLE_MAX_DOCUMENT_DEPTH; index += 1) {
    nested = { type: "paragraph", content: [nested] };
  }
  assert.equal(validateArticleDocument({ type: "doc", content: [nested] }), false);
});

test("admin image fields reject unsafe or overlong values before submission", () => {
  assert.equal(ADMIN_IMAGE_URL_MAX_LENGTH, 1000);
  assert.equal(ADMIN_IMAGE_ALT_MAX_LENGTH, 300);
  assert.equal(validateHttpUrlField("", "圖片 URL"), null);
  assert.equal(validateHttpUrlField("https://cdn.example.com/image.webp", "圖片 URL"), null);
  assert.equal(validateHttpUrlField("http://cdn.example.com/image.webp", "圖片 URL"), null);

  for (const unsafe of [
    "/local/image.webp",
    "//cdn.example.com/image.webp",
    "javascript:alert(1)",
    "data:image/svg+xml,<svg/>",
    "https://user:secret@cdn.example.com/image.webp",
  ]) assert.match(validateHttpUrlField(unsafe, "圖片 URL") || "", /http 或 https 公開網址/);

  assert.match(
    validateHttpUrlField(`https://example.com/${"a".repeat(1000)}`, "圖片 URL") || "",
    /不可超過 1000 個字元/,
  );
  assert.match(validateImagePair({
    url: "https://cdn.example.com/image.webp",
    alt: "",
    urlLabel: "商品主圖 URL",
    altLabel: "主圖替代文字",
  }) || "", /主圖替代文字不可留白/);
  assert.match(validateImagePair({
    url: "",
    alt: "替".repeat(301),
    urlLabel: "文章首圖 URL",
    altLabel: "首圖替代文字",
  }) || "", /不可超過 300 個字元/);
  assert.equal(validateImagePair({
    url: "https://cdn.example.com/image.webp",
    alt: "佛牌正面實拍",
    urlLabel: "商品主圖 URL",
    altLabel: "主圖替代文字",
  }), null);
});

test("product and article editors wire safe previews, limits, and pre-save errors", async () => {
  const [productSource, articleSource] = await Promise.all([
    readFile(new URL("../app/admin/store-manager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/admin-shell.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(productSource, /<ProductArtwork/);
  assert.match(productSource, /maxLength=\{ADMIN_IMAGE_URL_MAX_LENGTH\}/);
  assert.match(productSource, /maxLength=\{ADMIN_IMAGE_ALT_MAX_LENGTH\}/);
  assert.match(productSource, /if \(productImageError\) \{ setError\(productImageError\); return; \}/);

  assert.match(articleSource, /function ArticleMediaPreview/);
  assert.match(articleSource, /<SafePublicImage/);
  assert.match(articleSource, /maxLength=\{ADMIN_IMAGE_URL_MAX_LENGTH\}/);
  assert.match(articleSource, /maxLength=\{ADMIN_IMAGE_ALT_MAX_LENGTH\}/);
  assert.match(articleSource, /const mediaFieldError = heroImageError \|\| ogImageError \|\| canonicalUrlError/);
  assert.match(articleSource, /ARTICLE_PUBLISH_ERROR_MESSAGE/);
  assert.match(articleSource, /evaluateArticlePublishReadiness/);
  assert.match(articleSource, /ARTICLE_PUBLISH_REQUIREMENTS\.bodyTextLength/);
});
