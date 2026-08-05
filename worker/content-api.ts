import {
  adminIdentity,
  cleanSlug,
  cleanText,
  cleanUrl,
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
  ARTICLE_PUBLISH_ERROR_MESSAGE,
  evaluateArticlePublishReadiness,
  validateArticleDocument,
} from "../lib/article-content-contract";

const MAX_CONTENT_BYTES = 1_000_000;
const ARTICLE_STATUSES = new Set(["draft", "published", "archived"]);

type ArticlePayload = {
  id?: string;
  siteCode?: string;
  slug?: string;
  title?: string;
  excerpt?: string;
  contentJson?: unknown;
  status?: string;
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  ogImageUrl?: string;
  tag?: string;
  keywords?: unknown;
  heroImageUrl?: string;
  heroImageAlt?: string;
  noindex?: boolean;
  version?: number;
};

function normalizeContentJson(value: unknown) {
  const fallback = { type: "doc", content: [{ type: "paragraph" }] };
  const content = value ?? fallback;
  if (!validateArticleDocument(content)) {
    throw new Error("文章內容不是有效的 Tiptap 文件");
  }
  const serialized = JSON.stringify(content);
  if (new TextEncoder().encode(serialized).byteLength > MAX_CONTENT_BYTES) {
    throw new Error("文章內容超過 1 MB 上限");
  }
  return serialized;
}

function normalizeKeywords(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => cleanText(item, 60))
    .filter(Boolean))]
    .slice(0, 12);
}

function parseArticleRow(row: Record<string, unknown>) {
  let contentJson: unknown = { type: "doc", content: [{ type: "paragraph" }] };
  try {
    contentJson = JSON.parse(String(row.content_json || "{}"));
  } catch {
    // Keep the safe empty document when legacy content cannot be parsed.
  }

  return {
    id: row.id,
    siteId: row.site_id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    contentJson,
    status: row.status,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    canonicalUrl: row.canonical_url,
    ogImageUrl: row.og_image_url,
    tag: row.tag || "佛牌知識",
    keywords: (() => {
      try {
        const value = JSON.parse(String(row.keywords_json || "[]"));
        return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
      } catch {
        return [];
      }
    })(),
    heroImageUrl: row.hero_image_url || "",
    heroImageAlt: row.hero_image_alt || "",
    noindex: Boolean(row.noindex) || (
      row.status === "published" &&
      !evaluateArticlePublishReadiness({
        excerpt: row.excerpt,
        seoTitle: row.seo_title,
        seoDescription: row.seo_description,
        contentJson,
      }).ok
    ),
    version: Number(row.version || 1),
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listAdminArticles(request: Request, db: D1Database) {
  const siteCode = cleanSlug(new URL(request.url).searchParams.get("site")) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return json({ error: "找不到指定站台" }, { status: 404 });

  const result = await db.prepare(`SELECT * FROM articles
    WHERE site_id = ?
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 100`)
    .bind(site.id)
    .all<Record<string, unknown>>();

  return json({ site, articles: result.results.map(parseArticleRow) });
}

async function saveArticle(request: Request, db: D1Database, savedBy: string) {
  const parsed = await readJsonObject(request, 1_200_000);
  if (parsed.response) return parsed.response;
  const payload = parsed.value as ArticlePayload;

  const siteCode = cleanSlug(payload.siteCode) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return json({ error: "找不到指定站台" }, { status: 404 });

  const title = cleanText(payload.title, 180);
  const slug = cleanSlug(payload.slug || title);
  if (payload.status !== undefined && !ARTICLE_STATUSES.has(payload.status)) {
    return json({ error: "文章狀態不正確" }, { status: 400 });
  }
  const status = payload.status || "draft";
  if (!title) return json({ error: "文章標題不可空白" }, { status: 400 });
  if (!slug) return json({ error: "文章網址不可空白" }, { status: 400 });

  const canonicalUrl = cleanUrl(payload.canonicalUrl);
  const ogImageUrl = cleanUrl(payload.ogImageUrl);
  const heroImageUrl = cleanUrl(payload.heroImageUrl);
  if (cleanText(payload.canonicalUrl, 1000) && !canonicalUrl) {
    return json({ error: "Canonical URL 必須是有效的 http 或 https 網址" }, { status: 400 });
  }
  if (cleanText(payload.ogImageUrl, 1000) && !ogImageUrl) {
    return json({ error: "OG 圖片 URL 必須是有效的 http 或 https 網址" }, { status: 400 });
  }
  if (cleanText(payload.heroImageUrl, 1000) && !heroImageUrl) {
    return json({ error: "首圖 URL 必須是有效的 http 或 https 網址" }, { status: 400 });
  }

  let contentJson: string;
  try {
    contentJson = normalizeContentJson(payload.contentJson);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "文章內容格式錯誤" }, { status: 400 });
  }

  const excerpt = cleanText(payload.excerpt, 500);
  const seoTitle = cleanText(payload.seoTitle, 180);
  const seoDescription = cleanText(payload.seoDescription, 500);
  const heroImageAlt = cleanText(payload.heroImageAlt, 300);
  if (heroImageUrl && !heroImageAlt) {
    return json({ error: "文章首圖必須填寫替代文字" }, { status: 400 });
  }
  if (status === "published") {
    let contentValue: unknown = null;
    try {
      contentValue = JSON.parse(contentJson);
    } catch {
      // normalizeContentJson already guarantees valid JSON.
    }
    if (!evaluateArticlePublishReadiness({
      excerpt,
      seoTitle,
      seoDescription,
      contentJson: contentValue,
    }).ok) {
      return json({ error: ARTICLE_PUBLISH_ERROR_MESSAGE }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const values = {
    title,
    slug,
    excerpt,
    contentJson,
    status,
    seoTitle,
    seoDescription,
    canonicalUrl,
    ogImageUrl,
    tag: cleanText(payload.tag, 80) || "佛牌知識",
    keywordsJson: JSON.stringify(normalizeKeywords(payload.keywords)),
    heroImageUrl,
    heroImageAlt,
    noindex: payload.noindex ? 1 : 0,
  };

  const articleId = cleanText(payload.id, 100) || crypto.randomUUID();
  const existing = payload.id
    ? await db.prepare("SELECT * FROM articles WHERE id = ? AND site_id = ? LIMIT 1")
        .bind(articleId, site.id)
        .first<Record<string, unknown>>()
    : null;

  try {
    if (existing) {
      if (!Number.isSafeInteger(payload.version) || payload.version !== Number(existing.version || 1)) {
        return json({ error: "文章已被其他操作更新，請重新整理後再儲存" }, { status: 409 });
      }
      const nextVersion = Number(existing.version || 1) + 1;
      const result = await db.batch([
        db.prepare(`UPDATE articles SET
          slug = ?, title = ?, excerpt = ?, content_json = ?, status = ?,
          seo_title = ?, seo_description = ?, canonical_url = ?, og_image_url = ?,
          tag = ?, keywords_json = ?, hero_image_url = ?, hero_image_alt = ?,
          noindex = ?, version = ?, published_at = CASE
            WHEN ? = 'published' THEN COALESCE(published_at, ?)
            ELSE published_at
          END,
          updated_at = ?
          WHERE id = ? AND site_id = ? AND version = ?`)
          .bind(
            values.slug,
            values.title,
            values.excerpt,
            values.contentJson,
            values.status,
            values.seoTitle,
            values.seoDescription,
            values.canonicalUrl,
            values.ogImageUrl,
            values.tag,
            values.keywordsJson,
            values.heroImageUrl,
            values.heroImageAlt,
            values.noindex,
            nextVersion,
            values.status,
            now,
            now,
            articleId,
            site.id,
            payload.version,
          ),
        db.prepare(`INSERT INTO article_revisions (
          id, article_id, slug, title, excerpt, content_json, seo_title,
          seo_description, canonical_url, og_image_url, tag, keywords_json,
          hero_image_url, hero_image_alt, noindex, version, status, saved_by
        ) SELECT ?, id, slug, title, excerpt, content_json, seo_title,
          seo_description, canonical_url, og_image_url, tag, keywords_json,
          hero_image_url, hero_image_alt, noindex, version, status, ?
          FROM articles WHERE id = ? AND site_id = ? AND version = ?`)
          .bind(crypto.randomUUID(), savedBy, articleId, site.id, nextVersion),
      ]);
      if (Number(result[0]?.meta.changes || 0) !== 1) {
        return json({ error: "文章已被其他操作更新，請重新整理後再儲存" }, { status: 409 });
      }
    } else {
      await db.batch([
        db.prepare(`INSERT INTO articles (
          id, site_id, slug, title, excerpt, content_json, status,
          seo_title, seo_description, canonical_url, og_image_url, tag,
          keywords_json, hero_image_url, hero_image_alt, noindex, version,
          published_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`)
          .bind(
            articleId,
            site.id,
            values.slug,
            values.title,
            values.excerpt,
            values.contentJson,
            values.status,
            values.seoTitle,
            values.seoDescription,
            values.canonicalUrl,
            values.ogImageUrl,
            values.tag,
            values.keywordsJson,
            values.heroImageUrl,
            values.heroImageAlt,
            values.noindex,
            values.status === "published" ? now : null,
            now,
            now,
          ),
        db.prepare(`INSERT INTO article_revisions (
          id, article_id, slug, title, excerpt, content_json, seo_title,
          seo_description, canonical_url, og_image_url, tag, keywords_json,
          hero_image_url, hero_image_alt, noindex, version, status, saved_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
          .bind(
            crypto.randomUUID(),
            articleId,
            values.slug,
            values.title,
            values.excerpt,
            values.contentJson,
            values.seoTitle,
            values.seoDescription,
            values.canonicalUrl,
            values.ogImageUrl,
            values.tag,
            values.keywordsJson,
            values.heroImageUrl,
            values.heroImageAlt,
            values.noindex,
            values.status,
            savedBy,
          ),
      ]);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "文章儲存失敗";
    if (message.includes("UNIQUE") || message.includes("articles_site_slug_unique")) {
      return json({ error: "這個文章網址已被使用，請換一個 slug" }, { status: 409 });
    }
    throw error;
  }

  const row = await db.prepare("SELECT * FROM articles WHERE id = ? LIMIT 1")
    .bind(articleId)
    .first<Record<string, unknown>>();
  return json({ article: row ? parseArticleRow(row) : null }, { status: existing ? 200 : 201 });
}

async function archiveArticle(request: Request, pathname: string, db: D1Database, savedBy: string) {
  const articleId = decodeURIComponent(pathname.split("/").pop() || "");
  if (!articleId) return json({ error: "缺少文章 ID" }, { status: 400 });

  const siteCode = cleanSlug(new URL(request.url).searchParams.get("site")) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return json({ error: "找不到指定站台" }, { status: 404 });
  const existing = await db.prepare(
    "SELECT * FROM articles WHERE id = ? AND site_id = ? LIMIT 1",
  ).bind(articleId, site.id).first<Record<string, unknown>>();
  if (!existing) return json({ error: "找不到文章" }, { status: 404 });

  const now = new Date().toISOString();
  const nextVersion = Number(existing.version || 1) + 1;
  await db.batch([
    db.prepare(`INSERT INTO article_revisions (
      id, article_id, slug, title, excerpt, content_json, seo_title,
      seo_description, canonical_url, og_image_url, tag, keywords_json,
      hero_image_url, hero_image_alt, noindex, version, status, saved_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(),
        articleId,
        existing.slug,
        existing.title,
        existing.excerpt,
        existing.content_json,
        existing.seo_title,
        existing.seo_description,
        existing.canonical_url,
        existing.og_image_url,
        existing.tag,
        existing.keywords_json,
        existing.hero_image_url,
        existing.hero_image_alt,
        existing.noindex,
        nextVersion,
        "archived",
        savedBy,
      ),
    db.prepare(
      "UPDATE articles SET status = 'archived', version = ?, updated_at = ? WHERE id = ? AND site_id = ?",
    ).bind(nextVersion, now, articleId, site.id),
  ]);
  return json({ ok: true });
}

function articleIdFromRevisionsPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  return parts.at(-1) === "revisions" ? decodeURIComponent(parts.at(-2) || "") : "";
}

function parseRevisionRow(row: Record<string, unknown>) {
  return {
    revisionId: String(row.id || ""),
    articleId: String(row.article_id || ""),
    slug: String(row.slug || ""),
    title: String(row.title || ""),
    excerpt: String(row.excerpt || ""),
    contentJson: (() => {
      try {
        return JSON.parse(String(row.content_json || "{}")) as unknown;
      } catch {
        return { type: "doc", content: [{ type: "paragraph" }] };
      }
    })(),
    status: String(row.status || "draft"),
    seoTitle: String(row.seo_title || ""),
    seoDescription: String(row.seo_description || ""),
    canonicalUrl: String(row.canonical_url || ""),
    ogImageUrl: String(row.og_image_url || ""),
    tag: String(row.tag || "佛牌知識"),
    keywords: (() => {
      try {
        const value = JSON.parse(String(row.keywords_json || "[]"));
        return Array.isArray(value) ? value : [];
      } catch {
        return [];
      }
    })(),
    heroImageUrl: String(row.hero_image_url || ""),
    heroImageAlt: String(row.hero_image_alt || ""),
    noindex: Boolean(row.noindex),
    version: Number(row.version || 1),
    savedBy: String(row.saved_by || ""),
    createdAt: String(row.created_at || ""),
  };
}

async function listArticleRevisions(request: Request, pathname: string, db: D1Database) {
  const articleId = articleIdFromRevisionsPath(pathname);
  if (!articleId) return json({ error: "缺少文章 ID" }, { status: 400 });
  const siteCode = cleanSlug(new URL(request.url).searchParams.get("site")) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return json({ error: "找不到指定站台" }, { status: 404 });
  const article = await db.prepare("SELECT id, version FROM articles WHERE id = ? AND site_id = ? LIMIT 1")
    .bind(articleId, site.id)
    .first<Record<string, unknown>>();
  if (!article) return json({ error: "找不到文章" }, { status: 404 });
  const rows = await db.prepare(`SELECT * FROM article_revisions
    WHERE article_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`)
    .bind(articleId)
    .all<Record<string, unknown>>();
  return json({ articleId, version: Number(article.version || 1), revisions: rows.results.map(parseRevisionRow) });
}

async function restoreArticleRevision(
  request: Request,
  pathname: string,
  db: D1Database,
  savedBy: string,
) {
  const articleId = articleIdFromRevisionsPath(pathname);
  if (!articleId) return json({ error: "缺少文章 ID" }, { status: 400 });
  const parsed = await readJsonObject(request, 16_000);
  if (parsed.response) return parsed.response;
  const revisionId = cleanText(parsed.value.revisionId, 100);
  const expectedVersion = Number(parsed.value.version);
  if (!revisionId || !Number.isSafeInteger(expectedVersion)) {
    return json({ error: "請提供版本 ID 與目前文章版本" }, { status: 400 });
  }
  const siteCode = cleanSlug(parsed.value.siteCode || new URL(request.url).searchParams.get("site")) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return json({ error: "找不到指定站台" }, { status: 404 });
  const [article, revision] = await Promise.all([
    db.prepare("SELECT * FROM articles WHERE id = ? AND site_id = ? LIMIT 1")
      .bind(articleId, site.id).first<Record<string, unknown>>(),
    db.prepare(`SELECT r.* FROM article_revisions r
      JOIN articles a ON a.id = r.article_id
      WHERE r.id = ? AND r.article_id = ? AND a.site_id = ? LIMIT 1`)
      .bind(revisionId, articleId, site.id).first<Record<string, unknown>>(),
  ]);
  if (!article || !revision) return json({ error: "找不到文章版本" }, { status: 404 });
  if (Number(article.version || 1) !== expectedVersion) {
    return json({ error: "文章已被其他操作更新，請重新整理後再還原" }, { status: 409 });
  }

  const nextVersion = expectedVersion + 1;
  const now = new Date().toISOString();
  const results = await db.batch([
    db.prepare(`UPDATE articles SET slug = ?, title = ?, excerpt = ?, content_json = ?, status = 'draft',
      seo_title = ?, seo_description = ?, canonical_url = ?, og_image_url = ?, tag = ?, keywords_json = ?,
      hero_image_url = ?, hero_image_alt = ?, noindex = ?, version = ?, updated_at = ?
      WHERE id = ? AND site_id = ? AND version = ?`)
      .bind(
        revision.slug, revision.title, revision.excerpt, revision.content_json,
        revision.seo_title, revision.seo_description, revision.canonical_url,
        revision.og_image_url, revision.tag, revision.keywords_json,
        revision.hero_image_url, revision.hero_image_alt, revision.noindex,
        nextVersion, now, articleId, site.id, expectedVersion,
      ),
    db.prepare(`INSERT INTO article_revisions (
      id, article_id, slug, title, excerpt, content_json, seo_title, seo_description,
      canonical_url, og_image_url, tag, keywords_json, hero_image_url, hero_image_alt,
      noindex, version, status, saved_by, created_at
    ) SELECT ?, id, slug, title, excerpt, content_json, seo_title, seo_description,
      canonical_url, og_image_url, tag, keywords_json, hero_image_url, hero_image_alt,
      noindex, ?, 'draft', ?, ? FROM articles WHERE id = ? AND site_id = ? AND version = ?`)
      .bind(crypto.randomUUID(), nextVersion, savedBy, now, articleId, site.id, nextVersion),
  ]);
  if (Number(results[0]?.meta.changes || 0) !== 1) {
    return json({ error: "文章已被其他操作更新，請重新整理後再還原" }, { status: 409 });
  }
  const row = await db.prepare("SELECT * FROM articles WHERE id = ? AND site_id = ? LIMIT 1")
    .bind(articleId, site.id)
    .first<Record<string, unknown>>();
  return json({ article: row ? parseArticleRow(row) : null, restoredRevisionId: revisionId });
}

async function listPublicArticles(request: Request, db: D1Database) {
  const url = new URL(request.url);
  const siteCode = cleanSlug(url.searchParams.get("site")) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return publicJson({ error: "找不到指定站台" }, { status: 404 });

  const slugFromPath = url.pathname.startsWith("/api/content/articles/")
    ? decodeURIComponent(url.pathname.slice("/api/content/articles/".length))
    : "";

  if (slugFromPath) {
    const slug = cleanSlug(slugFromPath);
    const row = await db.prepare(`SELECT * FROM articles
      WHERE site_id = ? AND slug = ? AND status = 'published'
      LIMIT 1`)
      .bind(site.id, slug)
      .first<Record<string, unknown>>();
    return row
      ? publicJson({ site, article: parseArticleRow(row) })
      : publicJson({ error: "找不到文章" }, { status: 404 });
  }

  const result = await db.prepare(`SELECT * FROM articles
    WHERE site_id = ? AND status = 'published'
    ORDER BY published_at DESC, updated_at DESC
    LIMIT 100`)
    .bind(site.id)
    .all<Record<string, unknown>>();
  return publicJson({ site, articles: result.results.map(parseArticleRow) });
}

export async function handleContentApi(request: Request, env: DatabaseEnv) {
  const url = new URL(request.url);
  const isAdminPath = url.pathname === "/api/admin/articles" ||
    url.pathname.startsWith("/api/admin/articles/");
  const isPublicPath = url.pathname === "/api/content/articles" ||
    url.pathname.startsWith("/api/content/articles/");

  if (!isAdminPath && !isPublicPath) return null;
  if (!env.DB) {
    return json(
      { error: "內容資料庫尚未連線，請在可使用 D1 的環境開啟後台。" },
      { status: 503 },
    );
  }

  try {
    await ensureDatabase(env.DB);

    if (isPublicPath && request.method === "GET") {
      return listPublicArticles(request, env.DB);
    }

    const identity = adminIdentity(request, env);
    if (!identity) {
      const hasAuthenticatedEmail = Boolean(request.headers.get("oai-authenticated-user-email"));
      return json(
        hasAuthenticatedEmail
          ? { error: "此帳號不在後台允許名單內" }
          : { error: "請先登入後台再繼續", signInUrl: "/signin-with-chatgpt?return_to=%2Fadmin" },
        { status: hasAuthenticatedEmail ? 403 : 401 },
      );
    }

    const invalidWriteResponse = validateWriteRequest(request);
    if (invalidWriteResponse) return invalidWriteResponse;

    if (url.pathname === "/api/admin/articles" && request.method === "GET") {
      return listAdminArticles(request, env.DB);
    }
    if (url.pathname === "/api/admin/articles" && request.method === "POST") {
      return saveArticle(request, env.DB, identity);
    }
    if (url.pathname.endsWith("/revisions") && request.method === "GET") {
      return listArticleRevisions(request, url.pathname, env.DB);
    }
    if (url.pathname.endsWith("/revisions") && request.method === "POST") {
      return restoreArticleRevision(request, url.pathname, env.DB, identity);
    }
    if (url.pathname.startsWith("/api/admin/articles/") && request.method === "DELETE") {
      return archiveArticle(request, url.pathname, env.DB, identity);
    }

    return json({ error: "不支援的操作" }, { status: 405, headers: { allow: "GET, POST, DELETE" } });
  } catch {
    return json(
      { error: "內容服務暫時無法使用" },
      { status: 500 },
    );
  }
}
