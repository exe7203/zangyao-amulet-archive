import { closeSync, existsSync, openSync } from "node:fs";
import {
  appendFile,
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtimeDir = path.join(projectRoot, ".local-runtime");
const dataDir = path.join(projectRoot, ".local-data");
const legacyDataDir = path.join(projectRoot, ".wrangler", "state");
const pidFile = path.join(runtimeDir, "server.json");
const stdoutLog = path.join(runtimeDir, "server.stdout.log");
const stderrLog = path.join(runtimeDir, "server.stderr.log");
const buildLog = path.join(runtimeDir, "build.log");
const vinextCli = path.join(projectRoot, "node_modules", "vinext", "dist", "cli.js");
const wranglerCli = path.join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const workerEntry = path.join(projectRoot, "dist", "server", "index.js");
const wranglerConfig = path.join(projectRoot, "dist", "server", "wrangler.json");
const clientOutput = path.join(projectRoot, "dist", "client");
const host = "127.0.0.1";
const port = 3000;
const siteUrl = `http://${host}:${port}/`;
const adminUrl = `${siteUrl}admin/`;
const productAdminUrl = `${siteUrl}admin/products/`;
const orderAdminUrl = `${siteUrl}admin/orders/`;
const healthUrl = `${siteUrl}api/admin/articles?site=taijuda`;

const sourceTargets = [
  "app",
  "build",
  "db",
  "drizzle",
  "public",
  "shared",
  "worker",
  ".openai/hosting.json",
  "next.config.ts",
  "package-lock.json",
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
];

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const normalizePath = (value) => String(value || "").replaceAll("/", "\\").toLowerCase();

async function readPidRecord() {
  try {
    const value = JSON.parse(await readFile(pidFile, "utf8"));
    return Number.isInteger(value.pid) && value.pid > 0 ? value : null;
  } catch {
    return null;
  }
}

function processIsRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function managedProcessIsRunning(record) {
  if (!record || !processIsRunning(record.pid)) return false;
  if (process.platform !== "win32") return true;

  const script = [
    "$process = Get-CimInstance Win32_Process -Filter \"ProcessId = " + record.pid + "\" -ErrorAction SilentlyContinue",
    "if ($null -eq $process) { exit 3 }",
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "[pscustomobject]@{ ExecutablePath = $process.ExecutablePath; CommandLine = $process.CommandLine } | ConvertTo-Json -Compress",
  ].join("; ");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) return false;

  try {
    const info = JSON.parse(result.stdout);
    const commandLine = normalizePath(info.CommandLine);
    return normalizePath(info.ExecutablePath) === normalizePath(process.execPath) &&
      commandLine.includes(normalizePath(wranglerCli)) &&
      commandLine.includes(normalizePath(wranglerConfig));
  } catch {
    return false;
  }
}

async function checkHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(healthUrl, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.site?.code === "taijuda" && Array.isArray(body.articles);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function openSiteInBrowser() {
  if (process.platform !== "win32") return;
  const child = spawn(
    process.env.ComSpec || "cmd.exe",
    ["/d", "/s", "/c", `start "" "${siteUrl}"`],
    { detached: true, stdio: "ignore", windowsHide: true },
  );
  child.unref();
}

async function ensureDependencies() {
  if (existsSync(vinextCli) && existsSync(wranglerCli)) return;

  console.log("第一次啟動，正在準備網站所需元件，請稍候……");
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["ci"], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "inherit",
    windowsHide: false,
  });
  if (result.status !== 0 || !existsSync(vinextCli) || !existsSync(wranglerCli)) {
    throw new Error("網站元件安裝失敗，請確認網路與 Node.js 後再試一次。");
  }
}

async function newestModifiedTime(target) {
  try {
    const details = await stat(target);
    if (!details.isDirectory()) return details.mtimeMs;
    const entries = await readdir(target, { withFileTypes: true });
    const times = await Promise.all(entries.map((entry) =>
      newestModifiedTime(path.join(target, entry.name))));
    return Math.max(details.mtimeMs, ...times);
  } catch {
    return 0;
  }
}

async function buildIsRequired() {
  if (!existsSync(workerEntry) || !existsSync(wranglerConfig)) return true;
  const outputTime = (await stat(workerEntry)).mtimeMs;
  const sourceTimes = await Promise.all(sourceTargets.map((target) =>
    newestModifiedTime(path.join(projectRoot, target))));
  return Math.max(...sourceTimes) > outputTime;
}

async function validateBuild() {
  if (!existsSync(workerEntry) || !existsSync(wranglerConfig) || !existsSync(clientOutput)) {
    return false;
  }
  try {
    const config = JSON.parse(await readFile(wranglerConfig, "utf8"));
    const worker = await readFile(workerEntry, "utf8");
    const clientFiles = await readdir(clientOutput);
    return Array.isArray(config.d1_databases) &&
      config.d1_databases.some((database) => database.binding === "DB") &&
      config.assets?.directory === "../client" &&
      clientFiles.length > 0 &&
      worker.includes("/api/admin/articles") &&
      worker.includes("/api/content/articles") &&
      worker.includes("/api/admin/products") &&
      worker.includes("/api/store/orders");
  } catch {
    return false;
  }
}

async function buildLocal(force = false) {
  await ensureDependencies();
  await mkdir(runtimeDir, { recursive: true });
  if (!force && !await buildIsRequired() && await validateBuild()) return;

  console.log("正在準備最新版泰聚達本機網站，第一次可能需要約一分鐘……");
  const buildStartedAt = Date.now();
  const result = spawnSync(process.execPath, [vinextCli, "build", "--prerender-all"], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      NEXT_PUBLIC_SITE_URL: siteUrl,
      WRANGLER_LOG_PATH: path.join(projectRoot, ".wrangler", "wrangler.log"),
      WRANGLER_WRITE_LOGS: "false",
    },
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const knownWindowsCleanupIssue = process.platform === "win32" &&
    output.includes("UV_HANDLE_CLOSING") && output.includes("async.c");
  await writeFile(buildLog, output, "utf8");
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr && !knownWindowsCleanupIssue) process.stderr.write(result.stderr);

  const valid = await validateBuild();
  const workerDetails = valid ? await stat(workerEntry) : null;
  const freshOutput = workerDetails !== null && workerDetails.mtimeMs >= buildStartedAt - 5000;
  if (!valid || (result.status !== 0 && !knownWindowsCleanupIssue)) {
    throw new Error(`本機網站建置失敗，請查看：${buildLog}`);
  }
  if (!freshOutput) {
    throw new Error(`本機網站建置沒有產生最新版檔案，請查看：${buildLog}`);
  }
  if (result.status !== 0) {
    console.log("網站檔案已完成；Windows 在結束建置程序時回報已知清理警告，不影響本機版啟動。");
  }
}

async function migrateLegacyData() {
  const currentD1 = path.join(dataDir, "v3", "d1");
  const legacyD1 = path.join(legacyDataDir, "v3", "d1");
  if (existsSync(currentD1) || !existsSync(legacyD1)) return;

  await mkdir(path.dirname(currentD1), { recursive: true });
  await cp(legacyD1, currentD1, { recursive: true, errorOnExist: false, force: false });
  console.log("已將原有文章資料安全移轉到本機版資料夾。");
}

async function stopProcessTree(record) {
  if (!managedProcessIsRunning(record)) return false;

  let terminationSucceeded = true;
  if (process.platform === "win32") {
    const result = spawnSync("taskkill.exe", ["/PID", String(record.pid), "/T", "/F"], {
      encoding: "utf8",
      stdio: "ignore",
      windowsHide: true,
    });
    terminationSucceeded = result.status === 0;
  } else {
    try {
      process.kill(-record.pid, "SIGTERM");
    } catch {
      try {
        process.kill(record.pid, "SIGTERM");
      } catch {
        terminationSucceeded = false;
      }
    }
  }

  for (let attempt = 0; attempt < 20 && processIsRunning(record.pid); attempt += 1) {
    await wait(150);
  }
  return terminationSucceeded && !processIsRunning(record.pid);
}

async function startSite() {
  await mkdir(runtimeDir, { recursive: true });
  await ensureDependencies();

  const current = await readPidRecord();
  if (current && managedProcessIsRunning(current) && await checkHealth()) {
    console.log(`泰聚達本機版已經在運行：${siteUrl}`);
    console.log(`文章管理後台：${adminUrl}`);
    console.log(`商品與庫存：${productAdminUrl}`);
    console.log(`訂單管理：${orderAdminUrl}`);
    openSiteInBrowser();
    return;
  }

  if (await checkHealth()) {
    console.log(`泰聚達本機版已經在運行：${siteUrl}`);
    console.log("目前的網站不是由本啟動器開啟，因此停止器不會結束它。");
    openSiteInBrowser();
    return;
  }

  if (current && managedProcessIsRunning(current) && !await stopProcessTree(current)) {
    throw new Error("舊的泰聚達本機程序無法安全停止，請稍後再試。");
  }
  await rm(pidFile, { force: true });
  await buildLocal();
  await migrateLegacyData();
  await appendFile(stdoutLog, `\n\n[${new Date().toISOString()}] Starting local site\n`, "utf8");
  await appendFile(stderrLog, `\n\n[${new Date().toISOString()}] Starting local site\n`, "utf8");

  const stdoutFd = openSync(stdoutLog, "a");
  const stderrFd = openSync(stderrLog, "a");
  const child = spawn(
    process.execPath,
    [
      wranglerCli,
      "dev",
      "--config", wranglerConfig,
      "--local",
      "--persist-to", dataDir,
      "--ip", host,
      "--port", String(port),
      "--no-show-interactive-dev-session",
      "--log-level", "warn",
    ],
    {
      cwd: projectRoot,
      detached: true,
      env: {
        ...process.env,
        CI: "1",
        NEXT_PUBLIC_SITE_URL: siteUrl,
        WRANGLER_LOG_PATH: path.join(projectRoot, ".wrangler", "wrangler.log"),
        WRANGLER_SEND_METRICS: "false",
        WRANGLER_WRITE_LOGS: "false",
      },
      stdio: ["ignore", stdoutFd, stderrFd],
      windowsHide: true,
    },
  );
  closeSync(stdoutFd);
  closeSync(stderrFd);
  child.unref();

  const record = {
    pid: child.pid,
    startedAt: new Date().toISOString(),
    siteUrl,
    adminUrl,
  };
  await writeFile(pidFile, JSON.stringify(record, null, 2), "utf8");

  process.stdout.write("正在啟動泰聚達本機版");
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await checkHealth()) {
      // D1 schema upgrades can briefly restart the local Worker after the first
      // successful request. Give that one-time reload time to settle, then warm
      // the new isolate before opening the site.
      await wait(12_000);
      if (!await checkHealth()) continue;
      process.stdout.write("\n");
      console.log(`網站已啟動：${siteUrl}`);
      console.log(`文章管理後台：${adminUrl}`);
      console.log(`商品與庫存：${productAdminUrl}`);
      console.log(`訂單管理：${orderAdminUrl}`);
      console.log("文章、商品、庫存與訂單資料會保存在本機專案的 .local-data 資料夾中。");
      openSiteInBrowser();
      return;
    }
    if (!managedProcessIsRunning(record)) break;
    process.stdout.write(".");
    await wait(750);
  }

  if (await stopProcessTree(record)) await rm(pidFile, { force: true });
  process.stdout.write("\n");
  throw new Error(`網站未能啟動，請查看：${stderrLog}`);
}

async function stopSite() {
  const current = await readPidRecord();
  if (!current) {
    console.log("找不到由本啟動器開啟的泰聚達本機版。");
    return;
  }
  if (!managedProcessIsRunning(current)) {
    await rm(pidFile, { force: true });
    console.log("本機版目前未運行；已清除過期的啟動紀錄，沒有結束其他程式。");
    return;
  }

  if (!await stopProcessTree(current)) {
    throw new Error("網站仍在運行，停止紀錄已保留；請稍後再試。");
  }
  await rm(pidFile, { force: true });
  console.log("泰聚達本機版已停止；文章與設定資料仍保留在電腦中。");
}

async function showStatus() {
  const current = await readPidRecord();
  const healthy = await checkHealth();
  if (healthy) {
    console.log(`運行中：${siteUrl}`);
    console.log(`文章管理後台：${adminUrl}`);
    console.log(`商品與庫存：${productAdminUrl}`);
    console.log(`訂單管理：${orderAdminUrl}`);
    console.log(current && managedProcessIsRunning(current)
      ? `本機程序編號：${current.pid}`
      : "網站正在運行，但不是由本啟動器開啟。");
    return;
  }

  console.log("目前未運行。請雙擊「啟動泰聚達本機版.cmd」。");
  if (current && !managedProcessIsRunning(current)) await rm(pidFile, { force: true });
}

const command = process.argv[2] || "status";
try {
  if (command === "build") {
    await buildLocal(true);
    console.log("泰聚達本機版已完成更新。");
  } else if (command === "start") await startSite();
  else if (command === "stop") await stopSite();
  else if (command === "status") await showStatus();
  else throw new Error(`不支援的操作：${command}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
