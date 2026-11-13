import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const wranglerToml = path.join(projectRoot, ".cloudflare", "wrangler.toml");
const deployFile = path.join(projectRoot, ".cloudflare", "deploy.json");
const snapshotFile = path.join(projectRoot, "content", "published-site.json");
const wranglerCli = path.join(projectRoot, "node_modules", "wrangler", "wrangler-dist", "cli.js");
const SITE_ID = "site_taijuda";

function sqlString(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

function runWrangler(args) {
  if (!existsSync(wranglerCli)) throw new Error("找不到 wrangler，請先 npm install。");
  const result = spawnSync(process.execPath, [wranglerCli, "--config", wranglerToml, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "wrangler 執行失敗");
  }
  return `${result.stdout || ""}${result.stderr || ""}`;
}

async function readDeployConfig() {
  if (!existsSync(deployFile)) {
    throw new Error("請先執行 npm run cf:bootstrap 建立 .cloudflare/deploy.json");
  }
  const parsed = JSON.parse(await readFile(deployFile, "utf8"));
  const databaseName = String(parsed.databaseName || "taijuda-prod").trim();
  if (!databaseName) throw new Error("deploy.json 缺少 databaseName");
  return { databaseName };
}

function buildSeedStatements(snapshot) {
  const statements = [];
  const site = snapshot.site;
  const settings = snapshot.siteSettings;

  statements.push(
    `INSERT OR IGNORE INTO sites (id, code, name, locale, currency) VALUES (${sqlString(site.id)}, ${sqlString(site.code)}, ${sqlString(site.name)}, ${sqlString(site.locale || "zh-Hant-TW")}, ${sqlString(site.currency || "TWD")});`,
  );

  statements.push(`DELETE FROM site_settings WHERE site_id = ${sqlString(SITE_ID)};`);
  statements.push(
    `INSERT INTO site_settings (site_id, settings_json, theme_json, version, updated_by, updated_at) VALUES (${sqlString(SITE_ID)}, ${sqlString(JSON.stringify(settings.settings))}, ${sqlString(JSON.stringify(settings.theme))}, ${Number(settings.version) || 1}, 'cf-seed', datetime('now'));`,
  );

  for (const page of snapshot.pages || []) {
    statements.push(`DELETE FROM site_pages WHERE site_id = ${sqlString(SITE_ID)} AND slug = ${sqlString(page.slug)};`);
    statements.push(
      `INSERT INTO site_pages (id, site_id, slug, title, data_json, status, seo_title, seo_description, canonical_url, og_image_url, noindex, version, published_at, created_at, updated_at) VALUES (${sqlString(page.id)}, ${sqlString(SITE_ID)}, ${sqlString(page.slug)}, ${sqlString(page.title)}, ${sqlString(JSON.stringify(page.data))}, ${sqlString(page.status)}, ${sqlString(page.seoTitle)}, ${sqlString(page.seoDescription)}, ${sqlString(page.canonicalUrl || "")}, ${sqlString(page.ogImageUrl || "")}, ${page.noindex ? 1 : 0}, ${Number(page.version) || 1}, ${sqlString(page.publishedAt || new Date().toISOString())}, ${sqlString(page.createdAt || new Date().toISOString())}, ${sqlString(page.updatedAt || new Date().toISOString())});`,
    );
  }

  for (const article of snapshot.articles || []) {
    statements.push(`DELETE FROM articles WHERE site_id = ${sqlString(SITE_ID)} AND slug = ${sqlString(article.slug)};`);
    statements.push(
      `INSERT INTO articles (id, site_id, slug, title, excerpt, content_json, status, seo_title, seo_description, canonical_url, og_image_url, tag, keywords_json, hero_image_url, hero_image_alt, noindex, version, published_at, created_at, updated_at) VALUES (${sqlString(article.id)}, ${sqlString(SITE_ID)}, ${sqlString(article.slug)}, ${sqlString(article.title)}, ${sqlString(article.excerpt || "")}, ${sqlString(JSON.stringify(article.contentJson))}, ${sqlString(article.status || "published")}, ${sqlString(article.seoTitle || article.title)}, ${sqlString(article.seoDescription || article.excerpt || article.title)}, ${sqlString(article.canonicalUrl || "")}, ${sqlString(article.ogImageUrl || "")}, ${sqlString(article.tag || "收藏誌")}, ${sqlString(JSON.stringify(article.keywords || []))}, ${sqlString(article.heroImageUrl || "")}, ${sqlString(article.heroImageAlt || "")}, ${article.noindex ? 1 : 0}, ${Number(article.version) || 1}, ${sqlString(article.publishedAt || new Date().toISOString())}, ${sqlString(article.publishedAt || new Date().toISOString())}, ${sqlString(article.updatedAt || new Date().toISOString())});`,
    );
  }

  const categoryIds = new Map();
  for (const product of snapshot.products || []) {
    const categoryName = product.category || "未分類";
    if (!categoryIds.has(categoryName)) {
      const categoryId = `category_${categoryName.replace(/\s+/g, "_")}`;
      const categorySlug = categoryName.replace(/\s+/g, "-").toLowerCase();
      categoryIds.set(categoryName, categoryId);
      statements.push(`DELETE FROM categories WHERE site_id = ${sqlString(SITE_ID)} AND name = ${sqlString(categoryName)};`);
      statements.push(
        `INSERT INTO categories (id, site_id, slug, name, description, sort_order, status, created_at, updated_at) VALUES (${sqlString(categoryId)}, ${sqlString(SITE_ID)}, ${sqlString(categorySlug)}, ${sqlString(categoryName)}, ${sqlString(categoryName)}, 0, 'active', datetime('now'), datetime('now'));`,
      );
    }
    const categoryId = categoryIds.get(categoryName);
    statements.push(`DELETE FROM inventory WHERE product_id = ${sqlString(product.id)};`);
    statements.push(`DELETE FROM products WHERE site_id = ${sqlString(SITE_ID)} AND slug = ${sqlString(product.slug)};`);
    statements.push(
      `INSERT INTO products (id, site_id, category_id, sku, slug, name, short_name, description, origin, temple, buddhist_year, western_year, material, dimensions, price, badge, tone, shape, theme, purchase_limit, stock, status, seo_title, seo_description, image_url, image_alt, seo_ready, version, created_at, updated_at) VALUES (${sqlString(product.id)}, ${sqlString(SITE_ID)}, ${sqlString(categoryId)}, ${sqlString(product.sku || product.slug)}, ${sqlString(product.slug)}, ${sqlString(product.name)}, ${sqlString(product.shortName || product.name)}, ${sqlString(product.description || "")}, ${sqlString(product.origin || "")}, ${sqlString(product.temple || "")}, ${sqlString(product.buddhistYear || "")}, ${sqlString(product.westernYear || "")}, ${sqlString(product.material || "")}, ${sqlString(product.dimensions || "")}, ${Number(product.price) || 0}, ${sqlString(product.badge || "")}, ${sqlString(product.tone || "gold")}, ${sqlString(product.shape || "arch")}, ${sqlString(product.theme || "")}, ${Number(product.purchaseLimit) || 1}, ${Number(product.stock) || 0}, ${sqlString(product.status || "active")}, ${sqlString(product.seoTitle || product.name)}, ${sqlString(product.seoDescription || product.description || product.name)}, ${sqlString(product.imageUrl || "")}, ${sqlString(product.imageAlt || "")}, ${product.seoReady ? 1 : 0}, ${Number(product.version) || 1}, datetime('now'), datetime('now'));`,
    );
    statements.push(
      `INSERT INTO inventory (product_id, site_id, on_hand, reserved, version, updated_at) VALUES (${sqlString(product.id)}, ${sqlString(SITE_ID)}, ${Number(product.stock) || 0}, 0, ${Number(product.inventoryVersion) || 0}, datetime('now'));`,
    );
  }

  return statements;
}

async function main() {
  const { databaseName } = await readDeployConfig();
  const snapshot = JSON.parse(await readFile(snapshotFile, "utf8"));
  const statements = buildSeedStatements(snapshot);
  const chunkSize = 20;

  console.log(`正在將 published-site.json 種子匯入遠端 D1（${databaseName}）……`);
  for (let index = 0; index < statements.length; index += chunkSize) {
    const chunk = statements.slice(index, index + chunkSize).join("\n");
    runWrangler(["d1", "execute", databaseName, "--remote", "--command", chunk]);
  }
  console.log(`完成：共 ${statements.length} 條 SQL。`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
