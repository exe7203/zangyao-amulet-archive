import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  addCartItem,
  changeCartItemQuantity,
  MAX_CART_DISTINCT_ITEMS,
  normalizeCartItems,
  parseCartStorage,
  serializeCartItems,
} from "../app/cart.ts";
import { serializeJsonLd } from "../shared/json-ld.ts";
import { resolveSiteUrl } from "../shared/site-url.ts";

const publishedSnapshot = JSON.parse(await readFile(
  new URL("../content/published-site.json", import.meta.url),
  "utf8",
));

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the storefront and SEO content", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]*lang="zh-Hant-TW"/i);
  assert.match(html, /泰聚達/);
  assert.doesNotMatch(html, /藏曜選物|ZANGYAO|ZAA-2566/);
  assert.match(html, /看懂來源/);
  assert.match(html, /活動聚會/);
  if (resolveSiteUrl().publicUrl) {
    assert.match(html, /application\/ld\+json/);
  } else {
    assert.doesNotMatch(html, /rel="canonical"|property="og:url"|127\.0\.0\.1|localhost/i);
    assert.match(html, /<meta[^>]+name="robots"[^>]+content="noindex, nofollow"/i);
  }
  assert.match(html, /最新商品|近期典藏/);
  assert.ok(publishedSnapshot.articles.length > 0, "the public snapshot has no articles");
  assert.ok(html.includes(publishedSnapshot.articles[0].title));
  assert.ok(html.includes(`/articles/${publishedSnapshot.articles[0].slug}/`));
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("public catalog JSON-LD cannot be closed by stored text", async () => {
  const storedText = "藏品</script><script>globalThis.compromised=true</script>\u2028補充\u2029";
  const serialized = serializeJsonLd({
    "@context": "https://schema.org",
    "@type": "Product",
    name: storedText,
  });

  assert.doesNotMatch(serialized, /</);
  assert.match(serialized, /\\u003c\/script>/);
  assert.match(serialized, /\\u2028/);
  assert.match(serialized, /\\u2029/);
  assert.equal(JSON.parse(serialized).name, storedText);

  const [homeSource, productSource] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/products/[slug]/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(homeSource, /serializeJsonLd\(structuredData\)/);
  assert.match(productSource, /serializeJsonLd\(structuredData\)/);
});

test("cart storage keeps only product ids and safe quantities", () => {
  const catalog = [
    { id: "product_taijuda_001", purchaseLimit: 1, stock: 1 },
    { id: "product_taijuda_002", purchaseLimit: 10, stock: 10 },
  ];
  const normalized = normalizeCartItems([
    { productId: 1, quantity: 3, stalePrice: 1 },
    { productId: 1, quantity: 1 },
    { productId: 2, quantity: 2, product: { price: 1 } },
    { productId: 999, quantity: 1 },
    { productId: 2, quantity: 0 },
  ], catalog);

  assert.deepEqual(normalized, [
    { productId: "product_taijuda_001", quantity: 1 },
    { productId: "product_taijuda_002", quantity: 2 },
  ]);
  assert.equal(
    serializeCartItems(normalized),
    '[{"productId":"product_taijuda_001","quantity":1},{"productId":"product_taijuda_002","quantity":2}]',
  );
});

test("cart changes respect one-of-one limits and remove zero quantities", () => {
  const uniqueProduct = { id: "product_taijuda_001", purchaseLimit: 1, stock: 1 };
  const catalog = [uniqueProduct];

  const firstAdd = addCartItem([], uniqueProduct);
  assert.deepEqual(addCartItem(firstAdd, uniqueProduct), firstAdd);
  assert.deepEqual(changeCartItemQuantity(firstAdd, "product_taijuda_001", -1, catalog), []);
});

test("cart caps new distinct products at ten", () => {
  const catalog = Array.from({ length: MAX_CART_DISTINCT_ITEMS + 1 }, (_, index) => ({
    id: `product_taijuda_cap_${index}`,
    purchaseLimit: 1,
    stock: 1,
  }));
  const cart = catalog.reduce((items, product) => addCartItem(items, product), []);

  assert.equal(cart.length, MAX_CART_DISTINCT_ITEMS);
  assert.equal(cart.some((item) => item.productId === catalog.at(-1).id), false);
});

test("cart can preserve live-only ids during a catalog outage", () => {
  const catalog = [{ id: "product_taijuda_001", purchaseLimit: 1, stock: 1 }];
  const stored = JSON.stringify([
    { productId: "product_taijuda_001", quantity: 2 },
    { productId: "product_live_only", quantity: 2 },
  ]);

  assert.deepEqual(parseCartStorage(stored, catalog), [
    { productId: "product_taijuda_001", quantity: 1 },
  ]);
  assert.deepEqual(parseCartStorage(stored, catalog, { preserveUnknown: true }), [
    { productId: "product_taijuda_001", quantity: 2 },
    { productId: "product_live_only", quantity: 2 },
  ]);
});
