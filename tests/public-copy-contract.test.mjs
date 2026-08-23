import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

const transactionPaths = [
  "app/storefront.tsx",
  "app/checkout-dialog.tsx",
  "app/device-cart-link.tsx",
  "app/product-dialog.tsx",
  "app/products/[slug]/product-actions.tsx",
  "app/products/[slug]/product-live-view.tsx",
];

const publicPaths = [
  ...transactionPaths,
  "app/about/page.tsx",
  "app/account/account-client.tsx",
  "app/articles/page.tsx",
  "app/articles/[slug]/page.tsx",
  "app/journal-section.tsx",
  "app/public-header.tsx",
  "app/public-footer.tsx",
  "app/service/contact/page.tsx",
  "app/service/privacy/page.tsx",
  "app/service/returns/page.tsx",
  "app/service/shipping/page.tsx",
  "app/site-builder/blocks.tsx",
  "shared/default-page.ts",
  "shared/site-settings.ts",
  "content/published-site.json",
];

test("public transaction surfaces use familiar Taiwan ecommerce terms", async () => {
  const copy = (await Promise.all(transactionPaths.map(source))).join("\n");
  for (const expected of [
    "購物車",
    "前往結帳",
    "填寫訂購資料",
    "送出訂單",
    "訂單已送出",
    "商品編號",
  ]) {
    assert.ok(copy.includes(expected), "missing standard public term: " + expected);
  }
});

test("customer-facing sources do not reintroduce internal or novelty labels", async () => {
  const files = await Promise.all(publicPaths.map(async (relativePath) => ({
    relativePath,
    text: await source(relativePath),
  })));
  const banned = [
    "收藏袋",
    "保留單",
    "送單索引",
    "本週新藏",
    "收藏誌",
    "來源履歷",
    "藏品履歷",
    "典藏編號",
    "版型示範",
    "SEO 覆核",
    "SEO覆核",
    "商品快照",
    "公開 SEO 版",
    "GitHub Pages",
    "專案資料夾",
    "管理員允許名單",
    "網站預覽版",
    "OBJECT RECORD",
    "RESERVATION RECEIVED",
    "MEMBER CENTRE",
    "ARCHIVE LETTER",
  ];

  for (const file of files) {
    for (const phrase of banned) {
      assert.ok(
        !file.text.includes(phrase),
        file.relativePath + " contains banned customer-facing phrase: " + phrase,
      );
    }
  }
});

test("unverified product facts stay behind an explicit publication gate", async () => {
  const [storefront, productPage] = await Promise.all([
    source("app/storefront.tsx"),
    source("app/products/[slug]/product-live-view.tsx"),
  ]);

  assert.match(storefront, /const detailsConfirmed = catalogLive && product\.seoReady === true/);
  assert.match(storefront, /const localCommerceDemo = orderReadiness\.localDemo && catalogLive/);
  assert.match(storefront, /\(!localCommerceDemo && product\.seoReady !== true\)/);
  assert.match(storefront, /selected\.seoReady === true/);
  assert.match(productPage, /liveConfirmed && product\.seoReady === true/);
  assert.match(productPage, /const localTestDetails = liveConfirmed && localDemo/);
  assert.match(productPage, /availabilityConfirmed=\{detailsConfirmed \|\| localTestDetails\}/);
});

test("public chrome and storefront controls share one accessible contract", async () => {
  const [storefront, header, footer, journal, artwork, articleData, globalStyles] = await Promise.all([
    source("app/storefront.tsx"),
    source("app/public-header.tsx"),
    source("app/public-footer.tsx"),
    source("app/journal-section.tsx"),
    source("app/product-artwork.tsx"),
    source("app/article-data.ts"),
    source("app/globals.css"),
  ]);

  assert.match(storefront, /<PublicHeader/);
  assert.match(storefront, /<PublicFooter/);
  assert.doesNotMatch(storefront, /className="site-header"/);
  assert.match(storefront, /aria-pressed=\{resolvedActiveFilter === filter\}/);
  assert.match(storefront, /setActiveFilter\(ALL_PRODUCTS_FILTER\)/);
  assert.match(header, /aria-expanded=\{searchExpanded\}/);
  assert.match(header, /aria-controls=\{searchControls\}/);
  assert.match(header, /primaryLinks\.map/);
  assert.match(header, /safeInternalNavigationHref/);
  assert.match(footer, /mainLinks\.map/);
  assert.match(footer, /\/service\/contact\//);
  assert.match(footer, /\/service\/privacy\//);
  for (const sectionId of ["hero", "collections", "products", "themes", "archive"]) {
    assert.equal((storefront.match(new RegExp(`id="${sectionId}"`, "g")) || []).length, 1, `${sectionId} must render exactly once`);
  }
  assert.equal((journal.match(/id="journal"/g) || []).length, 1);
  assert.equal((storefront.match(/<h1>/g) || []).length, 1);
  assert.match(storefront, /homeSectionProps\("collections"\)/);
  assert.match(storefront, /homeSectionProps\("journal"\)/);
  assert.doesNotMatch(artwork, /PROTOTYPE VISUAL/);
  assert.match(artwork, /alt=""/);
  assert.match(articleData, /分鐘閱讀/);
  assert.match(globalStyles, /scroll-margin-top/);
  assert.match(globalStyles, /\.home-section-layout\s*\{[^}]*display:\s*flex/);
  assert.doesNotMatch(globalStyles, /product-card:nth-child\(n\+7\)/);
});
