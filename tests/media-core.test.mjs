import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Miniflare } from "miniflare";
import { handleMediaApi, mediaApiContractPaths } from "../worker/media-api.ts";

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

let miniflare;
let db;
let mediaBucket;

before(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    compatibilityDate: "2026-05-22",
    d1Databases: { DB: "media-core-test" },
    r2Buckets: { MEDIA: "media-core-test" },
  });
  db = await miniflare.getD1Database("DB");
  mediaBucket = await miniflare.getR2Bucket("MEDIA");
});

after(async () => {
  await miniflare?.dispose();
});

test("media API contract paths stay stable", () => {
  assert.deepEqual(mediaApiContractPaths(), {
    adminList: "/api/admin/media",
    adminUpload: "/api/admin/media",
    publicServe: "/api/media/",
  });
});

test("admin media upload, list, serve, and soft delete stay in sync with D1 metadata", async () => {
  const env = { DB: db, MEDIA: mediaBucket };

  const formData = new FormData();
  formData.set("file", new File([PNG_BYTES], "sample.png", { type: "image/png" }));
  formData.set("purpose", "product");
  formData.set("altText", "測試商品圖");

  const uploadResponse = await handleMediaApi(
    new Request("http://localhost/api/admin/media?site=taijuda", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: formData,
    }),
    env,
  );
  assert.equal(uploadResponse?.status, 201);
  const uploaded = await uploadResponse.json();
  assert.match(uploaded.asset.id, /^media_/);
  assert.equal(uploaded.asset.purpose, "product");
  assert.match(uploaded.asset.url, /\/api\/media\//);

  const listResponse = await handleMediaApi(
    new Request("http://localhost/api/admin/media?site=taijuda&status=ready", {
      headers: { accept: "application/json" },
    }),
    env,
  );
  assert.equal(listResponse?.status, 200);
  const listed = await listResponse.json();
  assert.ok(listed.assets.some((asset) => asset.id === uploaded.asset.id));

  const publicResponse = await handleMediaApi(
    new Request(uploaded.asset.url.replace("http://localhost", "http://localhost"), {
      headers: { accept: "image/png" },
    }),
    env,
  );
  assert.equal(publicResponse?.status, 200);
  assert.match(publicResponse?.headers.get("content-type") || "", /^image\/png/);

  const deleteResponse = await handleMediaApi(
    new Request(`http://localhost/api/admin/media/${encodeURIComponent(uploaded.asset.id)}?site=taijuda`, {
      method: "DELETE",
      headers: { origin: "http://localhost", accept: "application/json" },
    }),
    env,
  );
  assert.equal(deleteResponse?.status, 200);

  const missingResponse = await handleMediaApi(
    new Request(uploaded.asset.url, { headers: { accept: "image/png" } }),
    env,
  );
  assert.equal(missingResponse?.status, 404);
});

test("media upload fails closed without R2 binding", async () => {
  const formData = new FormData();
  formData.set("file", new File([PNG_BYTES], "sample.png", { type: "image/png" }));
  formData.set("purpose", "product");

  const response = await handleMediaApi(
    new Request("http://localhost/api/admin/media?site=taijuda", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: formData,
    }),
    { DB: db },
  );
  assert.equal(response?.status, 503);
});
