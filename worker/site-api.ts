import {
  adminIdentity,
  cleanSlug,
  cleanText,
  cleanUrl,
  isRecord,
  json,
  publicJson,
  readJsonObject,
  validateWriteRequest,
} from "./api-utils";
import {
  DEFAULT_SITE_CODE,
  ensureDatabase,
  findSite,
  type DatabaseEnv,
} from "./database";
import {
  evaluateSiteThemeContrast,
  MIN_SITE_THEME_CONTRAST,
  normalizeSiteAppearance,
} from "../shared/site-settings";

const PAGE_STATUSES = new Set(["draft", "published", "archived"]);
const PAGE_BLOCK_TYPES = new Set([
  "Hero",
  "Text",
  "ImageFeature",
  "Features",
  "FAQ",
  "CTA",
  "ProductShowcase",
  "ArticleShowcase",
]);
const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "articles",
  "products",
  "service",
  "signin-with-chatgpt",
  "signout-with-chatgpt",
  "callback",
  "_next",
  "_vinext",
]);
const MAX_PAGE_BYTES = 512_000;
const MAX_PAGE_BLOCKS = 40;
const MAX_VALUE_DEPTH = 10;

type PagePayload = {
  id?: string;
  siteCode?: string;
  slug?: string;
  title?: string;
  data?: unknown;
  status?: string;
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  ogImageUrl?: string;
  noindex?: boolean;
  version?: number;
};

function cleanPageHref(value: string) {
  const candidate = value.trim();
  if (!candidate) return "";
  if (candidate.length > 1000 || /[\u0000-\u001f\u007f]/u.test(candidate)) return "";
  if (/^(?:https?:\/\/|mailto:|tel:)/i.test(candidate)) {
    try {
      const url = new URL(candidate);
      if (!["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) return "";
      if ((url.protocol === "http:" || url.protocol === "https:") && (url.username || url.password)) return "";
      return candidate;
    } catch {
      return "";
    }
  }
  if (/^(?:\/[^/]|#)[^\u0000-\u001f]*$/u.test(candidate) && !candidate.startsWith("//")) {
    return candidate;
  }
  return "";
}

function cleanPageImageHref(value: string) {
  const candidate = value.trim();
  if (!candidate) return "";
  if (candidate.length > 1000 || /[\u0000-\u001f\u007f]/u.test(candidate)) return "";
  if (candidate.startsWith("/") && !candidate.startsWith("//") && !candidate.includes("\\")) {
    return candidate;
  }
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? candidate
      : "";
  } catch {
    return "";
  }
}

function validatePageValue(value: unknown, depth: number, key = ""): boolean {
  if (depth > MAX_VALUE_DEPTH) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") {
    if (value.length > 20_000) return false;
    if (/imageurl$/i.test(key) && value && !cleanPageImageHref(value)) return false;
    if (!/imageurl$/i.test(key) && /(?:href|url)$/i.test(key) && value && !cleanPageHref(value)) return false;
    return true;
  }
  if (Array.isArray(value)) {
    return value.length <= 100 && value.every((item) => validatePageValue(item, depth + 1));
  }
  if (!isRecord(value)) return false;

  const entries = Object.entries(value);
  if (entries.length > 100) return false;
  for (const [childKey, childValue] of entries) {
    if (
      childKey === "__proto__" ||
      childKey === "prototype" ||
      childKey === "constructor" ||
      childKey === "dangerouslySetInnerHTML" ||
      /^on[A-Z]/.test(childKey) ||
      /^(?:html|css|script|style)$/i.test(childKey)
    ) return false;
    if (!validatePageValue(childValue, depth + 1, childKey)) return false;
  }
  return true;
}

function normalizePageData(value: unknown, status: string) {
  if (!isRecord(value) || !Array.isArray(value.content) || !isRecord(value.root)) {
    throw new Error("頁面資料不是有效的 Puck 文件");
  }
  if (value.content.length > MAX_PAGE_BLOCKS) {
    throw new Error(`每頁最多可使用 ${MAX_PAGE_BLOCKS} 個區塊`);
  }

  let heroCount = 0;
  for (const block of value.content) {
    if (!isRecord(block) || typeof block.type !== "string" || !PAGE_BLOCK_TYPES.has(block.type)) {
      throw new Error("頁面包含未允許的區塊");
    }
    if (!isRecord(block.props) || typeof block.props.id !== "string" || !block.props.id.trim()) {
      throw new Error("頁面區塊缺少識別碼");
    }
    if (!validatePageValue(block.props, 0)) {
      throw new Error("頁面區塊包含不安全或過大的欄位");
    }
    if (block.type === "Hero") heroCount += 1;
    const imageUrl = typeof block.props.imageUrl === "string" ? block.props.imageUrl.trim() : "";
    const imageAlt = typeof block.props.imageAlt === "string" ? block.props.imageAlt.trim() : "";
    if (imageAlt.length > 180 || (imageUrl && (!cleanPageImageHref(imageUrl) || !imageAlt))) {
      throw new Error("每張圖片都必須使用安全網址並填寫替代文字");
    }
  }
  if (!validatePageValue(value.root, 0)) {
    throw new Error("頁面根設定包含不安全或過大的欄位");
  }
  if (status === "published" && heroCount !== 1) {
    throw new Error("發布頁面必須且只能有一個 Hero 主標題區塊");
  }

  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).byteLength > MAX_PAGE_BYTES) {
    throw new Error("頁面資料超過 512 KB 上限");
  }
  return serialized;
}

function parseJson(value: unknown, fallback: unknown) {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

function parsePageRow(row: Record<string, unknown>) {
  return {
    id: String(row.id || ""),
    siteId: String(row.site_id || ""),
    slug: String(row.slug || ""),
    title: String(row.title || ""),
    data: parseJson(row.data_json, { root: { props: {} }, content: [] }),
    status: String(row.status || "draft"),
    seoTitle: String(row.seo_title || ""),
    seoDescription: String(row.seo_description || ""),
    canonicalUrl: String(row.canonical_url || ""),
    ogImageUrl: String(row.og_image_url || ""),
    noindex: Boolean(row.noindex),
    version: Number(row.version || 1),
    publishedAt: row.published_at ? String(row.published_at) : null,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

function pageIdFromRevisionsPath(pathname: string) {
  const prefix = "/api/admin/pages/";
  const suffix = "/revisions";
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) return "";
  return cleanText(decodeURIComponent(pathname.slice(prefix.length, -suffix.length)), 100);
}

function parsePageRevisionRow(row: Record<string, unknown>) {
  return {
    revisionId: String(row.id || ""),
    pageId: String(row.page_id || ""),
    slug: String(row.slug || ""),
    title: String(row.title || ""),
    status: String(row.status || "draft"),
    version: Number(row.version || 1),
    savedBy: String(row.saved_by || ""),
    createdAt: String(row.created_at || ""),
  };
}

function parseSiteSettingsRow(row: Record<string, unknown> | null, site: Record<string, unknown>) {
  const appearance = normalizeSiteAppearance(
    parseJson(row?.settings_json, {}),
    parseJson(row?.theme_json, {}),
  );
  return {
    siteId: String(site.id || ""),
    siteCode: String(site.code || DEFAULT_SITE_CODE),
    siteName: String(site.name || "泰聚達"),
    settings: appearance.settings,
    theme: appearance.theme,
    version: Number(row?.version || 1),
    updatedBy: String(row?.updated_by || "system"),
    updatedAt: String(row?.updated_at || ""),
  };
}

async function listAdminPages(request: Request, db: D1Database) {
  const siteCode = cleanSlug(new URL(request.url).searchParams.get("site")) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return json({ error: "找不到指定站台" }, { status: 404 });
  const result = await db.prepare(`SELECT * FROM site_pages
    WHERE site_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT 200`)
    .bind(site.id)
    .all<Record<string, unknown>>();
  return json({ site, pages: result.results.map(parsePageRow) });
}

async function savePage(request: Request, db: D1Database, savedBy: string) {
  const parsed = await readJsonObject(request, 620_000);
  if (parsed.response) return parsed.response;
  const payload = parsed.value as PagePayload;
  const siteCode = cleanSlug(payload.siteCode) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return json({ error: "找不到指定站台" }, { status: 404 });

  const title = cleanText(payload.title, 180);
  const slug = cleanSlug(payload.slug || title);
  const status = payload.status || "draft";
  if (!title) return json({ error: "頁面名稱不可空白" }, { status: 400 });
  if (!slug || RESERVED_SLUGS.has(slug)) {
    return json({ error: "頁面網址不可空白或使用系統保留名稱" }, { status: 400 });
  }
  if (!PAGE_STATUSES.has(status)) return json({ error: "頁面狀態不正確" }, { status: 400 });

  const seoTitle = cleanText(payload.seoTitle, 180);
  const seoDescription = cleanText(payload.seoDescription, 500);
  if (status === "published" && (seoTitle.length < 8 || seoDescription.length < 50)) {
    return json({ error: "發布前請填寫至少 8 字的 SEO 標題與至少 50 字的 SEO 描述" }, { status: 400 });
  }
  const canonicalUrl = cleanUrl(payload.canonicalUrl);
  const ogImageUrl = cleanUrl(payload.ogImageUrl);
  if (cleanText(payload.canonicalUrl, 1000) && !canonicalUrl) {
    return json({ error: "Canonical URL 必須是有效的 http 或 https 網址" }, { status: 400 });
  }
  if (cleanText(payload.ogImageUrl, 1000) && !ogImageUrl) {
    return json({ error: "OG 圖片 URL 必須是有效的 http 或 https 網址" }, { status: 400 });
  }

  let dataJson: string;
  try {
    dataJson = normalizePageData(payload.data, status);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "頁面資料格式錯誤" }, { status: 400 });
  }

  const id = cleanText(payload.id, 100) || crypto.randomUUID();
  const existing = payload.id
    ? await db.prepare("SELECT * FROM site_pages WHERE id = ? AND site_id = ? LIMIT 1")
        .bind(id, site.id)
        .first<Record<string, unknown>>()
    : null;
  const now = new Date().toISOString();
  const nextVersion = Number(existing?.version || 0) + 1;
  const values = {
    slug,
    title,
    dataJson,
    status,
    seoTitle,
    seoDescription,
    canonicalUrl,
    ogImageUrl,
    noindex: payload.noindex ? 1 : 0,
  };

  try {
    if (existing) {
      if (!Number.isSafeInteger(payload.version) || payload.version !== Number(existing.version)) {
        return json({ error: "頁面已被其他操作更新，請重新整理後再儲存" }, { status: 409 });
      }
      const result = await db.batch([
        db.prepare(`UPDATE site_pages SET slug = ?, title = ?, data_json = ?, status = ?,
          seo_title = ?, seo_description = ?, canonical_url = ?, og_image_url = ?, noindex = ?,
          version = ?, published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE published_at END,
          updated_at = ? WHERE id = ? AND site_id = ? AND version = ?`)
          .bind(
            values.slug, values.title, values.dataJson, values.status, values.seoTitle,
            values.seoDescription, values.canonicalUrl, values.ogImageUrl, values.noindex,
            nextVersion, values.status, now, now, id, site.id, payload.version,
          ),
        db.prepare(`INSERT INTO site_page_revisions (
          id, page_id, slug, title, data_json, status, seo_title, seo_description,
          canonical_url, og_image_url, noindex, version, saved_by, created_at
        ) SELECT ?, id, slug, title, data_json, status, seo_title, seo_description,
          canonical_url, og_image_url, noindex, version, ?, ?
          FROM site_pages WHERE id = ? AND site_id = ? AND version = ?`)
          .bind(crypto.randomUUID(), savedBy, now, id, site.id, nextVersion),
      ]);
      if (Number(result[0]?.meta.changes || 0) !== 1) {
        return json({ error: "頁面已被其他操作更新，請重新整理後再儲存" }, { status: 409 });
      }
    } else {
      await db.batch([
        db.prepare(`INSERT INTO site_pages (
          id, site_id, slug, title, data_json, status, seo_title, seo_description,
          canonical_url, og_image_url, noindex, version, published_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`)
          .bind(
            id, site.id, values.slug, values.title, values.dataJson, values.status,
            values.seoTitle, values.seoDescription, values.canonicalUrl, values.ogImageUrl,
            values.noindex, values.status === "published" ? now : null, now, now,
          ),
        db.prepare(`INSERT INTO site_page_revisions (
          id, page_id, slug, title, data_json, status, seo_title, seo_description,
          canonical_url, og_image_url, noindex, version, saved_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
          .bind(
            crypto.randomUUID(), id, values.slug, values.title, values.dataJson, values.status,
            values.seoTitle, values.seoDescription, values.canonicalUrl, values.ogImageUrl,
            values.noindex, savedBy, now,
          ),
      ]);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "頁面儲存失敗";
    if (message.includes("UNIQUE") || message.includes("site_pages_site_slug_unique")) {
      return json({ error: "這個頁面網址已被使用，請換一個 slug" }, { status: 409 });
    }
    throw error;
  }

  const row = await db.prepare("SELECT * FROM site_pages WHERE id = ? AND site_id = ? LIMIT 1")
    .bind(id, site.id)
    .first<Record<string, unknown>>();
  return json({ page: row ? parsePageRow(row) : null }, { status: existing ? 200 : 201 });
}

async function archivePage(request: Request, db: D1Database, pageId: string, savedBy: string) {
  const siteCode = cleanSlug(new URL(request.url).searchParams.get("site")) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return json({ error: "找不到指定站台" }, { status: 404 });
  const id = cleanText(pageId, 100);
  const existing = await db.prepare("SELECT * FROM site_pages WHERE id = ? AND site_id = ? LIMIT 1")
    .bind(id, site.id)
    .first<Record<string, unknown>>();
  if (!existing) return json({ error: "找不到頁面" }, { status: 404 });
  const nextVersion = Number(existing.version || 0) + 1;
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE site_pages SET status = 'archived', version = ?, updated_at = ? WHERE id = ? AND site_id = ?")
      .bind(nextVersion, now, id, site.id),
    db.prepare(`INSERT INTO site_page_revisions (
      id, page_id, slug, title, data_json, status, seo_title, seo_description,
      canonical_url, og_image_url, noindex, version, saved_by, created_at
    ) VALUES (?, ?, ?, ?, ?, 'archived', ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(), id, existing.slug, existing.title, existing.data_json,
        existing.seo_title, existing.seo_description, existing.canonical_url,
        existing.og_image_url, existing.noindex, nextVersion, savedBy, now,
      ),
  ]);
  return json({ ok: true });
}

async function listPageRevisions(request: Request, pathname: string, db: D1Database) {
  const pageId = pageIdFromRevisionsPath(pathname);
  if (!pageId) return json({ error: "缺少頁面 ID" }, { status: 400 });
  const siteCode = cleanSlug(new URL(request.url).searchParams.get("site")) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return json({ error: "找不到指定站台" }, { status: 404 });
  const page = await db.prepare("SELECT id, version FROM site_pages WHERE id = ? AND site_id = ? LIMIT 1")
    .bind(pageId, site.id)
    .first<Record<string, unknown>>();
  if (!page) return json({ error: "找不到頁面" }, { status: 404 });
  const rows = await db.prepare(`SELECT * FROM site_page_revisions
    WHERE page_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`)
    .bind(pageId)
    .all<Record<string, unknown>>();
  return json({ pageId, version: Number(page.version || 1), revisions: rows.results.map(parsePageRevisionRow) });
}

async function restorePageRevision(
  request: Request,
  pathname: string,
  db: D1Database,
  savedBy: string,
) {
  const pageId = pageIdFromRevisionsPath(pathname);
  if (!pageId) return json({ error: "缺少頁面 ID" }, { status: 400 });
  const parsed = await readJsonObject(request, 16_000);
  if (parsed.response) return parsed.response;
  const revisionId = cleanText(parsed.value.revisionId, 100);
  const expectedVersion = Number(parsed.value.version);
  if (!revisionId || !Number.isSafeInteger(expectedVersion)) {
    return json({ error: "請提供版本 ID 與目前頁面版本" }, { status: 400 });
  }
  const siteCode = cleanSlug(parsed.value.siteCode || new URL(request.url).searchParams.get("site")) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return json({ error: "找不到指定站台" }, { status: 404 });
  const [page, revision] = await Promise.all([
    db.prepare("SELECT * FROM site_pages WHERE id = ? AND site_id = ? LIMIT 1")
      .bind(pageId, site.id).first<Record<string, unknown>>(),
    db.prepare(`SELECT r.* FROM site_page_revisions r
      JOIN site_pages p ON p.id = r.page_id
      WHERE r.id = ? AND r.page_id = ? AND p.site_id = ? LIMIT 1`)
      .bind(revisionId, pageId, site.id).first<Record<string, unknown>>(),
  ]);
  if (!page || !revision) return json({ error: "找不到頁面版本" }, { status: 404 });
  if (Number(page.version || 1) !== expectedVersion) {
    return json({ error: "頁面已被其他操作更新，請重新整理後再還原" }, { status: 409 });
  }

  const nextVersion = expectedVersion + 1;
  const now = new Date().toISOString();
  let results;
  try {
    results = await db.batch([
      db.prepare(`UPDATE site_pages SET slug = ?, title = ?, data_json = ?, status = 'draft',
        seo_title = ?, seo_description = ?, canonical_url = ?, og_image_url = ?, noindex = ?,
        version = ?, updated_at = ? WHERE id = ? AND site_id = ? AND version = ?`)
        .bind(
          revision.slug, revision.title, revision.data_json,
          revision.seo_title, revision.seo_description, revision.canonical_url,
          revision.og_image_url, revision.noindex, nextVersion, now,
          pageId, site.id, expectedVersion,
        ),
      db.prepare(`INSERT INTO site_page_revisions (
        id, page_id, slug, title, data_json, status, seo_title, seo_description,
        canonical_url, og_image_url, noindex, version, saved_by, created_at
      ) SELECT ?, id, slug, title, data_json, 'draft', seo_title, seo_description,
        canonical_url, og_image_url, noindex, ?, ?, ?
        FROM site_pages WHERE id = ? AND site_id = ? AND version = ? AND updated_at = ?`)
        .bind(crypto.randomUUID(), nextVersion, savedBy, now, pageId, site.id, nextVersion, now),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("site_page_revisions.page_id")) {
      return json({ error: "頁面已被其他操作更新，請重新整理後再還原" }, { status: 409 });
    }
    throw error;
  }
  if (Number(results[0]?.meta.changes || 0) !== 1 || Number(results[1]?.meta.changes || 0) !== 1) {
    return json({ error: "頁面已被其他操作更新，請重新整理後再還原" }, { status: 409 });
  }
  const row = await db.prepare("SELECT * FROM site_pages WHERE id = ? AND site_id = ? LIMIT 1")
    .bind(pageId, site.id)
    .first<Record<string, unknown>>();
  return json({ page: row ? parsePageRow(row) : null, restoredRevisionId: revisionId });
}

async function getPublicPage(request: Request, db: D1Database) {
  const url = new URL(request.url);
  const siteCode = cleanSlug(url.searchParams.get("site")) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return publicJson({ error: "找不到指定站台" }, { status: 404 });
  const slug = cleanSlug(decodeURIComponent(url.pathname.slice("/api/content/pages/".length)));
  if (!slug) return publicJson({ error: "找不到頁面" }, { status: 404 });
  const row = await db.prepare(`SELECT * FROM site_pages
    WHERE site_id = ? AND slug = ? AND status = 'published' LIMIT 1`)
    .bind(site.id, slug)
    .first<Record<string, unknown>>();
  return row
    ? publicJson({ site, page: parsePageRow(row) })
    : publicJson({ error: "找不到頁面" }, { status: 404 });
}

async function getSiteSettings(request: Request, db: D1Database) {
  const siteCode = cleanSlug(new URL(request.url).searchParams.get("site")) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return json({ error: "找不到指定站台" }, { status: 404 });
  const row = await db.prepare("SELECT * FROM site_settings WHERE site_id = ? LIMIT 1")
    .bind(site.id)
    .first<Record<string, unknown>>();
  return json({ site, siteSettings: parseSiteSettingsRow(row, site) });
}

async function saveSiteSettings(request: Request, db: D1Database, savedBy: string) {
  const parsed = await readJsonObject(request, 128_000);
  if (parsed.response) return parsed.response;
  const siteCode = cleanSlug(parsed.value.siteCode) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return json({ error: "找不到指定站台" }, { status: 404 });
  if (!isRecord(parsed.value.settings) || !isRecord(parsed.value.theme) ||
      !validatePageValue(parsed.value.settings, 0) || !validatePageValue(parsed.value.theme, 0)) {
    return json({ error: "全站設定格式不正確" }, { status: 400 });
  }
  const appearance = normalizeSiteAppearance(parsed.value.settings, parsed.value.theme);
  const contrast = evaluateSiteThemeContrast(appearance.theme);
  if (!contrast.ok) {
    const failedPairs = [
      !contrast.passesInkSurface ? `主要文字／頁面底色 ${contrast.inkSurface.toFixed(2)}:1` : "",
      !contrast.passesInkAccent ? `主要文字／品牌重點色 ${contrast.inkAccent.toFixed(2)}:1` : "",
      !contrast.passesArchivePalette ? "固定版型只支援淺色頁面底與深色主要文字" : "",
    ].filter(Boolean).join("、");
    return json({
      error: `配色對比不足（${failedPairs}）；兩組都必須至少 ${MIN_SITE_THEME_CONTRAST}:1。`,
      contrast,
    }, { status: 400 });
  }
  const settingsJson = JSON.stringify(appearance.settings);
  const themeJson = JSON.stringify(appearance.theme);
  if (settingsJson.length + themeJson.length > 100_000) {
    return json({ error: "全站設定內容過大" }, { status: 413 });
  }
  const requestedVersion = Number(parsed.value.version);
  const existing = await db.prepare("SELECT version FROM site_settings WHERE site_id = ? LIMIT 1")
    .bind(site.id)
    .first<Record<string, unknown>>();
  if (existing && (!Number.isSafeInteger(requestedVersion) || requestedVersion !== Number(existing.version))) {
    return json({ error: "全站設定已被其他操作更新，請重新整理" }, { status: 409 });
  }
  const now = new Date().toISOString();
  const nextVersion = Number(existing?.version || 0) + 1;
  const result = await db.prepare(`INSERT INTO site_settings (
    site_id, settings_json, theme_json, version, updated_by, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(site_id) DO UPDATE SET
    settings_json = excluded.settings_json,
    theme_json = excluded.theme_json,
    version = excluded.version,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  WHERE site_settings.version = ?`)
    .bind(site.id, settingsJson, themeJson, nextVersion, savedBy, now, Number(existing?.version || 0))
    .run();
  if (existing && Number(result.meta.changes || 0) !== 1) {
    return json({ error: "全站設定已被其他操作更新，請重新整理" }, { status: 409 });
  }
  return getSiteSettings(request, db);
}

async function exportPublishedSite(request: Request, db: D1Database) {
  const siteCode = cleanSlug(new URL(request.url).searchParams.get("site")) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return json({ error: "找不到指定站台" }, { status: 404 });
  const [settingsRow, pages, articles, products] = await Promise.all([
    db.prepare("SELECT * FROM site_settings WHERE site_id = ? LIMIT 1")
      .bind(site.id).first<Record<string, unknown>>(),
    db.prepare("SELECT * FROM site_pages WHERE site_id = ? AND status = 'published' ORDER BY updated_at, id")
      .bind(site.id).all<Record<string, unknown>>(),
    db.prepare("SELECT * FROM articles WHERE site_id = ? AND status = 'published' ORDER BY published_at, id")
      .bind(site.id).all<Record<string, unknown>>(),
    db.prepare(`SELECT p.*, c.name AS category_name,
      i.on_hand, i.reserved, i.version AS inventory_version
      FROM products p
      JOIN categories c ON c.id = p.category_id AND c.site_id = p.site_id
      JOIN inventory i ON i.product_id = p.id AND i.site_id = p.site_id
      WHERE p.site_id = ? AND p.status IN ('active', 'sold_out')
      ORDER BY p.updated_at, p.id`)
      .bind(site.id).all<Record<string, unknown>>(),
  ]);

  const publicArticles = articles.results.map((row) => ({
    id: String(row.id || ""),
    slug: String(row.slug || ""),
    title: String(row.title || ""),
    excerpt: String(row.excerpt || ""),
    contentJson: parseJson(row.content_json, { type: "doc", content: [] }),
    status: "published",
    tag: String(row.tag || "收藏誌"),
    keywords: parseJson(row.keywords_json, []),
    heroImageUrl: String(row.hero_image_url || ""),
    heroImageAlt: String(row.hero_image_alt || ""),
    seoTitle: String(row.seo_title || ""),
    seoDescription: String(row.seo_description || ""),
    canonicalUrl: String(row.canonical_url || ""),
    ogImageUrl: String(row.og_image_url || ""),
    noindex: Boolean(row.noindex),
    version: Number(row.version || 1),
    publishedAt: row.published_at ? String(row.published_at) : null,
    updatedAt: String(row.updated_at || ""),
  }));
  const publicProducts = products.results.map((row) => ({
    id: String(row.id || ""),
    sku: String(row.sku || ""),
    slug: String(row.slug || ""),
    name: String(row.name || ""),
    shortName: String(row.short_name || ""),
    description: String(row.description || ""),
    category: String(row.category_name || ""),
    origin: String(row.origin || ""),
    temple: String(row.temple || ""),
    buddhistYear: String(row.buddhist_year || ""),
    westernYear: String(row.western_year || ""),
    material: String(row.material || ""),
    dimensions: String(row.dimensions || ""),
    price: Number(row.price || 0),
    badge: String(row.badge || ""),
    tone: String(row.tone || "sand"),
    shape: String(row.shape || "arch"),
    theme: String(row.theme || ""),
    purchaseLimit: Number(row.purchase_limit || 1),
    stock: Math.max(0, Number(row.on_hand || 0) - Number(row.reserved || 0)),
    status: String(row.status || "draft"),
    imageUrl: String(row.image_url || ""),
    imageAlt: String(row.image_alt || ""),
    seoReady: Boolean(row.seo_ready),
    seoTitle: String(row.seo_title || ""),
    seoDescription: String(row.seo_description || ""),
    version: Number(row.version || 1),
    updatedAt: String(row.updated_at || ""),
  }));

  const parsedSettings = parseSiteSettingsRow(settingsRow, site);
  const publicSettings = {
    siteId: parsedSettings.siteId,
    siteCode: parsedSettings.siteCode,
    siteName: parsedSettings.siteName,
    settings: parsedSettings.settings,
    theme: parsedSettings.theme,
    version: parsedSettings.version,
    updatedAt: parsedSettings.updatedAt,
  };

  return json({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    site: {
      id: String(site.id || ""),
      code: String(site.code || siteCode),
      name: String(site.name || "泰聚達"),
      locale: String(site.locale || "zh-Hant-TW"),
      currency: String(site.currency || "TWD"),
    },
    siteSettings: publicSettings,
    pages: pages.results.map(parsePageRow),
    articles: publicArticles,
    products: publicProducts,
  });
}

async function getPublicSiteSettings(request: Request, db: D1Database) {
  const siteCode = cleanSlug(new URL(request.url).searchParams.get("site")) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return publicJson({ error: "找不到指定站台" }, { status: 404 });
  const row = await db.prepare("SELECT * FROM site_settings WHERE site_id = ? LIMIT 1")
    .bind(site.id)
    .first<Record<string, unknown>>();
  const parsed = parseSiteSettingsRow(row, site);
  return publicJson({
    site,
    siteSettings: {
      settings: parsed.settings,
      theme: parsed.theme,
      version: parsed.version,
      updatedAt: parsed.updatedAt,
    },
  });
}

function adminDenied(request: Request) {
  const hasAuthenticatedEmail = Boolean(request.headers.get("oai-authenticated-user-email"));
  return hasAuthenticatedEmail
    ? json({ error: "此帳號不在後台允許名單內" }, { status: 403 })
    : json({ error: "請先登入後台再繼續", signInUrl: "/signin-with-chatgpt?return_to=%2Fadmin%2Fsite" }, { status: 401 });
}

export async function handleSiteApi(request: Request, env: DatabaseEnv) {
  const url = new URL(request.url);
  const isAdminPages = url.pathname === "/api/admin/pages" || url.pathname.startsWith("/api/admin/pages/");
  const isAdminSettings = url.pathname === "/api/admin/site-settings";
  const isAdminExport = url.pathname === "/api/admin/site-export";
  const isPublicSettings = url.pathname === "/api/content/site-settings";
  const isPublicPage = url.pathname.startsWith("/api/content/pages/");
  if (!isAdminPages && !isAdminSettings && !isAdminExport && !isPublicSettings && !isPublicPage) return null;
  if (!env.DB) return json({ error: "網站資料庫尚未連線" }, { status: 503 });

  try {
    await ensureDatabase(env.DB);
    if (isPublicSettings && request.method === "GET") return getPublicSiteSettings(request, env.DB);
    if (isPublicSettings) return json({ error: "不支援的操作" }, { status: 405, headers: { allow: "GET" } });
    if (isPublicPage && request.method === "GET") return getPublicPage(request, env.DB);
    if (isPublicPage) return json({ error: "不支援的操作" }, { status: 405, headers: { allow: "GET" } });

    const identity = adminIdentity(request, env);
    if (!identity) return adminDenied(request);
    const invalidWrite = validateWriteRequest(request);
    if (invalidWrite) return invalidWrite;

    if (url.pathname === "/api/admin/pages" && request.method === "GET") return listAdminPages(request, env.DB);
    if (url.pathname === "/api/admin/pages" && request.method === "POST") return savePage(request, env.DB, identity);
    if (url.pathname.endsWith("/revisions") && request.method === "GET") {
      return listPageRevisions(request, url.pathname, env.DB);
    }
    if (url.pathname.endsWith("/revisions") && request.method === "POST") {
      return restorePageRevision(request, url.pathname, env.DB, identity);
    }
    if (url.pathname.startsWith("/api/admin/pages/") && request.method === "DELETE") {
      return archivePage(
        request,
        env.DB,
        decodeURIComponent(url.pathname.slice("/api/admin/pages/".length)),
        identity,
      );
    }
    if (isAdminSettings && request.method === "GET") return getSiteSettings(request, env.DB);
    if (isAdminSettings && request.method === "POST") return saveSiteSettings(request, env.DB, identity);
    if (isAdminExport && request.method === "GET") return exportPublishedSite(request, env.DB);
    return json({ error: "不支援的操作" }, { status: 405, headers: { allow: "GET, POST, DELETE" } });
  } catch {
    return json({ error: "網站編輯服務暫時無法使用" }, { status: 500 });
  }
}
