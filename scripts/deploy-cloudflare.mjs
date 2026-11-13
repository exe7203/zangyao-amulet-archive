import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHmac, randomBytes } from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const configDir = path.join(projectRoot, ".cloudflare");
const deployFile = path.join(configDir, "deploy.json");
const deployExample = path.join(configDir, "deploy.example.json");
const wranglerToml = path.join(configDir, "wrangler.toml");
const wranglerCli = path.join(projectRoot, "node_modules", "wrangler", "wrangler-dist", "cli.js");
const vinextCli = path.join(projectRoot, "node_modules", "vinext", "dist", "cli.js");
const adminUsersFile = path.join(projectRoot, ".local-runtime", "admin-users.json");

const DEFAULT_CLOUD_ADMIN_USERS = [
  { username: "exe7203", password: "12345678" },
  { username: "F0524007", password: "12345678" },
];

function hashAdminPassword(username, password, secret) {
  return createHmac("sha256", secret).update(`${username}\n${password}`).digest("hex");
}

async function loadCloudAdminAuth() {
  let sessionSecret = randomBytes(24).toString("base64url");
  let users = DEFAULT_CLOUD_ADMIN_USERS;

  if (existsSync(adminUsersFile)) {
    try {
      const parsed = JSON.parse(await readFile(adminUsersFile, "utf8"));
      if (typeof parsed?.sessionSecret === "string" && parsed.sessionSecret.trim().length >= 16) {
        sessionSecret = parsed.sessionSecret.trim();
      }
      if (Array.isArray(parsed?.users) && parsed.users.length > 0) {
        users = parsed.users.flatMap((entry) => {
          const username = typeof entry?.username === "string" ? entry.username.trim() : "";
          const password = typeof entry?.password === "string" ? entry.password : "";
          return username && password ? [{ username, password }] : [];
        });
      }
    } catch {
      // Keep defaults when the local file is unreadable.
    }
  }

  const accounts = users.map(({ username, password }) => ({
    username,
    passwordHash: hashAdminPassword(username, password, sessionSecret),
  }));

  return {
    sessionSecret,
    accountsJson: JSON.stringify(accounts),
  };
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} ${args.join(" ")} 失敗。`);
  }
}

function runWranglerCapture(args, env = process.env) {
  if (!existsSync(wranglerCli)) {
    throw new Error("找不到 wrangler，請先執行 npm install。");
  }
  const result = spawnSync(process.execPath, [wranglerCli, "--config", wranglerToml, ...args], {
    cwd: projectRoot,
    env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "wrangler 執行失敗");
  }
  return `${result.stdout || ""}${result.stderr || ""}`;
}

function runWrangler(args, env = process.env) {
  runWranglerCapture(args, env);
}

function parseJsonFromWranglerOutput(output) {
  const start = output.indexOf("{");
  const arrayStart = output.indexOf("[");
  const index = start === -1 ? arrayStart : arrayStart === -1 ? start : Math.min(start, arrayStart);
  if (index === -1) throw new Error("無法解析 wrangler 輸出");
  return JSON.parse(output.slice(index));
}

async function bootstrapConfig() {
  await mkdir(configDir, { recursive: true });
  const whoamiOutput = runWranglerCapture(["whoami"]);
  if (/not authenticated/i.test(whoamiOutput)) {
    throw new Error("尚未登入 Cloudflare。請先在終端機執行：npx wrangler login");
  }

  const databaseName = "taijuda-prod";
  const workerName = "taijuda-amulet-archive";
  let databaseId = "";

  try {
    const listOutput = runWranglerCapture(["d1", "list", "--json"]);
    const databases = parseJsonFromWranglerOutput(listOutput);
    const existing = Array.isArray(databases)
      ? databases.find((entry) => entry?.name === databaseName)
      : null;
    if (existing?.uuid) {
      databaseId = existing.uuid;
      console.log(`已找到既有 D1：${databaseName} (${databaseId})`);
    }
  } catch {
    // wrangler 版本若無 --json，改走 create
  }

  if (!databaseId) {
    console.log(`正在建立 D1 資料庫 ${databaseName}……`);
    const createOutput = runWranglerCapture(["d1", "create", databaseName]);
    const match = createOutput.match(/database_id = "([^"]+)"/);
    databaseId = match?.[1] || "";
    if (!databaseId) {
      const jsonMatch = createOutput.match(/"uuid"\s*:\s*"([^"]+)"/);
      databaseId = jsonMatch?.[1] || "";
    }
  }

  if (!databaseId) {
    throw new Error("無法取得 D1 database_id，請手動執行 wrangler d1 create taijuda-prod");
  }

  const bucketName = "taijuda-media";
  ensureMediaBucket(bucketName);

  const accountSubdomain = process.env.CF_ACCOUNT_SUBDOMAIN?.trim() || "exe7203";
  const siteUrl = `https://${workerName}.${accountSubdomain}.workers.dev/`;
  const adminEmailAllowlist = process.env.CF_ADMIN_EMAIL?.trim() || "exe7203@gmail.com";

  const deployConfig = {
    databaseName,
    databaseId,
    accountSubdomain,
    siteUrl,
    adminEmailAllowlist,
    workerName,
    notes: "由 cf:bootstrap 自動產生；siteUrl 若 404 請依 Cloudflare 儀表板修正 accountSubdomain",
  };

  await writeFile(deployFile, `${JSON.stringify(deployConfig, null, 2)}\n`, "utf8");
  await syncWranglerToml({
    databaseId,
    databaseName,
    adminEmailAllowlist,
    includeR2: ensureMediaBucket(bucketName),
  });

  console.log("");
  console.log("Cloudflare 部署標的已寫入 .cloudflare/deploy.json");
  console.log(`D1：${databaseName} / ${databaseId}`);
  console.log(`預估網址：${siteUrl}`);
  console.log(`後台 Email 白名單：${adminEmailAllowlist}`);
  console.log("");
  console.log("下一步：");
  console.log("  npm run cf:migrate");
  console.log("  npm run cf:seed");
  console.log("  npm run cf:deploy");
}

async function seedRemote() {
  run(process.execPath, [path.join(projectRoot, "scripts", "cf-seed-remote.mjs")]);
}

async function importLocal() {
  const config = await readDeployConfig({ allowPlaceholderUrl: true });
  const exportPath = path.join(configDir, "local-export.sql");
  const localWrangler = path.join(projectRoot, "dist", "server", "wrangler.json");
  if (!existsSync(localWrangler)) {
    throw new Error("找不到本機 wrangler.json，請先執行 npm run local:build");
  }

  console.log("正在匯出本機 D1……");
  run(process.execPath, [
    wranglerCli,
    "--config",
    localWrangler,
    "d1",
    "export",
    "site-creator-d1",
    "--local",
    "--output",
    exportPath,
  ]);

  console.log("正在匯入遠端 D1……");
  runWrangler(["d1", "execute", config.databaseName, "--remote", "--file", exportPath]);
  console.log("本機資料已匯入遠端 D1。");
}

async function readDeployConfig({ allowPlaceholderUrl = false } = {}) {
  if (!existsSync(deployFile)) {
    throw new Error(
      `尚未建立 ${path.relative(projectRoot, deployFile)}。請先執行：npm run cf:bootstrap`,
    );
  }
  const parsed = JSON.parse(await readFile(deployFile, "utf8"));
  const databaseId = String(parsed.databaseId || "").trim();
  const siteUrl = String(parsed.siteUrl || "").trim();
  const databaseName = String(parsed.databaseName || "taijuda-prod").trim();
  const adminEmailAllowlist = String(parsed.adminEmailAllowlist || "").trim();
  const accountSubdomain = String(parsed.accountSubdomain || "").trim();

  if (!databaseId || databaseId.includes("在此貼上") || databaseId.includes("REPLACE")) {
    throw new Error("deploy.json 的 databaseId 尚未設定。請執行 npm run cf:bootstrap");
  }
  if (!siteUrl.startsWith("https://")) {
    throw new Error("deploy.json 的 siteUrl 必須是 https:// 開頭的網址。");
  }
  if (!allowPlaceholderUrl && siteUrl.includes("你的帳號")) {
    throw new Error("deploy.json 的 siteUrl 仍是範例，請改成實際 workers.dev 網址。");
  }
  if (!adminEmailAllowlist || adminEmailAllowlist.includes("example.com")) {
    throw new Error("deploy.json 的 adminEmailAllowlist 至少需填一個後台 Email。");
  }

  return { databaseId, siteUrl, databaseName, adminEmailAllowlist, accountSubdomain };
}

function cloudflareR2Enabled() {
  try {
    runWranglerCapture(["r2", "bucket", "list"]);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/10042|enable R2/i.test(message)) return false;
    throw error;
  }
}

function ensureMediaBucket(bucketName = "taijuda-media") {
  if (!cloudflareR2Enabled()) {
    console.warn("");
    console.warn("Cloudflare 帳號尚未啟用 R2，本次不綁定 MEDIA。");
    console.warn("請到 Dashboard → R2 → Enable R2，再跑 npm run cf:deploy 即可開啟媒體上傳。");
    console.warn("https://dash.cloudflare.com/?to=/:account/r2/overview");
    console.warn("");
    return false;
  }

  try {
    runWranglerCapture(["r2", "bucket", "create", bucketName]);
    console.log(`已建立 R2 bucket：${bucketName}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already exists|AlreadyExists|10004/i.test(message)) {
      console.log(`R2 bucket 已存在：${bucketName}`);
    } else {
      throw error;
    }
  }
  return true;
}

async function syncWranglerToml({ databaseId, databaseName, adminEmailAllowlist, includeR2 = true }) {
  let toml = await readFile(wranglerToml, "utf8");
  toml = toml.replace(/database_id = ".*"/, `database_id = "${databaseId}"`);
  toml = toml.replace(/database_name = ".*"/, `database_name = "${databaseName}"`);
  toml = toml.replace(/\n\[\[r2_buckets\]\][\s\S]*?bucket_name = "[^"]+"\n?/g, "\n");
  if (includeR2) {
    toml = toml.replace(
      /migrations_dir = "\.\.\/drizzle"\n/,
      `migrations_dir = "../drizzle"\n\n[[r2_buckets]]\nbinding = "MEDIA"\nbucket_name = "taijuda-media"\n`,
    );
  }
  if (/ADMIN_EMAIL_ALLOWLIST = ".*"/.test(toml)) {
    toml = toml.replace(
      /ADMIN_EMAIL_ALLOWLIST = ".*"/,
      `ADMIN_EMAIL_ALLOWLIST = "${adminEmailAllowlist.replaceAll('"', "")}"`,
    );
  } else {
    toml = toml.replace(
      /ADMIN_LOCAL_AUTH_REQUIRED = "0"/,
      `ADMIN_LOCAL_AUTH_REQUIRED = "0"\nADMIN_EMAIL_ALLOWLIST = "${adminEmailAllowlist.replaceAll('"', "")}"`,
    );
  }
  await writeFile(wranglerToml, toml, "utf8");
}

function buildForCloudflare(siteUrl) {
  if (!existsSync(vinextCli)) {
    throw new Error("找不到 vinext，請先執行 npm install。");
  }
  console.log("正在建置 Cloudflare 版本……");
  run(process.execPath, [vinextCli, "build", "--prerender-all"], {
    ...process.env,
    NEXT_PUBLIC_SITE_URL: siteUrl,
    NEXT_PUBLIC_SITE_CODE: process.env.NEXT_PUBLIC_SITE_CODE || "taijuda",
  });
}

async function initConfig() {
  await mkdir(configDir, { recursive: true });
  if (!existsSync(deployFile)) {
    await copyFile(deployExample, deployFile);
    console.log(`已建立 ${path.relative(projectRoot, deployFile)}，請填入 D1 與網址。`);
  } else {
    console.log(`${path.relative(projectRoot, deployFile)} 已存在。`);
  }

  console.log("");
  console.log("下一步：");
  console.log("1. npx wrangler login");
  console.log("2. npx wrangler d1 create taijuda-prod");
  console.log("3. 把 database_id 貼到 .cloudflare/deploy.json");
  console.log("4. siteUrl 可先填 workers.dev，例如 https://taijuda-amulet-archive.<帳號>.workers.dev/");
  console.log("5. adminEmailAllowlist 填可進後台的 Email");
  console.log("6. npm run cf:deploy");
}

async function deploy() {
  const config = await readDeployConfig();
  const includeR2 = ensureMediaBucket();
  await syncWranglerToml({ ...config, includeR2 });
  buildForCloudflare(config.siteUrl);

  console.log("正在套用 D1 migrations……");
  runWrangler(["d1", "migrations", "apply", config.databaseName, "--remote"]);

  console.log("正在部署 Worker……");
  const adminAuth = await loadCloudAdminAuth();
  runWrangler([
    "deploy",
    "--var",
    `ADMIN_LOCAL_SESSION_SECRET:${adminAuth.sessionSecret}`,
    "--var",
    `ADMIN_LOCAL_ACCOUNTS:${adminAuth.accountsJson}`,
  ], {
    ...process.env,
    NEXT_PUBLIC_SITE_URL: config.siteUrl,
    NEXT_PUBLIC_SITE_CODE: "taijuda",
  });

  console.log("");
  console.log("部署完成。");
  console.log(`網站：${config.siteUrl}`);
  console.log(`後台：${config.siteUrl}admin/`);
  console.log("提醒：請到 Cloudflare Zero Trust 設定 Access，保護 /admin 路徑。");
  console.log("接單功能預設關閉（STORE_ORDERS_ENABLED=0）。");
  console.log("雲端後台可用本機相同帳密登入（exe7203 / F0524007）；正式上線前仍建議加 Cloudflare Access。");
  if (!includeR2) {
    console.log("媒體上傳（R2）已略過；商品與文章請繼續使用圖片網址。");
  }
}

async function migrateOnly() {
  const config = await readDeployConfig();
  await syncWranglerToml({ ...config, includeR2: cloudflareR2Enabled() });
  runWrangler(["d1", "migrations", "list", config.databaseName, "--remote"]);
  runWrangler(["d1", "migrations", "apply", config.databaseName, "--remote"]);
}

async function main() {
  const command = process.argv[2] || "help";
  try {
    if (command === "init") await initConfig();
    else if (command === "bootstrap") await bootstrapConfig();
    else if (command === "migrate") await migrateOnly();
    else if (command === "seed") await seedRemote();
    else if (command === "import-local") await importLocal();
    else if (command === "deploy") await deploy();
    else {
      console.log("用法：");
      console.log("  npm run cf:init          建立 .cloudflare/deploy.json 範本");
      console.log("  npm run cf:bootstrap     登入後自動建立 D1 + deploy.json");
      console.log("  npm run cf:migrate       套用遠端 D1 migrations");
      console.log("  npm run cf:seed          從 published-site.json 種子匯入 D1");
      console.log("  npm run cf:import-local  匯出本機 D1 並匯入遠端");
      console.log("  npm run cf:deploy        建置並部署 Cloudflare Worker");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

await main();
