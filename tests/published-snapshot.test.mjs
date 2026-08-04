import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const snapshotSource = await readFile(
  new URL("../content/published-site.json", import.meta.url),
  "utf8",
);
const snapshot = JSON.parse(snapshotSource);

const slugPattern = /^[\p{Letter}\p{Number}]+(?:-[\p{Letter}\p{Number}]+)*$/u;
const allowedPageBlocks = new Set([
  "Hero",
  "Text",
  "ImageFeature",
  "Features",
  "FAQ",
  "CTA",
  "ProductShowcase",
  "ArticleShowcase",
]);
const allowedTiptapNodes = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "hardBreak",
  "horizontalRule",
  "codeBlock",
]);
const allowedTiptapMarks = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
]);
const privateSnapshotKeys = new Set([
  "updatedby",
  "savedby",
  "adminemail",
  "adminidentity",
  "customeremail",
  "customerphone",
  "customeraddress",
  "recipientname",
  "idempotencykey",
  "paymentreference",
  "authorization",
  "accesstoken",
  "refreshtoken",
  "password",
  "secret",
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertRecord(value, label) {
  assert.ok(isRecord(value), `${label} must be an object`);
}

function assertNonEmptyString(value, label, maximum = 20_000) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.ok(value.trim().length > 0, `${label} must not be empty`);
  assert.ok(value.length <= maximum, `${label} is too long`);
}

function assertIsoDate(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return;
  assert.equal(typeof value, "string", `${label} must be an ISO date string`);
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/, `${label} is not normalized ISO UTC`);
  assert.ok(Number.isFinite(Date.parse(value)), `${label} is not a real date`);
}

function assertSlug(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.match(value, slugPattern, `${label} is not a safe slug`);
}

function assertPositiveVersion(value, label) {
  assert.ok(Number.isSafeInteger(value) && value >= 1, `${label} must be a positive integer`);
}

function assertAbsoluteHttpUrlOrEmpty(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  if (!value) return;
  const url = new URL(value);
  assert.ok(["http:", "https:"].includes(url.protocol), `${label} must use http or https`);
  assert.equal(url.username, "", `${label} must not contain credentials`);
  assert.equal(url.password, "", `${label} must not contain credentials`);
}

function assertPublicAssetUrlOrEmpty(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  if (!value) return;
  assert.doesNotMatch(value, /^(?:javascript|data|vbscript):/i, `${label} uses an unsafe scheme`);
  const url = new URL(value, "https://snapshot.invalid/");
  assert.ok(["http:", "https:"].includes(url.protocol), `${label} must resolve to http or https`);
  assert.equal(url.username, "", `${label} must not contain credentials`);
  assert.equal(url.password, "", `${label} must not contain credentials`);
}

function assertUniqueEntries(entries, label) {
  const ids = new Set();
  const slugs = new Set();
  for (const entry of entries) {
    assertRecord(entry, `${label} entry`);
    assertNonEmptyString(entry.id, `${label} id`, 200);
    assertSlug(entry.slug, `${label} ${entry.id} slug`);
    assert.ok(!ids.has(entry.id), `${label} id is duplicated: ${entry.id}`);
    assert.ok(!slugs.has(entry.slug), `${label} slug is duplicated: ${entry.slug}`);
    ids.add(entry.id);
    slugs.add(entry.slug);
  }
}

function assertNoPrivateKeys(value, path = "snapshot", depth = 0) {
  assert.ok(depth <= 40, `${path} is nested too deeply`);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPrivateKeys(item, `${path}[${index}]`, depth + 1));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.replace(/[_-]/g, "").toLowerCase();
    assert.ok(!privateSnapshotKeys.has(normalizedKey), `private field leaked into public snapshot: ${path}.${key}`);
    assertNoPrivateKeys(child, `${path}.${key}`, depth + 1);
  }
}

function assertSafePageValue(value, path, depth = 0) {
  assert.ok(depth <= 12, `${path} is nested too deeply`);
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${path} must be finite`);
    return;
  }
  if (typeof value === "string") {
    assert.ok(value.length <= 20_000, `${path} is too long`);
    assert.doesNotMatch(value, /(?:javascript|vbscript):|<\/?script\b/i, `${path} contains executable content`);
    return;
  }
  if (Array.isArray(value)) {
    assert.ok(value.length <= 100, `${path} has too many items`);
    value.forEach((item, index) => assertSafePageValue(item, `${path}[${index}]`, depth + 1));
    return;
  }
  assertRecord(value, path);
  assert.ok(Object.keys(value).length <= 100, `${path} has too many properties`);
  for (const [key, child] of Object.entries(value)) {
    assert.doesNotMatch(key, /^(?:__proto__|prototype|constructor|dangerouslySetInnerHTML|html|css|script|style)$/i, `${path}.${key} is not allowed`);
    assert.doesNotMatch(key, /^on[A-Z]/, `${path}.${key} is an event handler`);
    assertSafePageValue(child, `${path}.${key}`, depth + 1);
  }
}

function tiptapTextLength(node) {
  if (!isRecord(node)) return 0;
  const ownText = typeof node.text === "string" ? node.text.replace(/\s/g, "").length : 0;
  const childText = Array.isArray(node.content)
    ? node.content.reduce((total, child) => total + tiptapTextLength(child), 0)
    : 0;
  return ownText + childText;
}

function assertTiptapNode(node, path = "contentJson", depth = 0, state = { count: 0 }) {
  assertRecord(node, path);
  assert.ok(depth <= 30, `${path} is nested too deeply`);
  state.count += 1;
  assert.ok(state.count <= 5000, `${path} contains too many nodes`);
  assert.ok(allowedTiptapNodes.has(node.type), `${path} uses unsupported node type: ${String(node.type)}`);

  if (node.text !== undefined) assert.equal(typeof node.text, "string", `${path}.text must be a string`);
  if (node.attrs !== undefined) assertRecord(node.attrs, `${path}.attrs`);
  if (node.content !== undefined) {
    assert.ok(Array.isArray(node.content), `${path}.content must be an array`);
    node.content.forEach((child, index) => assertTiptapNode(child, `${path}.content[${index}]`, depth + 1, state));
  }
  if (node.marks !== undefined) {
    assert.ok(Array.isArray(node.marks), `${path}.marks must be an array`);
    for (const [index, mark] of node.marks.entries()) {
      assertRecord(mark, `${path}.marks[${index}]`);
      assert.ok(allowedTiptapMarks.has(mark.type), `${path}.marks[${index}] uses unsupported mark type`);
      if (mark.attrs !== undefined) assertRecord(mark.attrs, `${path}.marks[${index}].attrs`);
      if (mark.type === "link") {
        const href = mark.attrs?.href;
        assert.equal(typeof href, "string", `${path}.marks[${index}] link needs href`);
        assert.match(href, /^(?:https?:|mailto:|\/|#)/i, `${path}.marks[${index}] has unsafe href`);
        assert.doesNotMatch(href, /^\/\//, `${path}.marks[${index}] must not use a protocol-relative href`);
      }
    }
  }
}

test("published snapshot envelope is deterministic and public-only", () => {
  assertRecord(snapshot, "snapshot");
  assert.equal(snapshot.schemaVersion, 1);
  assertIsoDate(snapshot.exportedAt, "snapshot.exportedAt");
  assert.match(snapshot.snapshotHash, /^[a-f0-9]{16}$/, "snapshotHash must be a 16-character SHA-256 prefix");

  const withoutHash = { ...snapshot };
  delete withoutHash.snapshotHash;
  const expectedHash = createHash("sha256")
    .update(JSON.stringify(withoutHash))
    .digest("hex")
    .slice(0, 16);
  assert.equal(snapshot.snapshotHash, expectedHash, "snapshotHash does not match the published payload");

  assertRecord(snapshot.site, "snapshot.site");
  assertNonEmptyString(snapshot.site.id, "snapshot.site.id", 200);
  assertSlug(snapshot.site.code, "snapshot.site.code");
  assertNonEmptyString(snapshot.site.name, "snapshot.site.name", 180);
  assert.match(snapshot.site.locale, /^[a-z]{2,3}(?:-[A-Za-z0-9]+)+$/, "site locale is invalid");
  assert.match(snapshot.site.currency, /^[A-Z]{3}$/, "site currency is invalid");

  assertRecord(snapshot.siteSettings, "snapshot.siteSettings");
  assertRecord(snapshot.siteSettings.settings, "snapshot.siteSettings.settings");
  assertRecord(snapshot.siteSettings.theme, "snapshot.siteSettings.theme");
  assertPositiveVersion(snapshot.siteSettings.version, "snapshot.siteSettings.version");
  assertIsoDate(snapshot.siteSettings.updatedAt, "snapshot.siteSettings.updatedAt");

  for (const key of ["pages", "articles", "products"]) {
    assert.ok(Array.isArray(snapshot[key]), `snapshot.${key} must be an array`);
  }
  assertNoPrivateKeys(snapshot);
  assert.doesNotMatch(
    snapshotSource,
    /\/api\/admin\/|signin-with-chatgpt|oai-authenticated-user-email|ADMIN_EMAIL_ALLOWLIST/i,
    "public snapshot contains an admin-only route or identity marker",
  );
});

test("published page snapshots satisfy the public renderer and SEO contract", () => {
  assertUniqueEntries(snapshot.pages, "page");
  for (const page of snapshot.pages) {
    assert.equal(page.status, "published", `page ${page.slug} is not published`);
    assertNonEmptyString(page.title, `page ${page.slug} title`, 180);
    assert.ok(page.seoTitle.trim().length >= 8 && page.seoTitle.length <= 180, `page ${page.slug} SEO title is invalid`);
    assert.ok(page.seoDescription.trim().length >= 50 && page.seoDescription.length <= 500, `page ${page.slug} SEO description is invalid`);
    assertAbsoluteHttpUrlOrEmpty(page.canonicalUrl, `page ${page.slug} canonicalUrl`);
    assertPublicAssetUrlOrEmpty(page.ogImageUrl, `page ${page.slug} ogImageUrl`);
    assert.equal(typeof page.noindex, "boolean", `page ${page.slug} noindex must be boolean`);
    assertPositiveVersion(page.version, `page ${page.slug} version`);
    assertIsoDate(page.publishedAt, `page ${page.slug} publishedAt`);
    assertIsoDate(page.createdAt, `page ${page.slug} createdAt`);
    assertIsoDate(page.updatedAt, `page ${page.slug} updatedAt`);

    assertRecord(page.data, `page ${page.slug} data`);
    assertRecord(page.data.root, `page ${page.slug} root`);
    assert.ok(Array.isArray(page.data.content), `page ${page.slug} content must be an array`);
    assert.ok(page.data.content.length <= 40, `page ${page.slug} has too many blocks`);
    const blockIds = new Set();
    let heroCount = 0;
    for (const [index, block] of page.data.content.entries()) {
      assertRecord(block, `page ${page.slug} block ${index}`);
      assert.ok(allowedPageBlocks.has(block.type), `page ${page.slug} uses unsupported block ${String(block.type)}`);
      assertRecord(block.props, `page ${page.slug} block ${index} props`);
      assertNonEmptyString(block.props.id, `page ${page.slug} block ${index} id`, 200);
      assert.ok(!blockIds.has(block.props.id), `page ${page.slug} repeats block id ${block.props.id}`);
      blockIds.add(block.props.id);
      if (block.type === "Hero") heroCount += 1;
      if (typeof block.props.imageUrl === "string" && block.props.imageUrl) {
        assertPublicAssetUrlOrEmpty(block.props.imageUrl, `page ${page.slug} block ${index} imageUrl`);
        assertNonEmptyString(block.props.imageAlt, `page ${page.slug} block ${index} imageAlt`, 300);
      }
      assertSafePageValue(block.props, `page ${page.slug} block ${index} props`);
    }
    assert.equal(heroCount, 1, `published page ${page.slug} must contain exactly one Hero block`);
    assertSafePageValue(page.data.root, `page ${page.slug} root`);
  }
});

test("published article snapshots are crawlable, dated, and safe to render", () => {
  assertUniqueEntries(snapshot.articles, "article");
  assert.ok(snapshot.articles.length > 0, "published snapshot must contain at least one article");
  for (const article of snapshot.articles) {
    assert.equal(article.status, "published", `article ${article.slug} is not published`);
    assertNonEmptyString(article.title, `article ${article.slug} title`, 180);
    assert.ok(article.excerpt.trim().length >= 20 && article.excerpt.length <= 500, `article ${article.slug} excerpt is invalid`);
    assert.ok(article.seoTitle.trim().length >= 8 && article.seoTitle.length <= 180, `article ${article.slug} SEO title is invalid`);
    assert.ok(article.seoDescription.trim().length >= 50 && article.seoDescription.length <= 500, `article ${article.slug} SEO description is invalid`);
    assertAbsoluteHttpUrlOrEmpty(article.canonicalUrl, `article ${article.slug} canonicalUrl`);
    assertPublicAssetUrlOrEmpty(article.ogImageUrl, `article ${article.slug} ogImageUrl`);
    assertPublicAssetUrlOrEmpty(article.heroImageUrl, `article ${article.slug} heroImageUrl`);
    if (article.heroImageUrl) assertNonEmptyString(article.heroImageAlt, `article ${article.slug} heroImageAlt`, 300);
    assert.equal(typeof article.noindex, "boolean", `article ${article.slug} noindex must be boolean`);
    assertPositiveVersion(article.version, `article ${article.slug} version`);
    assertIsoDate(article.publishedAt, `article ${article.slug} publishedAt`);
    assertIsoDate(article.updatedAt, `article ${article.slug} updatedAt`);
    assert.ok(Array.isArray(article.keywords), `article ${article.slug} keywords must be an array`);
    assert.ok(article.keywords.length <= 12, `article ${article.slug} has too many keywords`);
    assert.equal(new Set(article.keywords).size, article.keywords.length, `article ${article.slug} repeats keywords`);
    article.keywords.forEach((keyword, index) => assertNonEmptyString(keyword, `article ${article.slug} keyword ${index}`, 100));

    assertTiptapNode(article.contentJson, `article ${article.slug} contentJson`);
    assert.equal(article.contentJson.type, "doc", `article ${article.slug} root node must be doc`);
    assert.ok(tiptapTextLength(article.contentJson) >= 80, `article ${article.slug} has too little indexable text`);
  }
});

test("public product snapshots remain noindex until each item is SEO-ready", () => {
  assertUniqueEntries(snapshot.products, "product");
  for (const product of snapshot.products) {
    assert.ok(["active", "sold_out"].includes(product.status), `product ${product.slug} has a private status`);
    assertNonEmptyString(product.sku, `product ${product.slug} sku`, 100);
    assertNonEmptyString(product.name, `product ${product.slug} name`, 180);
    assertNonEmptyString(product.shortName, `product ${product.slug} shortName`, 180);
    assertNonEmptyString(product.description, `product ${product.slug} description`, 1000);
    assert.ok(Number.isSafeInteger(product.price) && product.price >= 0, `product ${product.slug} price is invalid`);
    assert.ok(Number.isSafeInteger(product.stock) && product.stock >= 0, `product ${product.slug} stock is invalid`);
    assert.ok(Number.isSafeInteger(product.purchaseLimit) && product.purchaseLimit >= 1, `product ${product.slug} purchaseLimit is invalid`);
    assert.ok(["arch", "oval", "round", "statue"].includes(product.shape), `product ${product.slug} shape is invalid`);
    assert.equal(typeof product.seoReady, "boolean", `product ${product.slug} seoReady must be boolean`);
    assertPositiveVersion(product.version, `product ${product.slug} version`);
    assertIsoDate(product.updatedAt, `product ${product.slug} updatedAt`);
    assertPublicAssetUrlOrEmpty(product.imageUrl, `product ${product.slug} imageUrl`);
    if (product.imageUrl) assertNonEmptyString(product.imageAlt, `product ${product.slug} imageAlt`, 300);

    if (product.seoReady) {
      assert.ok(product.seoTitle.trim().length >= 8 && product.seoTitle.length <= 180, `SEO-ready product ${product.slug} has an invalid SEO title`);
      assert.ok(product.seoDescription.trim().length >= 50 && product.seoDescription.length <= 500, `SEO-ready product ${product.slug} has an invalid SEO description`);
      assertNonEmptyString(product.imageUrl, `SEO-ready product ${product.slug} imageUrl`, 2000);
      assertNonEmptyString(product.imageAlt, `SEO-ready product ${product.slug} imageAlt`, 300);
    }
  }
});
