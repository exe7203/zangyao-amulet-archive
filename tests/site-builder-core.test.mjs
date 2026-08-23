import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { createStarterPageData } from "../app/site-builder/types.ts";
import {
  evaluatePageSeoPublishReadiness,
  PAGE_SEO_PUBLISH_REQUIREMENTS,
  validatePageData,
} from "../app/site-builder/validation.ts";
import {
  colorContrastRatio,
  DEFAULT_SITE_APPEARANCE,
  evaluateSiteThemeContrast,
  MIN_SITE_THEME_CONTRAST,
  normalizeSiteAppearance,
  safeInternalNavigationHref,
  validateSiteSettingsStructure,
} from "../shared/site-settings.ts";
import { cleanUrl } from "../worker/api-utils.ts";
import { handleSiteApi } from "../worker/site-api.ts";

let miniflare;
let db;

function jsonRequest(path, method = "GET", body) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body ? { "content-type": "application/json", origin: "http://localhost" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

before(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    compatibilityDate: "2026-05-22",
    d1Databases: { DB: "site-builder-core-test" },
  });
  db = await miniflare.getD1Database("DB");
  for (const statement of [
    "CREATE TABLE schema_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE sites (id TEXT PRIMARY KEY NOT NULL, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, locale TEXT NOT NULL DEFAULT 'zh-Hant-TW', currency TEXT NOT NULL DEFAULT 'TWD', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE site_settings (site_id TEXT PRIMARY KEY NOT NULL, settings_json TEXT NOT NULL DEFAULT '{}', theme_json TEXT NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 1, updated_by TEXT NOT NULL DEFAULT 'system', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE site_settings_revisions (id TEXT PRIMARY KEY NOT NULL, site_id TEXT NOT NULL, settings_json TEXT NOT NULL, theme_json TEXT NOT NULL, version INTEGER NOT NULL, saved_by TEXT NOT NULL DEFAULT 'system', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE site_pages (id TEXT PRIMARY KEY NOT NULL, site_id TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, data_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', seo_title TEXT NOT NULL DEFAULT '', seo_description TEXT NOT NULL DEFAULT '', canonical_url TEXT NOT NULL DEFAULT '', og_image_url TEXT NOT NULL DEFAULT '', noindex INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, published_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE site_page_revisions (id TEXT PRIMARY KEY NOT NULL, page_id TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, data_json TEXT NOT NULL, status TEXT NOT NULL, seo_title TEXT NOT NULL DEFAULT '', seo_description TEXT NOT NULL DEFAULT '', canonical_url TEXT NOT NULL DEFAULT '', og_image_url TEXT NOT NULL DEFAULT '', noindex INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL, saved_by TEXT NOT NULL DEFAULT 'system', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE UNIQUE INDEX site_pages_site_slug_unique ON site_pages (site_id, slug)",
    "CREATE UNIQUE INDEX site_settings_revisions_site_version_unique ON site_settings_revisions (site_id, version)",
    "CREATE UNIQUE INDEX site_page_revisions_page_version_unique ON site_page_revisions (page_id, version)",
  ]) await db.prepare(statement).run();
  await db.batch([
    db.prepare("INSERT INTO schema_metadata (key, value) VALUES ('schema_version', '7')"),
    db.prepare("INSERT INTO sites (id, code, name) VALUES ('site_taijuda', 'taijuda', '泰聚達')"),
  ]);
});

test("site identity settings are versioned, sanitized, and available to the public storefront", async () => {
  const initialResponse = await handleSiteApi(
    jsonRequest("/api/admin/site-settings?site=taijuda"),
    { DB: db },
  );
  assert.equal(initialResponse?.status, 200);
  const initial = await initialResponse.json();
  assert.equal(initial.siteSettings.version, 1);

  const saveResponse = await handleSiteApi(jsonRequest("/api/admin/site-settings", "POST", {
    siteCode: "taijuda",
    version: initial.siteSettings.version,
    settings: {
      announcement: "來源清楚，安心收藏",
      brandName: "泰聚達",
      brandSubtitle: "TAIJUDA ARCHIVE",
      footerNote: "正式商品均須完成來源與實物覆核。",
      homeHeroEyebrow: "TAIJUDA · TAIWAN",
      homeHeroTitlePrimary: "先讀懂來源，",
      homeHeroTitleSecondary: "再決定是否收藏。",
      homeHeroLead: "每件藏品都應把年份、材質、尺寸與來源說清楚。",
      homePrimaryCtaLabel: "查看新藏",
      homeSecondaryCtaLabel: "閱讀指南",
      homeCollectionsTitle: "依形制認識藏品",
      homeCollectionsIntro: "先從外型與文化脈絡開始，不用急著替信仰貼標籤。",
      homeArrivalsTitle: "近期入藏",
      primaryNavigation: [
        { label: "首頁", href: "/" },
        { label: "商品", href: "/#products" },
        { label: "文章", href: "/articles/" },
      ],
      homeSectionOrder: [
        { id: "hero", visible: true },
        { id: "products", visible: true },
        { id: "journal", visible: true },
        { id: "collections", visible: true },
        { id: "archive", visible: true },
        { id: "themes", visible: false },
      ],
      secretInternalNote: "must-not-be-stored",
    },
    theme: { accent: "#b89048", surface: "#faf7ef", ink: "javascript:alert(1)" },
  }), { DB: db });
  assert.equal(saveResponse?.status, 200);
  const savedV2 = await saveResponse.json();
  assert.equal(savedV2.siteSettings.version, 2);

  const publicResponse = await handleSiteApi(
    jsonRequest("/api/content/site-settings?site=taijuda"),
    { DB: db },
  );
  assert.equal(publicResponse?.status, 200);
  const payload = await publicResponse.json();
  assert.equal(payload.siteSettings.settings.announcement, "來源清楚，安心收藏");
  assert.equal(payload.siteSettings.settings.homeHeroTitlePrimary, "先讀懂來源，");
  assert.equal(payload.siteSettings.settings.homeArrivalsTitle, "近期入藏");
  assert.deepEqual(payload.siteSettings.settings.primaryNavigation, [
    { label: "首頁", href: "/" },
    { label: "商品", href: "/#products" },
    { label: "文章", href: "/articles/" },
  ]);
  assert.deepEqual(payload.siteSettings.settings.homeSectionOrder.map((section) => [section.id, section.visible]), [
    ["hero", true],
    ["products", true],
    ["journal", true],
    ["collections", true],
    ["archive", true],
    ["themes", false],
  ]);
  assert.equal(payload.siteSettings.theme.accent, "#b89048");
  assert.equal(payload.siteSettings.theme.ink, "#12100e");
  assert.equal(payload.siteSettings.settings.secretInternalNote, undefined);
  assert.equal(payload.siteSettings.updatedBy, undefined);

  const staleSaveResponse = await handleSiteApi(jsonRequest("/api/admin/site-settings", "POST", {
    siteCode: "taijuda",
    version: 1,
    settings: savedV2.siteSettings.settings,
    theme: savedV2.siteSettings.theme,
  }), { DB: db });
  assert.equal(staleSaveResponse?.status, 409);

  const saveV3Response = await handleSiteApi(jsonRequest("/api/admin/site-settings", "POST", {
    siteCode: "taijuda",
    version: 2,
    settings: { ...savedV2.siteSettings.settings, announcement: "第三版公告" },
    theme: savedV2.siteSettings.theme,
  }), { DB: db });
  assert.equal(saveV3Response?.status, 200);
  const savedV3 = await saveV3Response.json();
  assert.equal(savedV3.siteSettings.version, 3);

  const historyResponse = await handleSiteApi(
    jsonRequest("/api/admin/site-settings/revisions?site=taijuda&limit=2&offset=0"),
    { DB: db },
  );
  assert.equal(historyResponse?.status, 200);
  const history = await historyResponse.json();
  assert.deepEqual(history.revisions.map((revision) => revision.version), [3, 2]);
  assert.deepEqual(history.pagination, { limit: 2, offset: 0, total: 3, hasMore: true });
  assert.equal(history.revisions[1].settings.announcement, "來源清楚，安心收藏");
  assert.equal(history.revisions[1].settings.primaryNavigation[1].href, "/#products");
  assert.equal(history.revisions[1].settings.homeSectionOrder[2].id, "journal");

  const olderHistoryResponse = await handleSiteApi(
    jsonRequest("/api/admin/site-settings/revisions?site=taijuda&limit=2&offset=2"),
    { DB: db },
  );
  const olderHistory = await olderHistoryResponse.json();
  assert.equal(olderHistory.revisions[0].version, 1);
  assert.equal(olderHistory.pagination.hasMore, false);

  const restoreResponse = await handleSiteApi(jsonRequest(
    "/api/admin/site-settings/revisions",
    "POST",
    {
      siteCode: "taijuda",
      revisionId: olderHistory.revisions[0].revisionId,
      expectedVersion: 3,
    },
  ), { DB: db });
  assert.equal(restoreResponse?.status, 200);
  const restored = await restoreResponse.json();
  assert.equal(restored.siteSettings.version, 4);
  assert.deepEqual(restored.siteSettings.settings.primaryNavigation, DEFAULT_SITE_APPEARANCE.settings.primaryNavigation);
  assert.deepEqual(restored.siteSettings.settings.homeSectionOrder, DEFAULT_SITE_APPEARANCE.settings.homeSectionOrder);

  const staleRestoreResponse = await handleSiteApi(jsonRequest(
    "/api/admin/site-settings/revisions",
    "POST",
    {
      siteCode: "taijuda",
      revisionId: olderHistory.revisions[0].revisionId,
      expectedVersion: 3,
    },
  ), { DB: db });
  assert.equal(staleRestoreResponse?.status, 409);

  const immutableRows = await db.prepare(`SELECT version, saved_by, settings_json
    FROM site_settings_revisions WHERE site_id = 'site_taijuda' ORDER BY version`).all();
  assert.deepEqual(immutableRows.results.map((row) => row.version), [1, 2, 3, 4]);
  assert.equal(JSON.parse(immutableRows.results[1].settings_json).announcement, "來源清楚，安心收藏");
  assert.equal(JSON.parse(immutableRows.results[2].settings_json).announcement, "第三版公告");
  assert.equal(immutableRows.results[3].saved_by, "local-preview");
});

test("remote site-settings history requires an authenticated administrator", async () => {
  const response = await handleSiteApi(
    new Request("https://admin.example/api/admin/site-settings/revisions?site=taijuda", {
      headers: { accept: "application/json" },
    }),
    { DB: db },
  );
  assert.equal(response?.status, 401);
});

test("navigation and homepage layout normalize old JSON but reject unsafe explicit structures", async () => {
  const legacy = normalizeSiteAppearance({ brandName: "舊站台" }, {});
  assert.deepEqual(legacy.settings.primaryNavigation, DEFAULT_SITE_APPEARANCE.settings.primaryNavigation);
  assert.deepEqual(legacy.settings.homeSectionOrder, DEFAULT_SITE_APPEARANCE.settings.homeSectionOrder);
  assert.equal(safeInternalNavigationHref("/#products"), "/#products");
  assert.equal(safeInternalNavigationHref("#journal"), "#journal");
  for (const unsafe of ["//evil.example/path", "https://evil.example/", "https://user:secret@example.com/", "javascript:alert(1)", "/\\evil.example/"]) {
    assert.equal(safeInternalNavigationHref(unsafe), null, `accepted unsafe navigation href: ${unsafe}`);
  }

  const currentResponse = await handleSiteApi(jsonRequest("/api/admin/site-settings?site=taijuda"), { DB: db });
  const current = await currentResponse.json();
  const dangerousNavigation = {
    ...current.siteSettings.settings,
    primaryNavigation: [
      { label: "首頁", href: "/" },
      { label: "商品", href: "/#products" },
      { label: "外部", href: "https://user:secret@example.com/" },
    ],
  };
  assert.match(validateSiteSettingsStructure(dangerousNavigation), /主要導覽/);
  const rejectedNavigation = await handleSiteApi(jsonRequest("/api/admin/site-settings", "POST", {
    siteCode: "taijuda",
    version: current.siteSettings.version,
    settings: dangerousNavigation,
    theme: current.siteSettings.theme,
  }), { DB: db });
  assert.equal(rejectedNavigation?.status, 400);
  assert.match((await rejectedNavigation.json()).error, /主要導覽/);

  const hiddenRequiredSection = {
    ...current.siteSettings.settings,
    homeSectionOrder: current.siteSettings.settings.homeSectionOrder.map((section) => section.id === "hero"
      ? { ...section, visible: false }
      : section),
  };
  assert.match(validateSiteSettingsStructure(hiddenRequiredSection), /首頁區塊/);
  const rejectedLayout = await handleSiteApi(jsonRequest("/api/admin/site-settings", "POST", {
    siteCode: "taijuda",
    version: current.siteSettings.version,
    settings: hiddenRequiredSection,
    theme: current.siteSettings.theme,
  }), { DB: db });
  assert.equal(rejectedLayout?.status, 400);

  const afterResponse = await handleSiteApi(jsonRequest("/api/admin/site-settings?site=taijuda"), { DB: db });
  const after = await afterResponse.json();
  assert.equal(after.siteSettings.version, current.siteSettings.version);
});

test("server URL normalization rejects credentials and overlong values without truncation", () => {
  assert.equal(cleanUrl("https://cdn.example.com/image.webp"), "https://cdn.example.com/image.webp");
  assert.equal(cleanUrl("https://user:secret@cdn.example.com/image.webp"), "");
  assert.equal(cleanUrl(`https://example.com/${"a".repeat(1000)}`), "");
  assert.equal(cleanUrl("javascript:alert(1)"), "");
});

test("theme contrast uses the WCAG ratio and requires both supported color pairs", () => {
  assert.equal(colorContrastRatio("#000000", "#ffffff"), 21);
  assert.equal(colorContrastRatio("not-a-color", "#ffffff"), null);

  const defaults = evaluateSiteThemeContrast(DEFAULT_SITE_APPEARANCE.theme);
  assert.equal(defaults.minimum, MIN_SITE_THEME_CONTRAST);
  assert.equal(defaults.passesInkSurface, true);
  assert.equal(defaults.passesInkAccent, true);
  assert.equal(defaults.passesArchivePalette, true);
  assert.equal(defaults.ok, true);

  const unsafe = evaluateSiteThemeContrast({ ink: "#171713", surface: "#fbf9f2", accent: "#191919" });
  assert.equal(unsafe.passesInkSurface, true);
  assert.equal(unsafe.passesInkAccent, false);
  assert.equal(unsafe.ok, false);

  const inverted = evaluateSiteThemeContrast({ ink: "#ffffff", surface: "#000000", accent: "#0000ff" });
  assert.equal(inverted.passesInkSurface, true);
  assert.equal(inverted.passesInkAccent, true);
  assert.equal(inverted.passesArchivePalette, false);
  assert.equal(inverted.ok, false);
});

test("site settings reject low-contrast themes without advancing the saved version", async () => {
  const beforeResponse = await handleSiteApi(
    jsonRequest("/api/admin/site-settings?site=taijuda"),
    { DB: db },
  );
  assert.equal(beforeResponse?.status, 200);
  const before = await beforeResponse.json();

  const rejectedResponse = await handleSiteApi(jsonRequest("/api/admin/site-settings", "POST", {
    siteCode: "taijuda",
    version: before.siteSettings.version,
    settings: before.siteSettings.settings,
    theme: { ink: "#171713", surface: "#fbf9f2", accent: "#191919" },
  }), { DB: db });
  assert.equal(rejectedResponse?.status, 400);
  const rejected = await rejectedResponse.json();
  assert.match(rejected.error, /4\.5:1/);
  assert.equal(rejected.contrast.passesInkSurface, true);
  assert.equal(rejected.contrast.passesInkAccent, false);

  const invertedResponse = await handleSiteApi(jsonRequest("/api/admin/site-settings", "POST", {
    siteCode: "taijuda",
    version: before.siteSettings.version,
    settings: before.siteSettings.settings,
    theme: { ink: "#ffffff", surface: "#000000", accent: "#0000ff" },
  }), { DB: db });
  assert.equal(invertedResponse?.status, 400);
  const inverted = await invertedResponse.json();
  assert.equal(inverted.contrast.passesInkSurface, true);
  assert.equal(inverted.contrast.passesInkAccent, true);
  assert.equal(inverted.contrast.passesArchivePalette, false);

  const afterResponse = await handleSiteApi(
    jsonRequest("/api/admin/site-settings?site=taijuda"),
    { DB: db },
  );
  const afterPayload = await afterResponse.json();
  assert.equal(afterPayload.siteSettings.version, before.siteSettings.version);
  assert.equal(afterPayload.siteSettings.theme.accent, before.siteSettings.theme.accent);
});

after(async () => {
  await miniflare?.dispose();
});

test("Puck page validation rejects unsafe or ambiguous block documents", () => {
  const valid = createStarterPageData();
  assert.equal(validatePageData(valid).ok, true);

  const duplicateIds = structuredClone(valid);
  duplicateIds.content[1].props.id = duplicateIds.content[0].props.id;
  assert.equal(validatePageData(duplicateIds).ok, false);

  const unsafeLink = structuredClone(valid);
  unsafeLink.content[0].props.primaryHref = "javascript:alert(1)";
  assert.equal(validatePageData(unsafeLink).ok, false);

  const credentialLink = structuredClone(valid);
  credentialLink.content[0].props.primaryHref = "https://user:secret@example.com/collection";
  assert.equal(validatePageData(credentialLink).ok, false);

  const unsafeImage = structuredClone(valid);
  unsafeImage.content.push({
    type: "ImageFeature",
    props: {
      id: "unsafe-image",
      eyebrow: "IMAGE",
      title: "圖片區塊",
      tone: "paper",
      body: "圖片說明",
      imageUrl: "mailto:someone@example.com",
      imageAlt: "圖片替代文字",
      imagePosition: "left",
      buttonLabel: "",
      buttonHref: "",
    },
  });
  assert.equal(validatePageData(unsafeImage).ok, false);

  const overlongImage = structuredClone(unsafeImage);
  overlongImage.content.at(-1).props.imageUrl = `https://example.com/${"a".repeat(1000)}`;
  assert.equal(validatePageData(overlongImage).ok, false);

  const arbitraryHtml = structuredClone(valid);
  arbitraryHtml.content.push({ type: "RawHtml", props: { id: "raw", html: "<script>alert(1)</script>" } });
  assert.equal(validatePageData(arbitraryHtml).ok, false);
});

test("Puck page publishing uses the same minimum SEO lengths as article publishing", () => {
  assert.equal(PAGE_SEO_PUBLISH_REQUIREMENTS.seoTitleLength, 8);
  assert.equal(PAGE_SEO_PUBLISH_REQUIREMENTS.seoDescriptionLength, 50);
  assert.equal(evaluatePageSeoPublishReadiness({
    seoTitle: "字".repeat(7),
    seoDescription: "字".repeat(50),
  }).ok, false);
  assert.equal(evaluatePageSeoPublishReadiness({
    seoTitle: "字".repeat(8),
    seoDescription: "字".repeat(49),
  }).ok, false);
  assert.equal(evaluatePageSeoPublishReadiness({
    seoTitle: "字".repeat(8),
    seoDescription: "字".repeat(50),
  }).ok, true);
});

test("Puck starter anchor resolves once without duplicating ids on text blocks", async () => {
  const blockSource = await readFile(new URL("../app/site-builder/blocks.tsx", import.meta.url), "utf8");
  const heroSource = blockSource.slice(blockSource.indexOf("export function HeroBlock"), blockSource.indexOf("export function TextBlock"));
  const textSource = blockSource.slice(blockSource.indexOf("export function TextBlock"), blockSource.indexOf("export function ImageFeatureBlock"));
  assert.match(heroSource, /<span id="content" aria-hidden="true" \/>/);
  assert.doesNotMatch(textSource, /id="content"/);
  assert.equal(createStarterPageData().content[0].props.primaryHref, "#content");
});

test("site API rejects credentialed links and oversized or non-image Puck URLs", async () => {
  const cases = [];
  const credentialLink = createStarterPageData();
  credentialLink.content[0].props.primaryHref = "https://user:secret@example.com/collection";
  cases.push(["unsafe-credential-link", credentialLink]);

  for (const [slug, imageUrl] of [
    ["unsafe-mailto-image", "mailto:someone@example.com"],
    ["unsafe-long-image", `https://example.com/${"a".repeat(1000)}`],
  ]) {
    const data = createStarterPageData();
    data.content.push({
      type: "ImageFeature",
      props: {
        id: `${slug}-block`, eyebrow: "IMAGE", title: "圖片區塊", tone: "paper",
        body: "圖片說明", imageUrl, imageAlt: "圖片替代文字",
        imagePosition: "left", buttonLabel: "", buttonHref: "",
      },
    });
    cases.push([slug, data]);
  }

  for (const [slug, data] of cases) {
    const response = await handleSiteApi(jsonRequest("/api/admin/pages", "POST", {
      siteCode: "taijuda", slug, title: slug, data, status: "draft", version: 0,
    }), { DB: db });
    assert.equal(response?.status, 400, slug);
  }
});

test("Puck product showcase renders stored product artwork through the safe image leaf", async () => {
  const [blockSource, typeSource, imageSource] = await Promise.all([
    readFile(new URL("../app/site-builder/blocks.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/site-builder/types.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/product-artwork.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(typeSource, /imageUrl\?: string/);
  assert.match(typeSource, /imageAlt\?: string/);
  assert.match(blockSource, /src=\{item\.imageUrl\}/);
  assert.match(blockSource, /item\.imageAlt/);
  assert.match(blockSource, /<SafePublicImage/);
  assert.match(blockSource, /src=\{props\.imageUrl\}/);
  assert.match(blockSource, /圖片尚未設定或無法載入/);
  assert.match(imageSource, /onError=\{\(\) => setFailedSrc\(safeSrc\)\}/);
  assert.doesNotMatch(imageSource, /javascript:|data:image/);
});

test("stable homepage copy, navigation, layout, and page social image controls are wired to published settings", async () => {
  const [storefrontSource, editorSource, headerSource, footerSource, accountStyles] = await Promise.all([
    readFile(new URL("../app/storefront.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/site/site-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/public-header.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/public-footer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/account/account.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(storefrontSource, /appearance\.settings\.homeHeroTitlePrimary/);
  assert.match(storefrontSource, /appearance\.settings\.homeCollectionsIntro/);
  assert.match(storefrontSource, /appearance\.settings\.homeArrivalsTitle/);
  assert.match(storefrontSource, /appearance\.settings\.homeSectionOrder\.map/);
  assert.match(storefrontSource, /homeSectionProps\("hero"\)/);
  assert.match(storefrontSource, /homeSectionProps\("products"\)/);
  assert.match(storefrontSource, /primaryNavigation=\{appearance\.settings\.primaryNavigation\}/);
  assert.match(editorSource, /updateIdentitySetting\("homeHeroTitlePrimary"/);
  assert.match(editorSource, /updateIdentitySetting\("homeCollectionsIntro"/);
  assert.match(editorSource, /updateIdentitySetting\("primaryNavigation"/);
  assert.match(editorSource, /updateIdentitySetting\("homeSectionOrder"/);
  assert.match(editorSource, /主視覺與最新商品為商店必備/);
  assert.match(headerSource, /primaryLinks\.map/);
  assert.match(headerSource, /safeInternalNavigationHref/);
  assert.match(footerSource, /mainLinks\.map/);
  assert.match(footerSource, /\/service\/privacy\//);
  assert.match(editorSource, /<SafePublicImage src=\{draft\.ogImageUrl\}/);
  assert.match(editorSource, /maxLength=\{ADMIN_IMAGE_URL_MAX_LENGTH\}/);
  assert.match(editorSource, /api\/admin\/site-settings\/revisions/);
  assert.match(editorSource, /expectedVersion: siteSettingsVersion/);
  assert.match(editorSource, /siteSettingsDirty && !window\.confirm/);
  assert.match(accountStyles, /var\(--site-surface\)/);
  assert.match(accountStyles, /var\(--site-ink\)/);
});

test("site editor publishes a versioned page and protects stale writes", async () => {
  const pageData = createStarterPageData();
  const initialResponse = await handleSiteApi(jsonRequest("/api/admin/pages", "POST", {
    siteCode: "taijuda",
    slug: "collection-guide",
    title: "收藏入門頁",
    data: pageData,
    status: "published",
    seoTitle: "泰國佛牌收藏入門頁｜泰聚達",
    seoDescription: "這是一段超過五十個字的網站頁面描述，用來確認頁面編輯器發布、版本控管、公開讀取與搜尋引擎欄位都能安全且一致地運作。",
    canonicalUrl: "",
    ogImageUrl: "",
    noindex: false,
    version: 0,
  }), { DB: db });
  assert.equal(initialResponse?.status, 201);
  const initial = await initialResponse.json();
  assert.equal(initial.page.version, 1);
  assert.equal(initial.page.status, "published");

  const staleResponse = await handleSiteApi(jsonRequest("/api/admin/pages", "POST", {
    ...initial.page,
    siteCode: "taijuda",
    title: "過期寫入不應成功",
    version: 0,
  }), { DB: db });
  assert.equal(staleResponse?.status, 409);

  const updatedResponse = await handleSiteApi(jsonRequest("/api/admin/pages", "POST", {
    ...initial.page,
    siteCode: "taijuda",
    title: "收藏入門頁第二版",
    version: 1,
  }), { DB: db });
  assert.equal(updatedResponse?.status, 200);
  const updated = await updatedResponse.json();
  assert.equal(updated.page.version, 2);

  const publicResponse = await handleSiteApi(
    jsonRequest("/api/content/pages/collection-guide?site=taijuda"),
    { DB: db },
  );
  assert.equal(publicResponse?.status, 200);
  const publicPayload = await publicResponse.json();
  assert.equal(publicPayload.page.title, "收藏入門頁第二版");
  assert.equal(publicPayload.page.status, "published");

  const historyResponse = await handleSiteApi(
    jsonRequest(`/api/admin/pages/${encodeURIComponent(updated.page.id)}/revisions?site=taijuda`),
    { DB: db },
  );
  assert.equal(historyResponse?.status, 200);
  const history = await historyResponse.json();
  assert.deepEqual(history.revisions.map((revision) => revision.version).sort(), [1, 2]);
  const firstRevision = history.revisions.find((revision) => revision.version === 1);

  const restoreResponse = await handleSiteApi(
    jsonRequest(`/api/admin/pages/${encodeURIComponent(updated.page.id)}/revisions`, "POST", {
      siteCode: "taijuda",
      revisionId: firstRevision.revisionId,
      version: 2,
    }),
    { DB: db },
  );
  assert.equal(restoreResponse?.status, 200);
  const restored = await restoreResponse.json();
  assert.equal(restored.page.title, "收藏入門頁");
  assert.equal(restored.page.status, "draft");
  assert.equal(restored.page.version, 3);

  const staleRestoreResponse = await handleSiteApi(
    jsonRequest(`/api/admin/pages/${encodeURIComponent(updated.page.id)}/revisions`, "POST", {
      siteCode: "taijuda",
      revisionId: firstRevision.revisionId,
      version: 2,
    }),
    { DB: db },
  );
  assert.equal(staleRestoreResponse?.status, 409);

  const revisions = await db.prepare("SELECT version, status, saved_by FROM site_page_revisions WHERE page_id = ? ORDER BY version")
    .bind(updated.page.id).all();
  assert.deepEqual(revisions.results, [
    { version: 1, status: "published", saved_by: "local-preview" },
    { version: 2, status: "published", saved_by: "local-preview" },
    { version: 3, status: "draft", saved_by: "local-preview" },
  ]);

  const staleArchiveResponse = await handleSiteApi(
    jsonRequest(`/api/admin/pages/${encodeURIComponent(updated.page.id)}?site=taijuda`, "DELETE", {
      siteCode: "taijuda",
      expectedVersion: 2,
    }),
    { DB: db },
  );
  assert.equal(staleArchiveResponse?.status, 409);

  const archiveResponse = await handleSiteApi(
    jsonRequest(`/api/admin/pages/${encodeURIComponent(updated.page.id)}?site=taijuda`, "DELETE", {
      siteCode: "taijuda",
      expectedVersion: 3,
    }),
    { DB: db },
  );
  assert.equal(archiveResponse?.status, 200);
  assert.deepEqual(await archiveResponse.json(), { ok: true, version: 4 });

  const archivedPage = await db.prepare(
    "SELECT status, version FROM site_pages WHERE id = ?",
  ).bind(updated.page.id).first();
  assert.deepEqual(archivedPage, { status: "archived", version: 4 });
  const archivedRevisions = await db.prepare(
    "SELECT version, status FROM site_page_revisions WHERE page_id = ? ORDER BY version",
  ).bind(updated.page.id).all();
  assert.deepEqual(archivedRevisions.results, [
    { version: 1, status: "published" },
    { version: 2, status: "published" },
    { version: 3, status: "draft" },
    { version: 4, status: "archived" },
  ]);
});

test("admin page list searches, filters, paginates, and escapes LIKE wildcards", async () => {
  const data = JSON.stringify(createStarterPageData());
  const rows = [
    ["page-list-a", "page-list-a", "頁面稽核 PAGE%_TOKEN", "draft", "2026-08-12T09:05:00.000Z"],
    ["page-list-b", "page-list-b", "頁面稽核 第二頁", "draft", "2026-08-12T09:04:00.000Z"],
    ["page-list-c", "page-list-c", "頁面稽核 第三頁", "draft", "2026-08-12T09:03:00.000Z"],
    ["page-list-d", "page-list-d", "頁面稽核 已發布", "published", "2026-08-12T09:02:00.000Z"],
    ["page-list-e", "page-list-e", "頁面稽核 已封存", "archived", "2026-08-12T09:01:00.000Z"],
  ];
  await db.batch(rows.map(([id, slug, title, status, updatedAt]) => db.prepare(`INSERT INTO site_pages (
    id, site_id, slug, title, data_json, status, seo_title, seo_description, updated_at
  ) VALUES (?, 'site_taijuda', ?, ?, ?, ?, '頁面清單稽核標題', '這是頁面清單分頁測試使用的說明文字，用來確認後台搜尋與狀態篩選不會遺漏任何必要欄位。', ?)`)
    .bind(id, slug, title, data, status, updatedAt)));

  const filteredResponse = await handleSiteApi(
    jsonRequest("/api/admin/pages?site=taijuda&q=%E9%A0%81%E9%9D%A2%E7%A8%BD%E6%A0%B8&status=draft&page=1&limit=2"),
    { DB: db },
  );
  assert.equal(filteredResponse?.status, 200);
  const filtered = await filteredResponse.json();
  assert.equal(filtered.site.code, "taijuda");
  assert.equal(filtered.pages.length, 2);
  assert.ok(filtered.pages.every((page) => page.status === "draft"));
  assert.deepEqual(filtered.pagination, {
    page: 1,
    limit: 2,
    maxLimit: 100,
    total: 3,
    totalPages: 2,
    returned: 2,
  });

  const secondPageResponse = await handleSiteApi(
    jsonRequest("/api/admin/pages?site=taijuda&q=%E9%A0%81%E9%9D%A2%E7%A8%BD%E6%A0%B8&status=draft&page=2&limit=2"),
    { DB: db },
  );
  const secondPage = await secondPageResponse.json();
  assert.equal(secondPage.pages.length, 1);
  assert.equal(secondPage.pagination.returned, 1);

  const outOfRangeResponse = await handleSiteApi(
    jsonRequest("/api/admin/pages?site=taijuda&q=%E9%A0%81%E9%9D%A2%E7%A8%BD%E6%A0%B8&status=draft&page=99&limit=2"),
    { DB: db },
  );
  const outOfRange = await outOfRangeResponse.json();
  assert.deepEqual(outOfRange.pages, []);
  assert.equal(outOfRange.pagination.page, 99);
  assert.equal(outOfRange.pagination.total, 3);
  assert.equal(outOfRange.pagination.returned, 0);

  const literalResponse = await handleSiteApi(
    jsonRequest(`/api/admin/pages?site=taijuda&q=${encodeURIComponent("PAGE%_TOKEN")}`),
    { DB: db },
  );
  const literal = await literalResponse.json();
  assert.equal(literal.pagination.limit, 40);
  assert.equal(literal.pagination.total, 1);
  assert.equal(literal.pages[0].id, "page-list-a");

  const cappedResponse = await handleSiteApi(
    jsonRequest("/api/admin/pages?site=taijuda&q=%E9%A0%81%E9%9D%A2%E7%A8%BD%E6%A0%B8&limit=999"),
    { DB: db },
  );
  const capped = await cappedResponse.json();
  assert.equal(capped.pagination.limit, 100);
  assert.equal(capped.pagination.returned, 5);

  const invalidStatusResponse = await handleSiteApi(
    jsonRequest("/api/admin/pages?site=taijuda&status=unknown"),
    { DB: db },
  );
  assert.equal(invalidStatusResponse?.status, 400);
});
