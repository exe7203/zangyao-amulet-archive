import assert from "node:assert/strict";
import test from "node:test";
import { handleSeoMetadata } from "../worker/seo-metadata.ts";
import { buildRobots } from "../app/robots.ts";
import { buildSitemap } from "../app/sitemap.ts";
import { infoPageMetadata } from "../app/site-metadata.ts";
import { resolveSiteUrl } from "../shared/site-url.ts";

test("SEO configuration fails closed without a reviewed HTTPS public origin", () => {
  const invalidOrigins = [
    "",
    "not a url",
    "http://taijuda.tw/",
    "http://127.0.0.1:3000/",
    "https://localhost/",
    "https://shop.local/",
    "https://shop.example/",
    "https://shop.example.com/",
    "https://intranet/",
    "https://192.168.1.5/",
    "https://[::1]/",
  ];
  for (const value of invalidOrigins) {
    const resolved = resolveSiteUrl(value);
    assert.equal(resolved.indexable, false, value);
    assert.equal(resolved.publicUrl, null, value);
  }
  assert.equal(resolveSiteUrl("https://shop.taijuda.tw/base/").indexable, true);
  assert.equal(resolveSiteUrl("https://shop.taijuda.tw/base/").publicUrl?.toString(), "https://shop.taijuda.tw/base/");
  assert.deepEqual(buildSitemap("http://127.0.0.1:3000/"), []);
  assert.deepEqual(buildRobots("http://127.0.0.1:3000/").rules, [{ userAgent: "*", disallow: "/" }]);
});

test("page metadata omits public URL declarations when the origin is not publishable", () => {
  const localMetadata = infoPageMetadata("關於我們", "關於泰聚達", "about/", "http://127.0.0.1:3000/");
  assert.equal(localMetadata.alternates, undefined);
  assert.equal(localMetadata.openGraph?.url, undefined);
  assert.deepEqual(localMetadata.robots, { index: false, follow: false });

  const publicMetadata = infoPageMetadata("關於我們", "關於泰聚達", "about/", "https://shop.taijuda.tw/");
  assert.equal(publicMetadata.alternates?.canonical, "https://shop.taijuda.tw/about/");
  assert.equal(publicMetadata.openGraph?.url, "https://shop.taijuda.tw/about/");
});

test("Worker serves standard robots and sitemap endpoints without a slash redirect", async () => {
  const configuredSiteUrl = "https://shop.taijuda.tw/";
  const robots = handleSeoMetadata(new Request("https://preview-host.invalid/robots.txt"), configuredSiteUrl);
  assert.equal(robots?.status, 200);
  assert.match(robots?.headers.get("content-type") || "", /^text\/plain/);
  assert.match(await robots.text(), /User-Agent: \*/);
  assert.match(await handleSeoMetadata(new Request("https://preview-host.invalid/robots.txt"), configuredSiteUrl)?.text(), /Disallow: \/admin\//);

  const sitemap = handleSeoMetadata(new Request("https://preview-host.invalid/sitemap.xml"), configuredSiteUrl);
  assert.equal(sitemap?.status, 200);
  assert.match(sitemap?.headers.get("content-type") || "", /^application\/xml/);
  const xml = await sitemap.text();
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.doesNotMatch(xml, /\/admin\/|\/api\//);
});

test("Worker canonicalizes only the invalid metadata trailing-slash form", () => {
  const response = handleSeoMetadata(new Request("https://shop.taijuda.tw/robots.txt/"));
  assert.equal(response?.status, 308);
  assert.equal(response?.headers.get("location"), "https://shop.taijuda.tw/robots.txt");
  assert.equal(handleSeoMetadata(new Request("https://shop.taijuda.tw/about/")), null);
});

test("Worker request hosts cannot become the canonical origin without configuration", async () => {
  const robots = handleSeoMetadata(new Request("https://attacker-controlled.example.co/robots.txt"), "");
  assert.equal(await robots?.text(), "User-Agent: *\nDisallow: /\n");
  const sitemap = handleSeoMetadata(new Request("https://attacker-controlled.example.co/sitemap.xml"), "");
  const sitemapBody = await sitemap?.text();
  assert.doesNotMatch(sitemapBody, /<url>/);
  assert.doesNotMatch(sitemapBody, /attacker-controlled/);
});
