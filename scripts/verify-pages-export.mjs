import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const outRoot = path.join(projectRoot, "out");
const basePath = normalizeBasePath(process.env.PAGES_BASE_PATH || "/zangyao-amulet-archive");
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://exe7203.github.io/zangyao-amulet-archive/";
const siteBase = new URL(siteUrl);
const catalogVerified = process.env.NEXT_PUBLIC_CATALOG_VERIFIED === "1";
const snapshot = JSON.parse(await readFile(path.join(projectRoot, "content", "published-site.json"), "utf8"));

assert.equal(siteBase.search, "", "NEXT_PUBLIC_SITE_URL must not contain a query string");
assert.equal(siteBase.hash, "", "NEXT_PUBLIC_SITE_URL must not contain a fragment");
assert.ok(siteBase.pathname.endsWith("/"), "NEXT_PUBLIC_SITE_URL must end with a slash");
assert.equal(
  normalizeBasePath(siteBase.pathname),
  basePath,
  "PAGES_BASE_PATH and NEXT_PUBLIC_SITE_URL must describe the same deployment path",
);

function normalizeBasePath(value) {
  const normalized = `/${String(value || "").replace(/^\/+|\/+$/g, "")}`;
  return normalized === "/" ? "" : normalized;
}

function publicUrl(route = "") {
  return new URL(route.replace(/^\/+/, ""), siteBase).toString();
}

function publicCanonical(configured, fallbackRoute) {
  if (!configured) return publicUrl(fallbackRoute);
  const url = new URL(configured, siteBase);
  assert.ok(["http:", "https:"].includes(url.protocol), `canonical URL uses an unsafe scheme: ${configured}`);
  return url.toString();
}

function hasMatchingCanonical(configured, route) {
  if (!configured) return true;
  return publicCanonical(configured, route) === publicUrl(route);
}

function publicImage(configured) {
  const url = new URL(configured || "og.png", siteBase);
  assert.ok(["http:", "https:"].includes(url.protocol), `social image uses an unsafe scheme: ${configured}`);
  return url.toString();
}

function routeFile(route) {
  const clean = route.replace(/^\/+|\/+$/g, "");
  return clean ? path.join(outRoot, ...clean.split("/"), "index.html") : path.join(outRoot, "index.html");
}

function decodeEntities(value) {
  return String(value)
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseAttributes(tag) {
  const attributes = new Map();
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(pattern)) {
    attributes.set(match[1].toLowerCase(), decodeEntities(match[2] ?? match[3] ?? match[4] ?? ""));
  }
  return attributes;
}

function findTag(html, tagName, predicate) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  for (const match of html.matchAll(pattern)) {
    const attributes = parseAttributes(match[0]);
    if (predicate(attributes)) return attributes;
  }
  return null;
}

function metaContent(html, selector, value) {
  const attributes = findTag(
    html,
    "meta",
    (candidate) => candidate.get(selector)?.toLowerCase() === value.toLowerCase(),
  );
  return attributes?.get("content") ?? null;
}

function canonicalHref(html) {
  const attributes = findTag(
    html,
    "link",
    (candidate) => candidate.get("rel")?.toLowerCase().split(/\s+/).includes("canonical"),
  );
  return attributes?.get("href") ?? null;
}

function documentTitle(html) {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1]) : null;
}

function jsonLdTypes(html, label) {
  const types = new Set();
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    const attributes = parseAttributes(`<script ${match[1]}>`);
    if (attributes.get("type")?.toLowerCase() !== "application/ld+json") continue;
    let value;
    try {
      value = JSON.parse(match[2]);
    } catch (error) {
      assert.fail(`${label} contains invalid JSON-LD: ${error instanceof Error ? error.message : String(error)}`);
    }
    const visit = (node, depth = 0) => {
      assert.ok(depth <= 30, `${label} JSON-LD is nested too deeply`);
      if (Array.isArray(node)) {
        node.forEach((item) => visit(item, depth + 1));
        return;
      }
      if (!node || typeof node !== "object") return;
      if (typeof node["@type"] === "string") types.add(node["@type"]);
      else if (Array.isArray(node["@type"])) node["@type"].forEach((type) => types.add(String(type)));
      Object.values(node).forEach((child) => visit(child, depth + 1));
    };
    visit(value);
  }
  return types;
}

function assertMetaEquals(html, selector, name, expected, label) {
  assert.equal(metaContent(html, selector, name), expected, `${label} has incorrect ${name}`);
}

function assertSeoDocument(html, {
  label,
  title,
  socialTitle = title,
  description,
  socialDescription = description,
  canonical,
  indexable,
  ogType,
  image,
  schemaTypes,
  breadcrumb = true,
  exactlyOneH1 = true,
}) {
  assert.equal(documentTitle(html), title, `${label} has an incorrect document title`);
  assertMetaEquals(html, "name", "description", description, label);
  assert.equal(canonicalHref(html), canonical, `${label} has an incorrect canonical URL`);
  const robots = metaContent(html, "name", "robots")?.toLowerCase() || "";
  assert.match(robots, indexable ? /(?:^|,\s*)index(?:,|$)/ : /(?:^|,\s*)noindex(?:,|$)/, `${label} has an incorrect robots index directive`);
  assert.match(robots, /(?:^|,\s*)follow(?:,|$)/, `${label} must keep links followable`);
  assertMetaEquals(html, "property", "og:title", socialTitle, label);
  assertMetaEquals(html, "property", "og:description", socialDescription, label);
  assertMetaEquals(html, "property", "og:url", canonical, label);
  if (ogType) assertMetaEquals(html, "property", "og:type", ogType, label);
  assertMetaEquals(html, "name", "twitter:title", socialTitle, label);
  assertMetaEquals(html, "name", "twitter:description", socialDescription, label);
  if (image) {
    assertMetaEquals(html, "property", "og:image", image, label);
    assertMetaEquals(html, "name", "twitter:image", image, label);
  }
  if (exactlyOneH1) {
    assert.equal((html.match(/<h1\b/gi) || []).length, 1, `${label} must render exactly one H1`);
  }
  if (breadcrumb) {
    assert.match(html, /<nav\b[^>]*aria-label="麵包屑"/i, `${label} is missing a visible breadcrumb`);
  }
  const types = jsonLdTypes(html, label);
  for (const type of schemaTypes) assert.ok(types.has(type), `${label} JSON-LD is missing ${type}`);
  return types;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertInternalLink(html, route, label) {
  const pathname = new URL(publicUrl(route)).pathname;
  assert.match(html, new RegExp(`href=["']${escapeRegExp(pathname)}["']`), `${label} does not link to ${pathname}`);
}

async function listRouteDirectories(name) {
  try {
    const entries = await readdir(path.join(outRoot, name), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("__next."))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return [];
    throw error;
  }
}

async function assertPathMissing(relativePath, message) {
  await assert.rejects(access(path.join(outRoot, relativePath)), message);
}

function parseSitemap(xml) {
  const entries = [];
  for (const match of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const loc = match[1].match(/<loc>([\s\S]*?)<\/loc>/i)?.[1];
    const lastModified = match[1].match(/<lastmod>([\s\S]*?)<\/lastmod>/i)?.[1];
    assert.ok(loc, "sitemap entry is missing loc");
    entries.push({
      loc: decodeEntities(loc.trim()),
      lastModified: lastModified ? decodeEntities(lastModified.trim()) : null,
    });
  }
  return entries;
}

const homeHtml = await readFile(routeFile(""), "utf8");
assert.match(homeHtml, /<html[^>]*lang="zh-Hant-TW"/i);
assert.match(homeHtml, /<h1[^>]*><span>把來源說清楚，<\/span><span>才值得長久收藏。<\/span><\/h1>/i);
assert.match(homeHtml, /泰聚達/);
assert.doesNotMatch(homeHtml, /藏曜選物|ZANGYAO|ZAA-2566/);
assert.ok(homeHtml.includes(`${basePath}/_next/`), "GitHub Pages base path is missing from assets");
assert.equal(canonicalHref(homeHtml), publicUrl(""), "home canonical URL is incorrect");
assertMetaEquals(homeHtml, "property", "og:image", publicImage(""), "home");
assert.ok(jsonLdTypes(homeHtml, "home").has("OnlineStore"), "home JSON-LD is missing OnlineStore");
assert.ok(!homeHtml.includes("example.com"), "placeholder SEO URL remains in export");
assert.doesNotMatch(
  homeHtml,
  /收件人姓名|聯絡電話 \*|送出訂單資料|常用結帳資料|將聯絡與配送資料保存在這台裝置|\/api\/store\/orders/,
  "the static showcase must not render an order or personal-data form",
);

await Promise.all([
  assertPathMissing("admin", "the write-enabled admin surface must not be published on GitHub Pages"),
  assertPathMissing("account", "the device profile and order-history surface must not be published on GitHub Pages"),
  assertPathMissing("api", "Worker API routes must not be published as static Pages files"),
  assertPathMissing("signin-with-chatgpt", "the admin sign-in route must not be published"),
  assertPathMissing("signout-with-chatgpt", "the admin sign-out route must not be published"),
]);

for (const route of ["about/", "service/shipping/", "service/returns/", "service/contact/", "service/privacy/"]) {
  const html = await readFile(routeFile(route), "utf8");
  assert.match(html, /<nav\b[^>]*aria-label="麵包屑"/i, `${route} is missing a visible breadcrumb`);
  const types = jsonLdTypes(html, route);
  assert.ok(types.has("WebPage"), `${route} JSON-LD is missing WebPage`);
  assert.ok(types.has("BreadcrumbList"), `${route} JSON-LD is missing BreadcrumbList`);
}

const articleIndexHtml = await readFile(routeFile("articles/"), "utf8");
assertSeoDocument(articleIndexHtml, {
  label: "article index",
  title: "泰國佛牌收藏誌｜泰聚達",
  description: "泰聚達收藏誌整理泰國佛牌年份、材質、來源、外殼保養與收藏履歷，從可以查證的資料開始認識佛牌文化。",
  socialDescription: "從年份、材質、來源與保存紀錄開始認識泰國佛牌收藏。",
  canonical: publicUrl("articles/"),
  indexable: true,
  ogType: "website",
  image: publicImage("og.png"),
  schemaTypes: ["CollectionPage", "ItemList", "BreadcrumbList"],
});

for (const article of snapshot.articles) {
  const route = `articles/${article.slug}/`;
  const label = `article ${article.slug}`;
  const articleHtml = await readFile(routeFile(route), "utf8");
  const title = article.seoTitle || article.title;
  const description = article.seoDescription || article.excerpt;
  const canonical = publicCanonical(article.canonicalUrl, route);
  const image = publicImage(article.ogImageUrl);
  const types = assertSeoDocument(articleHtml, {
    label,
    title: `${title}｜泰聚達`,
    socialTitle: title,
    description,
    canonical,
    indexable: !article.noindex,
    ogType: "article",
    image,
    schemaTypes: ["Article", "BreadcrumbList"],
  });
  assert.ok(types.has("Organization"), `${label} must identify its publisher`);
  assert.match(articleHtml, new RegExp(`datePublished[^<]*${escapeRegExp(article.publishedAt)}`), `${label} JSON-LD is missing datePublished`);
  assert.match(articleHtml, new RegExp(`dateModified[^<]*${escapeRegExp(article.updatedAt)}`), `${label} JSON-LD is missing dateModified`);
  assertInternalLink(articleIndexHtml, route, "article index");
}

for (const page of snapshot.pages) {
  const route = `pages/${page.slug}/`;
  const label = `page ${page.slug}`;
  const pageHtml = await readFile(routeFile(route), "utf8");
  assertSeoDocument(pageHtml, {
    label,
    title: (page.seoTitle || page.title).includes("泰聚達")
      ? (page.seoTitle || page.title)
      : `${page.seoTitle || page.title}｜泰聚達`,
    socialTitle: page.seoTitle || page.title,
    description: page.seoDescription,
    canonical: publicCanonical(page.canonicalUrl, route),
    indexable: !page.noindex,
    ogType: "website",
    image: publicImage(page.ogImageUrl),
    schemaTypes: ["WebPage", "BreadcrumbList"],
  });
}

for (const product of snapshot.products) {
  const route = `products/${product.slug}/`;
  const label = `product ${product.slug}`;
  const productHtml = await readFile(routeFile(route), "utf8");
  const indexable = catalogVerified && product.seoReady === true;
  const title = product.seoTitle || `${product.name}｜泰聚達`;
  const types = assertSeoDocument(productHtml, {
    label,
    title,
    socialTitle: product.seoTitle || product.name,
    description: product.seoDescription || product.description,
    canonical: publicUrl(route),
    indexable,
    ogType: "website",
    image: publicImage(product.imageUrl),
    schemaTypes: indexable ? ["Product", "BreadcrumbList"] : [],
  });
  if (!indexable) {
    assert.ok(!types.has("Product"), `${label} must not claim Product structured data before verification`);
  }
}

assert.deepEqual(
  await listRouteDirectories("articles"),
  snapshot.articles.map((article) => article.slug).sort(),
  "article route directories do not match the public snapshot",
);
assert.deepEqual(
  await listRouteDirectories("products"),
  snapshot.products.map((product) => product.slug).sort(),
  "product route directories do not match the public snapshot",
);
assert.deepEqual(
  await listRouteDirectories("pages"),
  snapshot.pages.map((page) => page.slug).sort(),
  "page route directories do not match the public snapshot",
);

const sitemapXml = await readFile(path.join(outRoot, "sitemap.xml"), "utf8");
const robots = await readFile(path.join(outRoot, "robots.txt"), "utf8");
const sitemapEntries = parseSitemap(sitemapXml);
const actualSitemapUrls = sitemapEntries.map((entry) => entry.loc);
assert.equal(new Set(actualSitemapUrls).size, actualSitemapUrls.length, "sitemap contains duplicate URLs");

const expectedSitemap = new Map([
  [publicUrl(""), null],
  [publicUrl("about/"), null],
  [publicUrl("articles/"), null],
  [publicUrl("service/shipping/"), null],
  [publicUrl("service/returns/"), null],
  [publicUrl("service/contact/"), null],
  [publicUrl("service/privacy/"), null],
]);
for (const page of snapshot.pages.filter((candidate) =>
  !candidate.noindex && hasMatchingCanonical(candidate.canonicalUrl, `pages/${candidate.slug}/`))) {
  expectedSitemap.set(publicUrl(`pages/${page.slug}/`), page.updatedAt || null);
}
for (const article of snapshot.articles.filter((candidate) =>
  !candidate.noindex && hasMatchingCanonical(candidate.canonicalUrl, `articles/${candidate.slug}/`))) {
  expectedSitemap.set(publicUrl(`articles/${article.slug}/`), article.updatedAt || null);
}
if (catalogVerified) {
  for (const product of snapshot.products.filter((candidate) =>
    ["active", "sold_out"].includes(candidate.status) && candidate.seoReady === true)) {
    expectedSitemap.set(publicUrl(`products/${product.slug}/`), product.updatedAt || null);
  }
}

assert.deepEqual(
  [...actualSitemapUrls].sort(),
  [...expectedSitemap.keys()].sort(),
  "sitemap URLs do not exactly match the indexable public snapshot",
);
for (const entry of sitemapEntries) {
  assert.ok(entry.loc.startsWith(siteBase.toString()), `sitemap URL is outside the configured site: ${entry.loc}`);
  const expectedLastModified = expectedSitemap.get(entry.loc);
  if (expectedLastModified) {
    assert.equal(entry.lastModified, expectedLastModified, `sitemap lastmod is incorrect for ${entry.loc}`);
  } else {
    assert.equal(entry.lastModified, null, `static sitemap URL must not invent lastmod: ${entry.loc}`);
  }
}
assert.doesNotMatch(sitemapXml, /\/admin\/|\/api\//, "sitemap exposes a private route");

const robotPath = basePath || "";
assert.match(robots, new RegExp(`Allow: ${escapeRegExp(robotPath)}/(?:\\r?\\n|$)`));
assert.match(robots, new RegExp(`Disallow: ${escapeRegExp(robotPath)}/admin/`));
assert.match(robots, new RegExp(`Disallow: ${escapeRegExp(robotPath)}/api/`));
assert.match(robots, new RegExp(`Sitemap: ${escapeRegExp(publicUrl("sitemap.xml"))}`));
assert.doesNotMatch(robots, /Disallow: .*\/(?:articles|products|pages)\//, "robots.txt blocks public content routes");

const publicFiles = await readdir(outRoot, { recursive: true, withFileTypes: true });
const privateUiMarkers = [
  /\/api\/admin\/(?:articles|pages|site-settings|site-export|products|orders)/i,
  /signin-with-chatgpt|signout-with-chatgpt|oai-authenticated-user-email/i,
  /ADMIN_EMAIL_ALLOWLIST|TAIJUDA_ALLOW_REMOTE_EXPORT/i,
  /@tiptap\/(?:react|core|starter-kit)/i,
  /泰聚達內容中樞|儲存草稿|發布文章|發布頁面|版本發生衝突/i,
  /收件人姓名|送出訂單資料|\/api\/store\/orders/i,
  /"(?:updatedBy|savedBy|adminEmail|customerEmail|customerPhone|customerAddress|idempotencyKey)"\s*:/i,
];
for (const entry of publicFiles) {
  if (!entry.isFile() || !/\.(?:html|js|css|json|txt|xml|map|webmanifest)$/i.test(entry.name)) continue;
  const filePath = path.join(entry.parentPath, entry.name);
  const content = await readFile(filePath, "utf8");
  for (const marker of privateUiMarkers) {
    assert.doesNotMatch(
      content,
      marker,
      `admin/editor/order implementation leaked into the public Pages artifact: ${path.relative(outRoot, filePath)}`,
    );
  }
}

console.log(
  `GitHub Pages export verified: pages=${snapshot.pages.length} articles=${snapshot.articles.length} products=${snapshot.products.length} sitemap=${sitemapEntries.length}`,
);
