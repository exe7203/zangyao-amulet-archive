import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  addCartItem,
  changeCartItemQuantity,
  normalizeCartItems,
  serializeCartItems,
} from "../app/cart.ts";

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
  assert.match(html, /把來源說清楚/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /本週新藏/);
  assert.ok(publishedSnapshot.articles.length > 0, "the public snapshot has no articles");
  assert.ok(html.includes(publishedSnapshot.articles[0].title));
  assert.ok(html.includes(`/articles/${publishedSnapshot.articles[0].slug}/`));
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
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
