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
  ARTICLE_IMAGE_ALT_MAX_LENGTH,
  ARTICLE_IMAGE_CAPTION_MAX_LENGTH,
  ARTICLE_IMAGE_URL_MAX_LENGTH,
  ARTICLE_MAX_DOCUMENT_DEPTH,
  ARTICLE_MARK_TYPES,
  ARTICLE_NODE_TYPES,
  ARTICLE_PUBLISH_ERROR_MESSAGE,
  ARTICLE_PUBLISH_REQUIREMENTS,
  ARTICLE_TABLE_MAX_CELL_TEXT_LENGTH,
  ARTICLE_TABLE_MAX_COLUMNS,
  ARTICLE_TABLE_MAX_ROWS,
  articleHrefForPublicSite,
  evaluateArticlePublishReadiness,
  safeArticleImageAttributes,
  safeArticleImageSrc,
  safeArticleLinkHref,
  validateArticleDocument,
  validateArticleTableNode,
} from "../lib/article-content-contract.ts";

const tableCellAttrs = { colspan: 1, rowspan: 1, colwidth: null, align: null };
const paragraph = (text) => ({ type: "paragraph", content: text ? [{ type: "text", text }] : undefined });
const tableCell = (text, type = "tableCell") => ({ type, attrs: tableCellAttrs, content: [paragraph(text)] });
const validTable = {
  type: "table",
  content: [
    { type: "tableRow", content: [tableCell("年代", "tableHeader"), tableCell("材質", "tableHeader")] },
    { type: "tableRow", content: [tableCell("佛曆 2520"), tableCell("粉質")] },
  ],
};
const validInlineImage = {
  type: "image",
  attrs: {
    src: "https://cdn.example.com/article.webp",
    alt: "佛牌正面細節",
    caption: "館藏編號 A-01",
    title: null,
    width: null,
    height: null,
  },
};

test("article editor contract exposes the reviewed SEO-safe schema", () => {
  assert.deepEqual(ARTICLE_HEADING_LEVELS, [2, 3, 4]);
  assert.ok(ARTICLE_NODE_TYPES.includes("horizontalRule"));
  assert.ok(ARTICLE_NODE_TYPES.includes("codeBlock"));
  assert.ok(ARTICLE_MARK_TYPES.includes("underline"));
  assert.ok(ARTICLE_MARK_TYPES.includes("link"));
  for (const type of ["image", "table", "tableRow", "tableHeader", "tableCell"]) {
    assert.ok(ARTICLE_NODE_TYPES.includes(type), `${type} is missing from the safe schema`);
  }
  assert.ok(!ARTICLE_NODE_TYPES.includes("taskList"));
  assert.equal(ARTICLE_IMAGE_URL_MAX_LENGTH, 1000);
  assert.equal(ARTICLE_IMAGE_ALT_MAX_LENGTH, 300);
  assert.equal(ARTICLE_IMAGE_CAPTION_MAX_LENGTH, 500);
  assert.equal(ARTICLE_TABLE_MAX_ROWS, 20);
  assert.equal(ARTICLE_TABLE_MAX_COLUMNS, 8);
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

test("inline article images require a bounded public URL, alt text, and plain caption", () => {
  assert.equal(safeArticleImageSrc("https://cdn.example.com/image.webp"), "https://cdn.example.com/image.webp");
  assert.equal(safeArticleImageSrc("http://cdn.example.com/image.webp"), "http://cdn.example.com/image.webp");
  for (const unsafe of [
    "/local/image.webp",
    "//cdn.example.com/image.webp",
    "javascript:alert(1)",
    "data:image/svg+xml,<svg/>",
    "https://user:secret@cdn.example.com/image.webp",
    "https://cdn.example.com\\@evil.example/image.webp",
  ]) assert.equal(safeArticleImageSrc(unsafe), null, unsafe);
  assert.equal(safeArticleImageSrc(`https://example.com/${"a".repeat(1000)}`), null);

  assert.deepEqual(safeArticleImageAttributes(validInlineImage.attrs), {
    src: "https://cdn.example.com/article.webp",
    alt: "佛牌正面細節",
    caption: "館藏編號 A-01",
  });
  assert.equal(safeArticleImageAttributes({ ...validInlineImage.attrs, alt: "" }), null);
  assert.equal(safeArticleImageAttributes({ ...validInlineImage.attrs, alt: "替".repeat(ARTICLE_IMAGE_ALT_MAX_LENGTH + 1) }), null);
  assert.equal(safeArticleImageAttributes({ ...validInlineImage.attrs, caption: "說".repeat(ARTICLE_IMAGE_CAPTION_MAX_LENGTH + 1) }), null);
  assert.equal(safeArticleImageAttributes({ ...validInlineImage.attrs, onerror: "alert(1)" }), null);
  assert.equal(safeArticleImageAttributes({ ...validInlineImage.attrs, title: "不可藏入 tooltip" }), null);
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
      validInlineImage,
      validTable,
      { type: "horizontalRule" },
    ],
  };

  assert.equal(validateArticleDocument(document), true);
  const previousBasePath = process.env.PAGES_BASE_PATH;
  process.env.PAGES_BASE_PATH = "/zangyao-amulet-archive";
  const html = renderToStaticMarkup(createElement(ArticleContent, { content: document }));
  if (previousBasePath === undefined) delete process.env.PAGES_BASE_PATH;
  else process.env.PAGES_BASE_PATH = previousBasePath;
  for (const fragment of ["<h2>", "<h3>", "<h4>", "<strong>", "<em>", "<u>", "<s>", "<code>", "<br/>", "<ul>", "<ol>", "<blockquote>", "<pre>", "<figure", "<figcaption>", "<table>", "<thead>", "<tbody>", "<hr/>"]) {
    assert.ok(html.includes(fragment), `missing rendered fragment: ${fragment}`);
  }
  assert.match(html, /href="https:\/\/example\.com\/source" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /href="\/zangyao-amulet-archive\/articles\/source\/">站內來源<\/a>/);
  assert.match(html, /<img[^>]+src="https:\/\/cdn\.example\.com\/article\.webp"[^>]+alt="佛牌正面細節"/);
  assert.match(html, /role="region" aria-label="文章資料表，可左右捲動查看完整內容" tabindex="0"/);
  assert.match(html, /<th scope="col"><p>年代<\/p><\/th>/);
  assert.doesNotMatch(html, /dangerouslySetInnerHTML|<script|onerror=|javascript:/i);
});

test("shared validation rejects content deeper than the public renderer", () => {
  let nested = { type: "text", text: "不應消失的內容" };
  for (let index = 0; index <= ARTICLE_MAX_DOCUMENT_DEPTH; index += 1) {
    nested = { type: "paragraph", content: [nested] };
  }
  assert.equal(validateArticleDocument({ type: "doc", content: [nested] }), false);
});

test("shared article validation accepts bounded tables and rejects malformed structures", () => {
  assert.equal(validateArticleTableNode(validTable), true);
  assert.equal(validateArticleDocument({ type: "doc", content: [validInlineImage, validTable] }), true);

  const tooManyRows = structuredClone(validTable);
  tooManyRows.content = Array.from({ length: ARTICLE_TABLE_MAX_ROWS + 1 }, (_, index) => ({
    type: "tableRow",
    content: [tableCell(`列 ${index}`), tableCell("資料")],
  }));
  assert.equal(validateArticleTableNode(tooManyRows), false);

  const tooManyColumns = structuredClone(validTable);
  tooManyColumns.content = [{
    type: "tableRow",
    content: Array.from({ length: ARTICLE_TABLE_MAX_COLUMNS + 1 }, (_, index) => tableCell(`欄 ${index}`, "tableHeader")),
  }];
  assert.equal(validateArticleTableNode(tooManyColumns), false);

  const uneven = structuredClone(validTable);
  uneven.content[1].content.pop();
  assert.equal(validateArticleTableNode(uneven), false);

  const headerOutsideFirstRow = structuredClone(validTable);
  headerOutsideFirstRow.content[1].content = [tableCell("不合法", "tableHeader"), tableCell("表頭", "tableHeader")];
  assert.equal(validateArticleTableNode(headerOutsideFirstRow), false);

  const mergedCell = structuredClone(validTable);
  mergedCell.content[1].content[0].attrs.colspan = 2;
  assert.equal(validateArticleTableNode(mergedCell), false);

  const oversizedCell = structuredClone(validTable);
  oversizedCell.content[1].content[0].content = [paragraph("字".repeat(ARTICLE_TABLE_MAX_CELL_TEXT_LENGTH + 1))];
  assert.equal(validateArticleTableNode(oversizedCell), false);

  const nestedTable = structuredClone(validTable);
  nestedTable.content[1].content[0].content = [structuredClone(validTable)];
  assert.equal(validateArticleTableNode(nestedTable), false);

  assert.equal(validateArticleDocument({ type: "doc", content: [{ ...validInlineImage, content: [paragraph("不得夾帶內容")] }] }), false);
});

test("image captions and table text render as escaped text instead of executable HTML", () => {
  const xssDocument = {
    type: "doc",
    content: [
      { ...validInlineImage, attrs: { ...validInlineImage.attrs, caption: '<script>alert("caption")</script>' } },
      {
        type: "table",
        content: [{
          type: "tableRow",
          content: [tableCell('</td><img src=x onerror="alert(1)">', "tableHeader")],
        }],
      },
    ],
  };
  assert.equal(validateArticleDocument(xssDocument), true);
  const html = renderToStaticMarkup(createElement(ArticleContent, { content: xssDocument }));
  assert.ok(html.includes("&lt;script&gt;alert(&quot;caption&quot;)&lt;/script&gt;"));
  assert.ok(html.includes("&lt;/td&gt;&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  assert.doesNotMatch(html, /<script|<img[^>]+onerror=/i);
});

test("Tiptap 3.29.2 image and TableKit controls are wired without pretending to upload files", async () => {
  const [packageSource, editorSource, toolbarSource, editorStyles] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/admin-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/article-editor-toolbar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/admin.module.css", import.meta.url), "utf8"),
  ]);
  const dependencies = JSON.parse(packageSource).dependencies;
  assert.equal(dependencies["@tiptap/extension-image"], dependencies["@tiptap/core"]);
  assert.equal(dependencies["@tiptap/extension-table"], dependencies["@tiptap/core"]);
  assert.equal(dependencies["@tiptap/core"], "^3.29.2");

  assert.match(editorSource, /Image\.extend\(/);
  assert.match(editorSource, /caption:[\s\S]*rendered: false/);
  assert.match(editorSource, /allowBase64: false/);
  assert.match(editorSource, /TableKit\.configure\(/);
  assert.match(editorSource, /renderWrapper: true/);
  assert.match(editorSource, /validateArticleDocument\(contentJson\)/);
  assert.match(toolbarSource, /insertTable\(\{ rows: 2, cols: 2, withHeaderRow: true \}\)/);
  for (const command of ["addRowAfter", "deleteRow", "addColumnAfter", "deleteColumn", "toggleHeaderRow", "deleteTable"]) {
    assert.ok(toolbarSource.includes(`.${command}()`), `${command} is missing from the table toolbar`);
  }
  assert.match(toolbarSource, /只會儲存公開圖片網址，不會把檔案上傳到 R2 或本站/);
  assert.doesNotMatch(toolbarSource, /(?:window\.)?prompt\s*\(/);
  assert.match(editorStyles, /\.editorBody :global\(\.tableWrapper\)[^{]*\{[^}]*overflow-x: auto/);
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
