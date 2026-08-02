import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";

const basePath = process.env.PAGES_BASE_PATH || "/zangyao-amulet-archive";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://exe7203.github.io/zangyao-amulet-archive/";
const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");

assert.match(html, /<html[^>]*lang="zh-Hant-TW"/i);
assert.match(html, /<h1[^>]*><span>把來源說清楚，<\/span><span>才值得長久收藏。<\/span><\/h1>/i);
assert.match(html, /泰聚達/);
assert.doesNotMatch(html, /藏曜選物|ZANGYAO|ZAA-2566/);
assert.ok(html.includes(`${basePath}/_next/`), "GitHub Pages base path is missing from assets");
assert.ok(html.includes(siteUrl), "Canonical GitHub Pages URL is missing");
assert.ok(html.includes(`${siteUrl}og.png`), "Branded social image URL is missing");
assert.ok(!html.includes("example.com"), "Placeholder SEO URL remains in export");
assert.doesNotMatch(html, /收件人姓名|聯絡電話 \*|送出訂單資料|\/api\/store\/orders/,
  "The static showcase must not render an order or personal-data form");

await assert.rejects(
  access(new URL("../out/admin/", import.meta.url)),
  "The write-enabled admin surface must not be published on GitHub Pages",
);

for (const slug of ["guide-first-amulet", "amulet-case-care", "provenance-record"]) {
  const articleHtml = await readFile(new URL(`../out/articles/${slug}/index.html`, import.meta.url), "utf8");
  assert.match(articleHtml, /"@type":"Article"/, `Article schema is missing for ${slug}`);
  assert.match(articleHtml, /rel="canonical"/, `Canonical is missing for ${slug}`);
}

const productEntries = await readdir(new URL("../out/products/", import.meta.url), { withFileTypes: true });
assert.equal(productEntries.filter((entry) => entry.isDirectory()).length, 8,
  "The static showcase must contain all eight product snapshot routes");

const sitemap = await readFile(new URL("../out/sitemap.xml", import.meta.url), "utf8");
const robots = await readFile(new URL("../out/robots.txt", import.meta.url), "utf8");
assert.match(sitemap, /articles\/guide-first-amulet\//);
assert.doesNotMatch(sitemap, /\/admin\/|\/api\//);
assert.match(robots, /Disallow: .*\/admin\//);
assert.match(robots, /Sitemap: .*sitemap\.xml/);

const publicOut = new URL("../out/", import.meta.url);
const publicFiles = await readdir(publicOut, { recursive: true, withFileTypes: true });
const privateUiMarkers = /泰聚達內容中樞|api\/admin\/articles|signin-with-chatgpt|@tiptap|收件人姓名|送出訂單資料|\/api\/store\/orders/i;
for (const entry of publicFiles) {
  if (!entry.isFile() || !/\.(?:html|js|css|json|txt|xml)$/i.test(entry.name)) continue;
  const content = await readFile(`${entry.parentPath}/${entry.name}`, "utf8");
  assert.doesNotMatch(
    content,
    privateUiMarkers,
    `Admin/editor/order form code leaked into the public Pages artifact: ${entry.name}`,
  );
}

console.log("GitHub Pages export verified");
