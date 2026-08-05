import assert from "node:assert/strict";
import test from "node:test";
import { handleSeoMetadata } from "../worker/seo-metadata.ts";

test("Worker serves standard robots and sitemap endpoints without a slash redirect", async () => {
  const robots = handleSeoMetadata(new Request("https://example.test/robots.txt"));
  assert.equal(robots?.status, 200);
  assert.match(robots?.headers.get("content-type") || "", /^text\/plain/);
  assert.match(await robots.text(), /User-Agent: \*/);
  assert.match(await handleSeoMetadata(new Request("https://example.test/robots.txt"))?.text(), /Disallow: \/admin\//);

  const sitemap = handleSeoMetadata(new Request("https://example.test/sitemap.xml"));
  assert.equal(sitemap?.status, 200);
  assert.match(sitemap?.headers.get("content-type") || "", /^application\/xml/);
  const xml = await sitemap.text();
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.doesNotMatch(xml, /\/admin\/|\/api\//);
});

test("Worker canonicalizes only the invalid metadata trailing-slash form", () => {
  const response = handleSeoMetadata(new Request("https://example.test/robots.txt/"));
  assert.equal(response?.status, 308);
  assert.equal(response?.headers.get("location"), "https://example.test/robots.txt");
  assert.equal(handleSeoMetadata(new Request("https://example.test/about/")), null);
});
