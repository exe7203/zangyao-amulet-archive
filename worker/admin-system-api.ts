import {
  adminIdentity,
  cleanSlug,
  isLocalRequest,
  json,
} from "./api-utils";
import { adminLoginDenied } from "./admin-auth-api";
import {
  DEFAULT_SITE_CODE,
  ensureDatabase,
  findSite,
  type DatabaseEnv,
} from "./database";
import { publishedSnapshot } from "../shared/published-content";

const SYSTEM_STATUS_PATH = "/api/admin/system-status";
const PUBLIC_HEALTH_PATH = "/api/health";

export async function handlePublicHealthApi(request: Request) {
  const url = new URL(request.url);
  if (url.pathname !== PUBLIC_HEALTH_PATH) return null;
  if (request.method !== "GET") {
    return json({ error: "不支援的操作" }, { status: 405, headers: { allow: "GET" } });
  }
  return json({
    ok: true,
    site: "taijuda",
    mode: isLocalRequest(request) ? "local" : "cloud",
  });
}

function count(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function timestamp(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function versionSignature(rows: readonly Record<string, unknown>[]) {
  return rows
    .map((row) => `${String(row.id || "")}:${count(row.version || 1)}`)
    .sort()
    .join("|");
}

type ProductVersionRow = {
  id?: unknown;
  version?: unknown;
  inventoryVersion?: unknown;
  inventory_version?: unknown;
  stock?: unknown;
  available_stock?: unknown;
};

export function productVersionSignature(rows: readonly ProductVersionRow[]) {
  return rows
    .map((row) => {
      const inventoryVersion = row.inventoryVersion ?? row.inventory_version;
      const availableStock = row.stock ?? row.available_stock;
      return `${String(row.id || "")}:${count(row.version || 1)}:${count(inventoryVersion)}:${count(availableStock)}`;
    })
    .sort()
    .join("|");
}

function adminDenied(request: Request) {
  return adminLoginDenied(request, "/admin/");
}

async function systemStatus(request: Request, db: D1Database) {
  const url = new URL(request.url);
  const siteCode = cleanSlug(url.searchParams.get("site")) || DEFAULT_SITE_CODE;
  const site = await findSite(db, siteCode);
  if (!site) return json({ error: "找不到指定站台" }, { status: 404 });

  const [
    schema,
    settings,
    articles,
    pages,
    products,
    inventory,
    orders,
    publishedArticleVersions,
    publishedPageVersions,
    publicProductVersions,
  ] = await Promise.all([
    db.prepare("SELECT value, updated_at FROM schema_metadata WHERE key = 'schema_version' LIMIT 1")
      .first<Record<string, unknown>>(),
    db.prepare("SELECT version, updated_at FROM site_settings WHERE site_id = ? LIMIT 1")
      .bind(site.id).first<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft,
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
        SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archived,
        MAX(updated_at) AS updated_at
      FROM articles WHERE site_id = ?`)
      .bind(site.id).first<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft,
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
        SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archived,
        MAX(updated_at) AS updated_at
      FROM site_pages WHERE site_id = ?`)
      .bind(site.id).first<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'sold_out' THEN 1 ELSE 0 END) AS sold_out,
        SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archived,
        SUM(CASE WHEN seo_ready = 1 THEN 1 ELSE 0 END) AS seo_ready,
        MAX(updated_at) AS updated_at
      FROM products WHERE site_id = ?`)
      .bind(site.id).first<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) AS tracked_products,
        COALESCE(SUM(on_hand), 0) AS on_hand,
        COALESCE(SUM(reserved), 0) AS reserved,
        COALESCE(SUM(on_hand - reserved), 0) AS available,
        SUM(CASE WHEN (on_hand - reserved) <= 1 THEN 1 ELSE 0 END) AS low_stock,
        MAX(updated_at) AS updated_at
      FROM inventory WHERE site_id = ?`)
      .bind(site.id).first<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN order_status = 'new' THEN 1 ELSE 0 END) AS new_orders,
        SUM(CASE WHEN order_status IN ('confirmed', 'processing', 'shipped') THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN order_status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN order_status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
        SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) AS paid,
        MAX(updated_at) AS updated_at
      FROM orders WHERE site_id = ?`)
      .bind(site.id).first<Record<string, unknown>>(),
    db.prepare("SELECT id, version FROM articles WHERE site_id = ? AND status = 'published' ORDER BY id")
      .bind(site.id).all<Record<string, unknown>>(),
    db.prepare("SELECT id, version FROM site_pages WHERE site_id = ? AND status = 'published' ORDER BY id")
      .bind(site.id).all<Record<string, unknown>>(),
    db.prepare(`SELECT p.id, p.version, i.version AS inventory_version,
        (i.on_hand - i.reserved) AS available_stock
      FROM products p
      JOIN inventory i ON i.product_id = p.id AND i.site_id = p.site_id
      WHERE p.site_id = ? AND p.status IN ('active', 'sold_out') ORDER BY p.id`)
      .bind(site.id).all<Record<string, unknown>>(),
  ]);

  const snapshotSettingsVersion = count(publishedSnapshot.siteSettings.version);
  const snapshotPageSignature = versionSignature(publishedSnapshot.pages);
  const snapshotArticleSignature = versionSignature(publishedSnapshot.articles);
  const snapshotProductSignature = productVersionSignature(publishedSnapshot.products);
  const publishingInSync =
    count(settings?.version) === snapshotSettingsVersion &&
    versionSignature(publishedPageVersions.results) === snapshotPageSignature &&
    versionSignature(publishedArticleVersions.results) === snapshotArticleSignature &&
    productVersionSignature(publicProductVersions.results) === snapshotProductSignature;

  return json({
    generatedAt: new Date().toISOString(),
    site,
    runtime: {
      mode: isLocalRequest(request) ? "local" : "cloud",
      authentication: isLocalRequest(request) ? "local-only" : "email-allowlist",
      database: "Cloudflare D1 / SQLite",
      schemaVersion: count(schema?.value),
      schemaUpdatedAt: timestamp(schema?.updated_at),
    },
    settings: {
      version: count(settings?.version),
      updatedAt: timestamp(settings?.updated_at),
    },
    publishing: {
      inSync: publishingInSync,
      exportedAt: publishedSnapshot.exportedAt,
      snapshotHash: publishedSnapshot.snapshotHash,
      settingsVersion: snapshotSettingsVersion,
      pages: publishedSnapshot.pages.length,
      articles: publishedSnapshot.articles.length,
      products: publishedSnapshot.products.length,
    },
    content: {
      articles: {
        total: count(articles?.total),
        draft: count(articles?.draft),
        published: count(articles?.published),
        archived: count(articles?.archived),
        updatedAt: timestamp(articles?.updated_at),
      },
      pages: {
        total: count(pages?.total),
        draft: count(pages?.draft),
        published: count(pages?.published),
        archived: count(pages?.archived),
        updatedAt: timestamp(pages?.updated_at),
      },
    },
    commerce: {
      products: {
        total: count(products?.total),
        draft: count(products?.draft),
        active: count(products?.active),
        soldOut: count(products?.sold_out),
        archived: count(products?.archived),
        seoReady: count(products?.seo_ready),
        updatedAt: timestamp(products?.updated_at),
      },
      inventory: {
        trackedProducts: count(inventory?.tracked_products),
        onHand: count(inventory?.on_hand),
        reserved: count(inventory?.reserved),
        available: count(inventory?.available),
        lowStock: count(inventory?.low_stock),
        updatedAt: timestamp(inventory?.updated_at),
      },
      orders: {
        total: count(orders?.total),
        new: count(orders?.new_orders),
        inProgress: count(orders?.in_progress),
        completed: count(orders?.completed),
        cancelled: count(orders?.cancelled),
        paid: count(orders?.paid),
        updatedAt: timestamp(orders?.updated_at),
      },
    },
  });
}

export async function handleAdminSystemApi(request: Request, env: DatabaseEnv) {
  const url = new URL(request.url);
  if (url.pathname !== SYSTEM_STATUS_PATH) return null;
  if (!env.DB) return json({ error: "營運資料庫尚未連線" }, { status: 503 });
  if (request.method !== "GET") {
    return json({ error: "不支援的操作" }, { status: 405, headers: { allow: "GET" } });
  }

  try {
    await ensureDatabase(env.DB);
    if (!(await adminIdentity(request, env))) return adminDenied(request);
    return systemStatus(request, env.DB);
  } catch {
    return json({ error: "後台狀態服務暫時無法使用" }, { status: 500 });
  }
}
