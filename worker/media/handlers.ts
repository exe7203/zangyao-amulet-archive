import {
  adminPageRequest,
  adminPaginationPayload,
  resolvedAdminPage,
} from "../../shared/admin/pagination";
import {
  adminIdentity,
  cleanSlug,
  cleanText,
  isLocalRequest,
  json,
  validateWriteRequest,
} from "../api-utils";
import { adminLoginDenied } from "../admin-auth-api";
import {
  DEFAULT_SITE_CODE,
  ensureDatabase,
  findSite,
  type DatabaseEnv,
} from "../database";

export type MediaEnv = DatabaseEnv & {
  MEDIA?: R2Bucket;
};

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_ALT_TEXT_LENGTH = 300;
const MEDIA_PURPOSES = new Set(["product", "article", "site", "shipping_label"]);
const MEDIA_STATUSES = new Set(["pending", "ready", "quarantined", "deleted"]);
const ADMIN_MEDIA_LIST_DEFAULT = 40;
const ADMIN_MEDIA_LIST_MAX = 100;
const PUBLIC_MEDIA_PREFIX = "/api/media/";
const ADMIN_MEDIA_PREFIX = "/api/admin/media";

const MAGIC_BYTES: ReadonlyArray<{ type: string; bytes: readonly number[] }> = [
  { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { type: "image/gif", bytes: [0x47, 0x49, 0x46] },
  { type: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] },
];

function adminDenied(request: Request) {
  return adminLoginDenied(request, "/admin/media/");
}

function mediaUnavailable() {
  return json(
    { error: "媒體儲存尚未連線，請確認 Cloudflare R2 已綁定。" },
    { status: 503 },
  );
}

function extFromContentType(contentType: string) {
  switch (contentType) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "image/gif": return "gif";
    default: return "bin";
  }
}

function detectContentType(buffer: Uint8Array, declaredType: string) {
  for (const signature of MAGIC_BYTES) {
    if (signature.bytes.every((byte, index) => buffer[index] === byte)) {
      if (signature.type === "image/webp") {
        const webp = buffer.length >= 12 &&
          buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
        if (!webp) continue;
      }
      return signature.type;
    }
  }
  return ALLOWED_CONTENT_TYPES.has(declaredType) ? declaredType : "";
}

async function sha256Hex(buffer: ArrayBuffer) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function storageKeyFor(siteCode: string, assetId: string, ext: string, local: boolean) {
  const now = new Date();
  const environment = local ? "local" : "prod";
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${environment}/${siteCode}/${now.getUTCFullYear()}/${month}/${assetId}/original.${ext}`;
}

function mediaPublicUrl(request: Request, assetId: string) {
  return `${new URL(request.url).origin}${PUBLIC_MEDIA_PREFIX}${encodeURIComponent(assetId)}`;
}

function mapMediaRow(request: Request, row: Record<string, unknown>) {
  const id = String(row.id || "");
  return {
    id,
    siteId: String(row.site_id || ""),
    storageKey: String(row.storage_key || ""),
    checksumSha256: String(row.checksum_sha256 || ""),
    contentType: String(row.content_type || ""),
    byteSize: Number(row.byte_size || 0),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    altText: String(row.alt_text || ""),
    purpose: String(row.purpose || ""),
    status: String(row.status || ""),
    createdAt: String(row.created_at || ""),
    readyAt: row.ready_at ? String(row.ready_at) : null,
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    url: id ? mediaPublicUrl(request, id) : "",
  };
}

async function listAdminMedia(request: Request, db: D1Database) {
  const url = new URL(request.url);
  const siteCode = cleanSlug(url.searchParams.get("site")) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return json({ error: "找不到指定站台" }, { status: 404 });

  const purpose = cleanSlug(url.searchParams.get("purpose"));
  const status = cleanSlug(url.searchParams.get("status")) || "ready";
  if (purpose && !MEDIA_PURPOSES.has(purpose)) {
    return json({ error: "不支援的媒體用途" }, { status: 400 });
  }
  if (!MEDIA_STATUSES.has(status)) {
    return json({ error: "不支援的媒體狀態" }, { status: 400 });
  }

  const pageRequest = adminPageRequest(url, ADMIN_MEDIA_LIST_DEFAULT, ADMIN_MEDIA_LIST_MAX);
  const filters = ["site_id = ?", "status = ?"];
  const bindings: unknown[] = [site.id, status];
  if (purpose) {
    filters.push("purpose = ?");
    bindings.push(purpose);
  }

  const totalRow = await db.prepare(
    `SELECT COUNT(*) AS total FROM media_assets WHERE ${filters.join(" AND ")}`,
  ).bind(...bindings).first<{ total?: unknown }>();
  const total = Number(totalRow?.total || 0);
  const page = resolvedAdminPage(pageRequest.page, pageRequest.limit, total, pageRequest.maxLimit);

  const rows = await db.prepare(
    `SELECT * FROM media_assets
     WHERE ${filters.join(" AND ")}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
  ).bind(...bindings, page.limit, page.offset).all<Record<string, unknown>>();

  const assets = (rows.results || []).map((row) => mapMediaRow(request, row));
  return json({
    assets,
    pagination: adminPaginationPayload(page, assets.length),
  });
}

async function uploadAdminMedia(request: Request, db: D1Database, env: MediaEnv, identity: string) {
  const writeError = validateWriteRequest(request, { allowMultipart: true });
  if (writeError) return writeError;
  if (!env.MEDIA) return mediaUnavailable();

  const url = new URL(request.url);
  const siteCode = cleanSlug(url.searchParams.get("site")) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return json({ error: "找不到指定站台" }, { status: 404 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: "請以 multipart/form-data 上傳圖片" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return json({ error: "缺少 file 欄位" }, { status: 400 });
  }

  const purpose = cleanSlug(String(formData.get("purpose") || "product"));
  if (!MEDIA_PURPOSES.has(purpose)) {
    return json({ error: "不支援的媒體用途" }, { status: 400 });
  }

  const altText = cleanText(String(formData.get("altText") || ""), MAX_ALT_TEXT_LENGTH);
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    return json({ error: "圖片大小必須介於 1 byte 與 10 MB 之間" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = detectContentType(bytes, file.type || "");
  if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
    return json({ error: "僅支援 JPEG、PNG、WebP 或 GIF 圖片" }, { status: 400 });
  }

  const checksum = await sha256Hex(bytes.buffer);
  const duplicate = await db.prepare(
    "SELECT id FROM media_assets WHERE site_id = ? AND checksum_sha256 = ? AND status != 'deleted' LIMIT 1",
  ).bind(site.id, checksum).first<{ id?: string }>();
  if (duplicate?.id) {
    const existing = await db.prepare("SELECT * FROM media_assets WHERE id = ? LIMIT 1")
      .bind(duplicate.id).first<Record<string, unknown>>();
    if (existing) {
      return json({ asset: mapMediaRow(request, existing), deduplicated: true });
    }
  }

  const assetId = `media_${crypto.randomUUID()}`;
  const storageKey = storageKeyFor(String(site.code || DEFAULT_SITE_CODE), assetId, extFromContentType(contentType), isLocalRequest(request));
  const now = new Date().toISOString();

  await env.MEDIA.put(storageKey, bytes, {
    httpMetadata: { contentType },
  });

  await db.prepare(`INSERT INTO media_assets (
    id, site_id, storage_key, checksum_sha256, content_type, byte_size,
    width, height, alt_text, purpose, status, uploaded_by_subject_hash,
    created_at, ready_at
  ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, 'ready', ?, ?, ?)`)
    .bind(
      assetId,
      site.id,
      storageKey,
      checksum,
      contentType,
      file.size,
      altText,
      purpose,
      identity.slice(0, 120),
      now,
      now,
    )
    .run();

  const row = await db.prepare("SELECT * FROM media_assets WHERE id = ? LIMIT 1")
    .bind(assetId).first<Record<string, unknown>>();
  if (!row) return json({ error: "媒體建立失敗" }, { status: 500 });
  return json({ asset: mapMediaRow(request, row) }, { status: 201 });
}

async function deleteAdminMedia(request: Request, db: D1Database, assetId: string) {
  const writeError = validateWriteRequest(request);
  if (writeError) return writeError;

  const url = new URL(request.url);
  const siteCode = cleanSlug(url.searchParams.get("site")) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return json({ error: "找不到指定站台" }, { status: 404 });

  const row = await db.prepare(
    "SELECT id, status FROM media_assets WHERE id = ? AND site_id = ? LIMIT 1",
  ).bind(assetId, site.id).first<{ id?: string; status?: string }>();
  if (!row?.id) return json({ error: "找不到媒體" }, { status: 404 });
  if (row.status === "deleted") return json({ ok: true });

  const references = await db.prepare(
    "SELECT COUNT(*) AS total FROM product_media WHERE media_asset_id = ? AND site_id = ?",
  ).bind(assetId, site.id).first<{ total?: unknown }>();
  if (Number(references?.total || 0) > 0) {
    return json({ error: "此媒體仍被商品引用，請先移除商品圖片關聯" }, { status: 409 });
  }

  const now = new Date();
  const purgeAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare(`UPDATE media_assets
    SET status = 'deleted', deleted_at = ?, purge_after = ?
    WHERE id = ? AND site_id = ?`)
    .bind(now.toISOString(), purgeAfter, assetId, site.id)
    .run();

  return json({ ok: true, purgeAfter });
}

async function servePublicMedia(request: Request, db: D1Database, env: MediaEnv, assetId: string) {
  if (!env.MEDIA) return new Response("Media storage unavailable", { status: 503 });

  const row = await db.prepare(
    `SELECT storage_key, content_type, byte_size, alt_text
     FROM media_assets
     WHERE id = ? AND status = 'ready'
     LIMIT 1`,
  ).bind(assetId).first<Record<string, unknown>>();
  if (!row?.storage_key) return new Response("Not found", { status: 404 });

  const object = await env.MEDIA.get(String(row.storage_key));
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  headers.set("content-type", String(row.content_type || "application/octet-stream"));
  headers.set("cache-control", "public, max-age=31536000, immutable");
  const altText = String(row.alt_text || "").trim();
  if (altText) headers.set("content-disposition", `inline; filename="${encodeURIComponent(altText)}"`);

  return new Response(object.body, { headers });
}

export async function handleMediaApi(request: Request, env: MediaEnv) {
  const url = new URL(request.url);
  const isAdminPath = url.pathname === ADMIN_MEDIA_PREFIX ||
    url.pathname.startsWith(`${ADMIN_MEDIA_PREFIX}/`);
  const isPublicPath = url.pathname.startsWith(PUBLIC_MEDIA_PREFIX);

  if (!isAdminPath && !isPublicPath) return null;

  if (isPublicPath && request.method === "GET") {
    if (!env.DB) return new Response("Database unavailable", { status: 503 });
    await ensureDatabase(env.DB);
    const assetId = decodeURIComponent(url.pathname.slice(PUBLIC_MEDIA_PREFIX.length)).replace(/\/$/, "");
    if (!assetId || assetId.includes("/")) return new Response("Not found", { status: 404 });
    return servePublicMedia(request, env.DB, env, assetId);
  }

  if (!env.DB) {
    return json(
      { error: "媒體資料庫尚未連線，請在可使用 D1 的環境開啟後台。" },
      { status: 503 },
    );
  }

  try {
    await ensureDatabase(env.DB);

    if (isPublicPath) {
      return json({ error: "不支援的操作" }, { status: 405 });
    }

    const identity = await adminIdentity(request, env);
    if (!identity) {
      const hasAuthenticatedEmail = Boolean(request.headers.get("oai-authenticated-user-email"));
      if (hasAuthenticatedEmail) {
        return json({ error: "此帳號不在後台允許名單內" }, { status: 403 });
      }
      return adminDenied(request);
    }

    if (url.pathname === ADMIN_MEDIA_PREFIX && request.method === "GET") {
      return listAdminMedia(request, env.DB);
    }
    if (url.pathname === ADMIN_MEDIA_PREFIX && request.method === "POST") {
      return uploadAdminMedia(request, env.DB, env, identity);
    }

    const assetMatch = url.pathname.match(/^\/api\/admin\/media\/([^/]+)$/);
    if (assetMatch && request.method === "DELETE") {
      return deleteAdminMedia(request, env.DB, decodeURIComponent(assetMatch[1]));
    }

    return json({ error: "不支援的操作" }, { status: 405 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "媒體 API 失敗";
    return json({ error: message }, { status: 500 });
  }
}

export function mediaApiContractPaths() {
  return {
    adminList: ADMIN_MEDIA_PREFIX,
    adminUpload: ADMIN_MEDIA_PREFIX,
    publicServe: PUBLIC_MEDIA_PREFIX,
  };
}
