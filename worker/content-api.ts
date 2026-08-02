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

const MAX_CONTENT_BYTES = 1_000_000;
const ARTICLE_STATUSES = new Set(["draft", "published", "archived"]);
const TIPTAP_NODE_TYPES = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "hardBreak",
  "horizontalRule",
  "codeBlock",
]);
const TIPTAP_MARK_TYPES = new Set(["bold", "italic", "underline", "strike", "code", "link"]);

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
  noindex?: boolean;
};

function validateTiptapNode(value: unknown, depth: number, state: { count: number }) {
  if (!isRecord(value) || typeof value.type !== "string" || !TIPTAP_NODE_TYPES.has(value.type)) {
    return false;
  }
  if (depth > 30 || ++state.count > 5000) return false;
  if (value.text !== undefined && typeof value.text !== "string") return false;
  if (value.attrs !== undefined && !isRecord(value.attrs)) return false;
  if (value.content !== undefined) {
    if (!Array.isArray(value.content)) return false;
    if (!value.content.every((child) => validateTiptapNode(child, depth + 1, state))) return false;
  }
  if (value.marks !== undefined) {
    if (!Array.isArray(value.marks)) return false;
    for (const mark of value.marks) {
      if (!isRecord(mark) || typeof mark.type !== "string" || !TIPTAP_MARK_TYPES.has(mark.type)) {
        return false;
      }
      if (mark.attrs !== undefined && !isRecord(mark.attrs)) return false;
      if (mark.type === "link") {
        const href = isRecord(mark.attrs) ? mark.attrs.href : "";
        if (typeof href !== "string" || !/^(?:https?:|mailto:|\/|#)/i.test(href)) return false;
      }
    }
  }
  return true;
}

function normalizeContentJson(value: unknown) {
  const fallback = { type: "doc", content: [{ type: "paragraph" }] };
  const content = value ?? fallback;
  if (!validateTiptapNode(content, 0, { count: 0 }) || !isRecord(content) || content.type !== "doc") {
    throw new Error("文章內容不是有效的 Tiptap 文件");
  }
  const serialized = JSON.stringify(content);
  if (new TextEncoder().encode(serialized).byteLength > MAX_CONTENT_BYTES) {
    throw new Error("文章內容超過 1 MB 上限");
  }
  return serialized;
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
    noindex: Boolean(row.noindex),
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
  if (cleanText(payload.canonicalUrl, 1000) && !canonicalUrl) {
    return json({ error: "Canonical URL 必須是有效的 http 或 https 網址" }, { status: 400 });
  }
  if (cleanText(payload.ogImageUrl, 1000) && !ogImageUrl) {
    return json({ error: "OG 圖片 URL 必須是有效的 http 或 https 網址" }, { status: 400 });
  }

  let contentJson: string;
  try {
    contentJson = normalizeContentJson(payload.contentJson);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "文章內容格式錯誤" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const values = {
    title,
    slug,
    excerpt: cleanText(payload.excerpt, 500),
    contentJson,
    status,
    seoTitle: cleanText(payload.seoTitle, 180),
    seoDescription: cleanText(payload.seoDescription, 500),
    canonicalUrl,
    ogImageUrl,
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
      await db.batch([
        db.prepare(`INSERT INTO article_revisions (
          id, article_id, slug, title, excerpt, content_json, seo_title,
          seo_description, canonical_url, og_image_url, noindex, status, saved_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
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
            values.noindex,
            values.status,
            savedBy,
          ),
        db.prepare(`UPDATE articles SET
          slug = ?, title = ?, excerpt = ?, content_json = ?, status = ?,
          seo_title = ?, seo_description = ?, canonical_url = ?, og_image_url = ?,
          noindex = ?, published_at = CASE
            WHEN ? = 'published' THEN COALESCE(published_at, ?)
            ELSE published_at
          END,
          updated_at = ?
          WHERE id = ? AND site_id = ?`)
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
            values.noindex,
            values.status,
            now,
            now,
            articleId,
            site.id,
          ),
      ]);
    } else {
      await db.batch([
        db.prepare(`INSERT INTO articles (
          id, site_id, slug, title, excerpt, content_json, status,
          seo_title, seo_description, canonical_url, og_image_url, noindex,
          published_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
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
            values.noindex,
            values.status === "published" ? now : null,
            now,
            now,
          ),
        db.prepare(`INSERT INTO article_revisions (
          id, article_id, slug, title, excerpt, content_json, seo_title,
          seo_description, canonical_url, og_image_url, noindex, status, saved_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
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
  await db.batch([
    db.prepare(`INSERT INTO article_revisions (
      id, article_id, slug, title, excerpt, content_json, seo_title,
      seo_description, canonical_url, og_image_url, noindex, status, saved_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
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
        existing.noindex,
        "archived",
        savedBy,
      ),
    db.prepare(
      "UPDATE articles SET status = 'archived', updated_at = ? WHERE id = ? AND site_id = ?",
    ).bind(now, articleId, site.id),
  ]);
  return json({ ok: true });
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
    LIMIT 12`)
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
