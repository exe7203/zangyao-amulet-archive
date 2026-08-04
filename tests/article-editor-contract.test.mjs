import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ArticleContent from "../app/article-content.tsx";
import {
  ARTICLE_HEADING_LEVELS,
  ARTICLE_MAX_DOCUMENT_DEPTH,
  ARTICLE_MARK_TYPES,
  ARTICLE_NODE_TYPES,
  articleHrefForPublicSite,
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
