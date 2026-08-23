import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
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

function runWrangler(args, env = process.env) {
  if (!existsSync(wranglerCli)) {
    throw new Error("找不到 wrangler，請先執行 npm install。");
  }
  run(process.execPath, [wranglerCli, "--config", wranglerToml, ...args], env);
}

async function readDeployConfig() {
  if (!existsSync(deployFile)) {
    throw new Error(
      `尚未建立 ${path.relative(projectRoot, deployFile)}。請先執行：npm run cf:init`,
    );
  }
  const parsed = JSON.parse(await readFile(deployFile, "utf8"));
  const databaseId = String(parsed.databaseId || "").trim();
  const siteUrl = String(parsed.siteUrl || "").trim();
  const databaseName = String(parsed.databaseName || "taijuda-prod").trim();
  const adminEmailAllowlist = String(parsed.adminEmailAllowlist || "").trim();

  if (!databaseId || databaseId.includes("在此貼上")) {
    throw new Error("deploy.json 的 databaseId 尚未設定。");
  }
  if (!siteUrl.startsWith("https://")) {
    throw new Error("deploy.json 的 siteUrl 必須是 https:// 開頭的正式網址。");
  }
  if (!adminEmailAllowlist) {
    throw new Error("deploy.json 的 adminEmailAllowlist 至少需填一個後台 Email。");
  }

  return { databaseId, siteUrl, databaseName, adminEmailAllowlist };
}

async function syncWranglerToml({ databaseId, databaseName, adminEmailAllowlist }) {
  let toml = await readFile(wranglerToml, "utf8");
  toml = toml.replace(/database_id = ".*"/, `database_id = "${databaseId}"`);
  toml = toml.replace(/database_name = ".*"/, `database_name = "${databaseName}"`);
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
  await syncWranglerToml(config);
  buildForCloudflare(config.siteUrl);

  console.log("正在套用 D1 migrations……");
  runWrangler(["d1", "migrations", "apply", config.databaseName, "--remote"]);

  console.log("正在部署 Worker……");
  runWrangler(["deploy"], {
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
}

async function migrateOnly() {
  const config = await readDeployConfig();
  await syncWranglerToml(config);
  runWrangler(["d1", "migrations", "list", config.databaseName, "--remote"]);
  runWrangler(["d1", "migrations", "apply", config.databaseName, "--remote"]);
}

async function main() {
  const command = process.argv[2] || "help";
  try {
    if (command === "init") await initConfig();
    else if (command === "migrate") await migrateOnly();
    else if (command === "deploy") await deploy();
    else {
      console.log("用法：");
      console.log("  npm run cf:init     建立 .cloudflare/deploy.json");
      console.log("  npm run cf:migrate  套用遠端 D1 migrations");
      console.log("  npm run cf:deploy   建置並部署 Cloudflare Worker");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

await main();
