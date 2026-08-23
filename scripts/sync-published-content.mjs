import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const outputDir = path.join(projectRoot, "content");
const outputFile = path.join(outputDir, "published-site.json");
const temporaryFile = path.join(outputDir, ".published-site.tmp.json");
const adminUsersFile = path.join(projectRoot, ".local-runtime", "admin-users.json");
const seedMode = process.argv.includes("--seed");

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertSlug(value, label) {
  assert(typeof value === "string" && /^[\p{Letter}\p{Number}]+(?:-[\p{Letter}\p{Number}]+)*$/u.test(value), `${label} slug 不正確`);
}

function validateSnapshot(value) {
  assert(isRecord(value), "公開快照必須是物件");
  assert(value.schemaVersion === 1, "不支援的公開快照版本");
  assert(isRecord(value.site) && value.site.code === "taijuda", "公開快照站台不正確");
  assert(isRecord(value.siteSettings), "公開快照缺少全站設定");
  for (const key of ["pages", "articles", "products"]) assert(Array.isArray(value[key]), `公開快照缺少 ${key}`);

  for (const [label, entries] of [["頁面", value.pages], ["文章", value.articles], ["商品", value.products]]) {
    const slugs = new Set();
    for (const entry of entries) {
      assert(isRecord(entry), `${label}資料格式不正確`);
      assertSlug(entry.slug, label);
      assert(!slugs.has(entry.slug), `${label} slug 重複：${entry.slug}`);
      slugs.add(entry.slug);
    }
  }

  for (const page of value.pages) {
    assert(page.status === "published", `快照不可包含未發布頁面：${page.slug}`);
    assert(isRecord(page.data) && Array.isArray(page.data.content), `頁面內容格式不正確：${page.slug}`);
    assert(page.data.content.length <= 40, `頁面區塊過多：${page.slug}`);
    assert(typeof page.seoTitle === "string" && page.seoTitle.length >= 8, `頁面 SEO 標題不足：${page.slug}`);
    assert(typeof page.seoDescription === "string" && page.seoDescription.length >= 50, `頁面 SEO 描述不足：${page.slug}`);
  }
  for (const article of value.articles) {
    assert(article.status === "published", `快照不可包含未發布文章：${article.slug}`);
    assert(isRecord(article.contentJson), `文章內容格式不正確：${article.slug}`);
    assert(typeof article.seoTitle === "string" && article.seoTitle.length >= 8, `文章 SEO 標題不足：${article.slug}`);
    assert(typeof article.seoDescription === "string" && article.seoDescription.length >= 50, `文章 SEO 描述不足：${article.slug}`);
  }
  for (const product of value.products) {
    assert(["active", "sold_out"].includes(product.status), `快照包含不可公開商品：${product.slug}`);
    assert(Number.isSafeInteger(product.price) && product.price >= 0, `商品價格不正確：${product.slug}`);
    assert(Number.isSafeInteger(product.stock) && product.stock >= 0, `商品庫存不正確：${product.slug}`);
  }
  return value;
}

async function seedSnapshot() {
  const { DEFAULT_BRAND_PAGE } = await import("../shared/default-page.ts");
  let previous;
  try {
    previous = JSON.parse(await readFile(outputFile, "utf8"));
  } catch {
    throw new Error("找不到初始公開快照；請先還原 content/published-site.json，再執行 content:seed");
  }
  assert(Array.isArray(previous.articles) && previous.articles.length > 0, "初始公開快照缺少示範文章");
  assert(Array.isArray(previous.products) && previous.products.length > 0, "初始公開快照缺少示範商品");
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    exportedAt: now,
    site: {
      id: "site_taijuda",
      code: "taijuda",
      name: "泰聚達",
      locale: "zh-Hant-TW",
      currency: "TWD",
    },
    siteSettings: {
      siteId: "site_taijuda",
      siteCode: "taijuda",
      siteName: "泰聚達",
      settings: {
        announcement: "商品資料整理中，確認後才開放訂購",
        brandName: "泰聚達",
        brandSubtitle: "THAI AMULET ARCHIVE",
        footerNote: "商品資訊與客服管道確認後才會開放正式訂購。",
        homeHeroEyebrow: "泰國佛牌與收藏品",
        homeHeroTitlePrimary: "清楚的商品資訊，",
        homeHeroTitleSecondary: "讓選擇更有依據。",
        homeHeroLead: "提供商品尺寸、材質、年份、來源與保存狀況等資訊，讓你在選購前先了解商品內容。",
        homePrimaryCtaLabel: "查看最新商品",
        homeSecondaryCtaLabel: "閱讀選購指南",
        homeCollectionsTitle: "依商品類型瀏覽",
        homeCollectionsIntro: "從佛牌、神尊與符印等分類查看商品，並參考材質、尺寸與來源說明。",
        homeArrivalsTitle: "最新商品",
      },
      theme: {
        preset: "archive",
        accent: "#b89048",
        surface: "#f4efe4",
        ink: "#171713",
      },
      version: 1,
      updatedAt: now,
    },
    pages: Array.isArray(previous.pages) && previous.pages.length > 0 ? previous.pages : [{
      ...DEFAULT_BRAND_PAGE,
      status: "published",
      version: 1,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    }],
    articles: previous.articles.map((article) => ({
      ...article,
      publishedAt: article.publishedAt || "2026-08-04T00:00:00.000Z",
      updatedAt: article.updatedAt || "2026-08-04T00:00:00.000Z",
      heroImageUrl: "",
      heroImageAlt: "",
      version: 1,
    })),
    products: previous.products.map((product) => ({
      ...product,
      imageUrl: "",
      imageAlt: "",
      seoReady: false,
      version: 1,
      updatedAt: "2026-08-04T00:00:00.000Z",
    })),
  };
}

async function localAdminCookie(origin) {
  if (!existsSync(adminUsersFile)) return "";
  const config = JSON.parse(await readFile(adminUsersFile, "utf8"));
  const username = process.env.TAIJUDA_ADMIN_SYNC_USERNAME || config?.users?.[0]?.username || "exe7203";
  const entry = Array.isArray(config?.users)
    ? config.users.find((candidate) => candidate?.username === username)
    : null;
  const password = entry?.password || "";
  if (!password || !config?.sessionSecret) return "";

  const response = await fetch(`${origin}/api/admin/auth/login`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({ username, password }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `本機後台登入失敗（HTTP ${response.status}）`);
  }
  const setCookie = response.headers.get("set-cookie") || "";
  return setCookie.split(";")[0];
}

async function fetchSnapshot() {
  const endpoint = new URL(process.env.TAIJUDA_ADMIN_EXPORT_URL || "http://127.0.0.1:3000/api/admin/site-export?site=taijuda");
  if (!["127.0.0.1", "localhost", "::1"].includes(endpoint.hostname) && process.env.TAIJUDA_ALLOW_REMOTE_EXPORT !== "1") {
    throw new Error("預設只允許從本機後台同步；若已確認遠端管理驗證，請明確設定 TAIJUDA_ALLOW_REMOTE_EXPORT=1");
  }
  const origin = `${endpoint.protocol}//${endpoint.host}`;
  const cookie = await localAdminCookie(origin);
  const headers = { accept: "application/json", ...(cookie ? { cookie } : {}) };
  const response = await fetch(endpoint, { headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `公開內容同步失敗（HTTP ${response.status}）`);
  return payload;
}

const source = seedMode ? await seedSnapshot() : await fetchSnapshot();
const validated = validateSnapshot(source);
const withoutHash = { ...validated };
delete withoutHash.snapshotHash;
const serializedForHash = JSON.stringify(withoutHash);
const snapshotHash = createHash("sha256").update(serializedForHash).digest("hex").slice(0, 16);
const output = `${JSON.stringify({ ...withoutHash, snapshotHash }, null, 2)}\n`;

await mkdir(outputDir, { recursive: true });
await writeFile(temporaryFile, output, "utf8");
await rename(temporaryFile, outputFile);
console.log(`公開內容快照已同步：${outputFile}`);
console.log(`snapshotHash=${snapshotHash} pages=${validated.pages.length} articles=${validated.articles.length} products=${validated.products.length}`);
