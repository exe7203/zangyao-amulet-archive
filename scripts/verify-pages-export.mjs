import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";

const basePath = process.env.PAGES_BASE_PATH || "/zangyao-amulet-archive";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://exe7203.github.io/zangyao-amulet-archive/";
const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");

assert.match(html, /<html[^>]*lang="zh-Hant-TW"/i);
assert.match(html, /<h1[^>]*>把來源說清楚，<br\/>才值得長久收藏。<\/h1>/i);
assert.match(html, /泰聚達/);
assert.doesNotMatch(html, /藏曜選物|ZANGYAO|ZAA-2566/);
assert.ok(html.includes(`${basePath}/_next/`), "GitHub Pages base path is missing from assets");
assert.ok(html.includes(siteUrl), "Canonical GitHub Pages URL is missing");
assert.ok(html.includes(`${siteUrl}og.png`), "Branded social image URL is missing");
assert.ok(!html.includes("example.com"), "Placeholder SEO URL remains in export");

await assert.rejects(
  access(new URL("../out/admin/index.html", import.meta.url)),
  "The write-enabled admin surface must not be published on GitHub Pages",
);

const publicOut = new URL("../out/", import.meta.url);
const publicFiles = await readdir(publicOut, { recursive: true, withFileTypes: true });
const adminMarkers = /泰聚達內容中樞|api\/admin\/articles|signin-with-chatgpt|@tiptap/i;
for (const entry of publicFiles) {
  if (!entry.isFile() || !/\.(?:html|js|css|json|txt|xml)$/i.test(entry.name)) continue;
  const content = await readFile(`${entry.parentPath}/${entry.name}`, "utf8");
  assert.doesNotMatch(
    content,
    adminMarkers,
    `Admin/editor code leaked into the public Pages artifact: ${entry.name}`,
  );
}

console.log("GitHub Pages export verified");
