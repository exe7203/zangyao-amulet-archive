import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

console.log("GitHub Pages export verified");
