import assert from "node:assert/strict";
import test from "node:test";
import { withSecurityHeaders } from "../worker/security-headers.ts";

test("document responses receive a compatible security baseline", async () => {
  const response = withSecurityHeaders(
    new Request("https://www.taijuda.test/articles/"),
    new Response("<main>ok</main>", {
      headers: { "content-type": "text/html; charset=utf-8", etag: '"test"' },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.match(response.headers.get("permissions-policy") || "", /camera=\(\)/u);
  assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.match(response.headers.get("content-security-policy") || "", /frame-ancestors 'self'/u);
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");
  assert.equal(response.headers.get("etag"), '"test"');
  assert.equal(await response.text(), "<main>ok</main>");
});

test("private routes are never cached and localhost does not emit HSTS", () => {
  const response = withSecurityHeaders(
    new Request("http://127.0.0.1:3000/admin/products/"),
    new Response("admin", { headers: { "cache-control": "public, max-age=60" } }),
  );

  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("strict-transport-security"), null);
});

test("similarly named public paths are not treated as private routes", () => {
  const response = withSecurityHeaders(
    new Request("https://www.taijuda.test/administrator-guide/"),
    new Response("public", { headers: { "cache-control": "public, max-age=300" } }),
  );

  assert.equal(response.headers.get("cache-control"), "public, max-age=300");
});
