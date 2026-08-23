import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PUBLIC_SITE_CODE,
  normalizePublicSiteCode,
} from "../shared/site-context.ts";

test("public site codes are normalized and fail closed to the reviewed tenant", () => {
  assert.equal(normalizePublicSiteCode("  BRAND-TWO "), "brand-two");
  assert.equal(normalizePublicSiteCode("brand_two"), DEFAULT_PUBLIC_SITE_CODE);
  assert.equal(normalizePublicSiteCode("../other-site"), DEFAULT_PUBLIC_SITE_CODE);
  assert.equal(normalizePublicSiteCode(""), DEFAULT_PUBLIC_SITE_CODE);
  assert.equal(normalizePublicSiteCode(null), DEFAULT_PUBLIC_SITE_CODE);
});
