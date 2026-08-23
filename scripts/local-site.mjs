import { closeSync, createReadStream, existsSync, openSync } from "node:fs";
import {
  appendFile,
  copyFile,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtimeDir = path.join(projectRoot, ".local-runtime");
const dataDir = path.join(projectRoot, ".local-data");
const backupsDir = path.join(projectRoot, ".local-backups");
const legacyDataDir = path.join(projectRoot, ".wrangler", "state");
const pidFile = path.join(runtimeDir, "server.json");
const stdoutLog = path.join(runtimeDir, "server.stdout.log");
const stderrLog = path.join(runtimeDir, "server.stderr.log");
const buildLog = path.join(runtimeDir, "build.log");
const adminUsersFile = path.join(runtimeDir, "admin-users.json");
const vinextCli = path.join(projectRoot, "node_modules", "vinext", "dist", "cli.js");
// Launch Wrangler's real CLI directly. The small bin wrapper starts a second
// detached Node process that can stall before Workerd is spawned on Windows.
const wranglerCli = path.join(projectRoot, "node_modules", "wrangler", "wrangler-dist", "cli.js");
const workerEntry = path.join(projectRoot, "dist", "server", "index.js");
const wranglerConfig = path.join(projectRoot, "dist", "server", "wrangler.json");
const clientOutput = path.join(projectRoot, "dist", "client");
const host = "127.0.0.1";
const port = 3000;
const siteUrl = `http://${host}:${port}/`;
const adminUrl = `${siteUrl}admin/`;
const articleAdminUrl = `${siteUrl}admin/articles/`;
const productAdminUrl = `${siteUrl}admin/products/`;
const orderAdminUrl = `${siteUrl}admin/orders/`;
const siteAdminUrl = `${siteUrl}admin/site/`;
const healthUrl = `${siteUrl}api/health`;

const sourceTargets = [
  "app",
  "build",
  "content",
  "db",
  "drizzle",
  "lib",
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

const DEFAULT_LOCAL_ADMIN_USERS = [
  { username: "exe7203", password: "12345678" },
  { username: "F0524007", password: "12345678" },
];

function hashAdminPassword(username, password, secret) {
  return createHmac("sha256", secret).update(`${username}\n${password}`).digest("hex");
}

async function ensureLocalAdminAuth() {
  await mkdir(runtimeDir, { recursive: true });
  let config = {
    sessionSecret: randomBytes(24).toString("base64url"),
    users: DEFAULT_LOCAL_ADMIN_USERS,
  };

  if (existsSync(adminUsersFile)) {
    try {
      const parsed = JSON.parse(await readFile(adminUsersFile, "utf8"));
      if (typeof parsed?.sessionSecret === "string" && parsed.sessionSecret.trim().length >= 16) {
        config.sessionSecret = parsed.sessionSecret.trim();
      }
      if (Array.isArray(parsed?.users) && parsed.users.length > 0) {
        config.users = parsed.users.flatMap((entry) => {
          const username = typeof entry?.username === "string" ? entry.username.trim() : "";
          const password = typeof entry?.password === "string" ? entry.password : "";
          return username && password ? [{ username, password }] : [];
        });
      }
    } catch {
      // Keep defaults when the local file is unreadable.
    }
  }

  if (config.users.length === 0) config.users = DEFAULT_LOCAL_ADMIN_USERS;

  await writeFile(adminUsersFile, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });

  const accounts = config.users.map(({ username, password }) => ({
    username,
    passwordHash: hashAdminPassword(username, password, config.sessionSecret),
  }));

  return {
    sessionSecret: config.sessionSecret,
    accountsJson: JSON.stringify(accounts),
  };
}
const normalizePath = (value) => String(value || "").replaceAll("/", "\\").toLowerCase();
const backupManifestName = "backup-manifest.json";
const backupFormatV1 = "taijuda-local-data-backup-v1";
const backupFormatV2 = "taijuda-local-data-backup-v2";

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isPathInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return Boolean(relative) && relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function assertCanonicalRealPath(candidate, label) {
  const resolved = path.resolve(candidate);
  const canonical = await realpath(resolved);
  if (normalizePath(canonical) !== normalizePath(resolved)) {
    throw new Error(`${label} 不能經過符號連結、接合點或其他重新導向路徑：${resolved}`);
  }
}

function assertSafeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 1_024) {
    throw new Error("備份清單包含無效的相對路徑。");
  }
  if (value.includes("\\") || value.includes("\0") || path.posix.isAbsolute(value)) {
    throw new Error(`備份清單包含不安全的路徑：${value}`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes(":"))) {
    throw new Error(`備份清單包含路徑穿越或不合法路徑：${value}`);
  }
  if (path.posix.normalize(value) !== value || value.toLowerCase() === backupManifestName) {
    throw new Error(`備份清單包含不安全的路徑：${value}`);
  }
  return value;
}

function resolveManifestFile(root, relativePath) {
  const safePath = assertSafeRelativePath(relativePath);
  const resolved = path.resolve(root, ...safePath.split("/"));
  if (!isPathInside(root, resolved)) {
    throw new Error(`備份清單路徑超出資料夾範圍：${relativePath}`);
  }
  return resolved;
}

async function hashFile(filePath) {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function listRegularFilesStrict(root, { excludeRootManifest = false } = {}) {
  await assertCanonicalRealPath(root, "資料來源");
  const rootDetails = await lstat(root);
  if (rootDetails.isSymbolicLink() || !rootDetails.isDirectory()) {
    throw new Error(`資料來源必須是實體資料夾，不能是連結：${root}`);
  }

  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const details = await lstat(absolutePath);
      if (details.isSymbolicLink()) {
        throw new Error(`資料夾內含符號連結或接合點，已拒絕處理：${absolutePath}`);
      }
      if (details.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!details.isFile()) {
        throw new Error(`資料夾內含不支援的特殊檔案，已拒絕處理：${absolutePath}`);
      }
      const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
      if (excludeRootManifest && relativePath.toLowerCase() === backupManifestName) continue;
      assertSafeRelativePath(relativePath);
      files.push({
        absolutePath,
        path: relativePath,
        size: details.size,
      });
    }
  }

  await visit(root);
  files.sort((left, right) => compareText(left.path, right.path));
  return files;
}

async function verifyFilesAgainstManifest(root, manifestFiles, { excludeRootManifest = false } = {}) {
  const actualFiles = await listRegularFilesStrict(root, { excludeRootManifest });
  if (actualFiles.length !== manifestFiles.length) {
    throw new Error(`備份檔案集合不符：清單 ${manifestFiles.length} 個，實際 ${actualFiles.length} 個。`);
  }

  for (let index = 0; index < manifestFiles.length; index += 1) {
    const expected = manifestFiles[index];
    const actual = actualFiles[index];
    if (actual.path !== expected.path) {
      throw new Error(`備份檔案集合不符：預期 ${expected.path}，實際 ${actual.path}。`);
    }
    if (actual.size !== expected.size) {
      throw new Error(`備份檔案大小不符：${expected.path}`);
    }
    const digest = await hashFile(actual.absolutePath);
    if (digest !== expected.sha256) {
      throw new Error(`備份檔案雜湊不符：${expected.path}`);
    }
  }
}

function validateManifestHeader(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("backup-manifest.json 格式無效。");
  }
  if (manifest.siteCode !== "taijuda" || manifest.source !== ".local-data") {
    throw new Error("這不是泰聚達本機資料的備份清單。");
  }
  const createdAt = typeof manifest.createdAt === "string" ? new Date(manifest.createdAt) : null;
  if (!createdAt || !Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== manifest.createdAt) {
    throw new Error("備份清單缺少有效的建立時間。");
  }
}

function validateManifestFiles(files) {
  if (!Array.isArray(files)) throw new Error("v2 備份清單缺少 files 陣列。");
  if (files.length === 0) throw new Error("v2 備份清單沒有任何資料檔案，不能作為可還原備份。");
  const paths = new Set();
  const normalized = files.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("v2 備份清單含有無效檔案項目。");
    }
    const relativePath = assertSafeRelativePath(entry.path);
    const identity = relativePath.toLowerCase();
    if (paths.has(identity)) throw new Error(`v2 備份清單含有重複路徑：${relativePath}`);
    paths.add(identity);
    if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
      throw new Error(`v2 備份清單含有無效檔案大小：${relativePath}`);
    }
    if (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error(`v2 備份清單含有無效 SHA-256：${relativePath}`);
    }
    return { path: relativePath, size: entry.size, sha256: entry.sha256 };
  });
  const sorted = [...normalized].sort((left, right) => compareText(left.path, right.path));
  if (normalized.some((entry, index) => entry.path !== sorted[index].path)) {
    throw new Error("v2 備份清單的檔案路徑未依序排列。");
  }
  return normalized;
}

export async function verifyBackupDirectory(backupDirectory) {
  const resolvedDirectory = path.resolve(backupDirectory);
  const directoryDetails = await lstat(resolvedDirectory);
  if (directoryDetails.isSymbolicLink() || !directoryDetails.isDirectory()) {
    throw new Error("指定的備份必須是實體資料夾，不能是符號連結或接合點。");
  }

  const manifestPath = path.join(resolvedDirectory, backupManifestName);
  const manifestDetails = await lstat(manifestPath);
  if (manifestDetails.isSymbolicLink() || !manifestDetails.isFile()) {
    throw new Error("backup-manifest.json 必須是實體檔案。");
  }
  if (manifestDetails.size > 16 * 1024 * 1024) {
    throw new Error("backup-manifest.json 異常過大，已拒絕讀取。");
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    throw new Error("backup-manifest.json 不是有效的 JSON。");
  }
  validateManifestHeader(manifest);

  if (manifest.format === backupFormatV1) {
    const actualFiles = await listRegularFilesStrict(resolvedDirectory, { excludeRootManifest: true });
    return {
      kind: "legacy",
      restorable: false,
      format: backupFormatV1,
      directory: resolvedDirectory,
      createdAt: manifest.createdAt,
      fileCount: actualFiles.length,
      totalBytes: actualFiles.reduce((total, file) => total + file.size, 0),
      manifest,
    };
  }

  if (manifest.format !== backupFormatV2) {
    throw new Error(`不支援的備份格式：${String(manifest.format || "(缺少格式)")}`);
  }
  if (manifest.purpose !== "manual" && manifest.purpose !== "pre-restore") {
    throw new Error("v2 備份清單的 purpose 必須是 manual 或 pre-restore。");
  }
  const manifestFiles = validateManifestFiles(manifest.files);
  await verifyFilesAgainstManifest(resolvedDirectory, manifestFiles, { excludeRootManifest: true });
  return {
    kind: "verified",
    restorable: true,
    format: backupFormatV2,
    directory: resolvedDirectory,
    createdAt: manifest.createdAt,
    fileCount: manifestFiles.length,
    totalBytes: manifestFiles.reduce((total, file) => total + file.size, 0),
    manifest: { ...manifest, files: manifestFiles },
  };
}

export function assertRestorableBackup(verification) {
  if (verification?.restorable && verification?.format === backupFormatV2) return verification;
  if (verification?.format === backupFormatV1) {
    throw new Error("這是舊版 v1 備份，沒有逐檔雜湊，不能直接還原。請先用舊資料啟動網站，再以目前版本重新備份。");
  }
  throw new Error("指定資料夾不是可還原的泰聚達 v2 備份。");
}

export async function createVerifiedBackup(sourceDirectory, destinationDirectory, { purpose = "manual" } = {}) {
  const source = path.resolve(sourceDirectory);
  const destination = path.resolve(destinationDirectory);
  if (!isPathInside(path.dirname(destination), destination) || source === destination || isPathInside(source, destination)) {
    throw new Error("備份目的地不安全或位於來源資料夾內。");
  }
  const sourceFiles = await listRegularFilesStrict(source);
  if (sourceFiles.length === 0) throw new Error("資料來源沒有任何檔案，未建立空白備份。");
  await mkdir(destination, { recursive: false });

  try {
    const files = [];
    for (const sourceFile of sourceFiles) {
      const targetFile = resolveManifestFile(destination, sourceFile.path);
      await mkdir(path.dirname(targetFile), { recursive: true });
      const beforeCopy = await lstat(sourceFile.absolutePath);
      if (beforeCopy.isSymbolicLink() || !beforeCopy.isFile()) {
        throw new Error(`來源檔案在備份期間發生變化：${sourceFile.path}`);
      }
      await copyFile(sourceFile.absolutePath, targetFile);
      const copiedDetails = await lstat(targetFile);
      files.push({
        path: sourceFile.path,
        size: copiedDetails.size,
        sha256: await hashFile(targetFile),
      });
    }

    const manifest = {
      format: backupFormatV2,
      createdAt: new Date().toISOString(),
      source: ".local-data",
      siteCode: "taijuda",
      purpose,
      files,
    };
    await writeFile(path.join(destination, backupManifestName), `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await verifyBackupDirectory(destination);
    return destination;
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}

export async function resolveExplicitBackupDirectory(rawPath, {
  baseDirectory = projectRoot,
  protectedProjectRoot = projectRoot,
  protectedHome = homedir(),
} = {}) {
  if (typeof rawPath !== "string" || !rawPath.trim()) {
    throw new Error("請指定一個確切的備份資料夾路徑。");
  }
  const input = rawPath.trim();
  if (/[\0*?\[\]{}]/.test(input) || input === "~" || input.startsWith("~\\") || input.startsWith("~/")) {
    throw new Error("備份路徑不能使用萬用字元、波浪號或模糊比對。");
  }
  if (input.split(/[\\/]+/).some((segment) => segment === "..")) {
    throw new Error("備份路徑不能包含 .. 路徑穿越。");
  }

  const resolved = path.resolve(baseDirectory, input);
  const protectedPaths = new Set([
    path.parse(resolved).root,
    path.resolve(protectedProjectRoot),
    path.resolve(protectedHome),
    path.resolve(backupsDir),
    path.resolve(dataDir),
  ].map(normalizePath));
  if (protectedPaths.has(normalizePath(resolved))) {
    throw new Error("不能把磁碟根目錄、使用者家目錄、專案根目錄或資料根目錄當成單一備份。");
  }
  const details = await lstat(resolved);
  if (details.isSymbolicLink() || !details.isDirectory()) {
    throw new Error("指定路徑必須是單一、實際存在且不是連結的備份資料夾。");
  }
  await assertCanonicalRealPath(resolved, "指定的備份資料夾");
  return resolved;
}

async function allocateBackupDestination(root, prefix, date = new Date()) {
  await mkdir(root, { recursive: true });
  const rootDetails = await lstat(root);
  if (rootDetails.isSymbolicLink() || !rootDetails.isDirectory()) {
    throw new Error("備份儲存位置必須是實體資料夾，不能是符號連結或接合點。");
  }
  await assertCanonicalRealPath(root, "備份儲存位置");
  const baseName = backupFolderName(date, prefix);
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const name = suffix === 0 ? baseName : `${baseName}-${suffix + 1}`;
    const candidate = path.resolve(root, name);
    if (!isPathInside(path.resolve(root), candidate)) throw new Error("備份目的地超出指定資料夾。");
    if (!existsSync(candidate)) return candidate;
  }
  throw new Error("無法配置唯一的備份資料夾，請稍後再試。");
}

async function copyVerifiedPayload(verification, destination) {
  await mkdir(destination, { recursive: false });
  try {
    for (const entry of verification.manifest.files) {
      const sourceFile = resolveManifestFile(verification.directory, entry.path);
      const targetFile = resolveManifestFile(destination, entry.path);
      const sourceDetails = await lstat(sourceFile);
      if (sourceDetails.isSymbolicLink() || !sourceDetails.isFile()) {
        throw new Error(`備份檔案在還原期間發生變化：${entry.path}`);
      }
      await mkdir(path.dirname(targetFile), { recursive: true });
      await copyFile(sourceFile, targetFile);
    }
    await verifyFilesAgainstManifest(destination, verification.manifest.files);
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}

export async function restoreVerifiedBackup({
  backupDirectory,
  targetDataDirectory,
  backupStorageDirectory,
  beforeCommitCheck,
  postInstallCheck,
}) {
  const verification = assertRestorableBackup(await verifyBackupDirectory(backupDirectory));
  const target = path.resolve(targetDataDirectory);
  const targetParent = path.dirname(target);
  const backupStorage = path.resolve(backupStorageDirectory);
  if (target === path.parse(target).root || target === targetParent) {
    throw new Error("還原目標不能是磁碟根目錄。");
  }
  if (target === verification.directory || isPathInside(target, verification.directory) ||
      isPathInside(verification.directory, target)) {
    throw new Error("備份來源不能位於還原目標內，也不能包含還原目標。");
  }
  if (target === backupStorage || isPathInside(target, backupStorage)) {
    throw new Error("預還原備份的儲存位置不能位於還原目標內。");
  }
  await mkdir(targetParent, { recursive: true });
  await mkdir(backupStorage, { recursive: true });
  const [targetParentDetails, backupStorageDetails] = await Promise.all([
    lstat(targetParent),
    lstat(backupStorage),
  ]);
  if (targetParentDetails.isSymbolicLink() || !targetParentDetails.isDirectory() ||
      backupStorageDetails.isSymbolicLink() || !backupStorageDetails.isDirectory()) {
    throw new Error("還原目標上層與備份儲存位置都必須是實體資料夾。");
  }
  await Promise.all([
    assertCanonicalRealPath(targetParent, "還原目標上層"),
    assertCanonicalRealPath(backupStorage, "備份儲存位置"),
  ]);

  let targetExists = existsSync(target);
  if (targetExists) {
    const targetDetails = await lstat(target);
    if (targetDetails.isSymbolicLink() || !targetDetails.isDirectory()) {
      throw new Error("既有本機資料路徑不是實體資料夾，已拒絕還原。");
    }
    await assertCanonicalRealPath(target, "既有本機資料路徑");
  }

  const token = randomBytes(8).toString("hex");
  const staging = path.join(targetParent, `.${path.basename(target)}-restore-staging-${token}`);
  const previous = path.join(targetParent, `.${path.basename(target)}-restore-previous-${token}`);
  if (!isPathInside(targetParent, staging) || !isPathInside(targetParent, previous)) {
    throw new Error("無法建立安全的同磁碟暫存路徑。");
  }

  let preRestoreBackup = null;
  let movedCurrent = false;
  let installed = false;
  await copyVerifiedPayload(verification, staging);
  try {
    if (targetExists) {
      preRestoreBackup = await allocateBackupDestination(backupStorage, "taijuda-pre-restore");
      await createVerifiedBackup(target, preRestoreBackup, { purpose: "pre-restore" });
    }
    if (beforeCommitCheck) await beforeCommitCheck();
    if (targetExists) {
      await rename(target, previous);
      movedCurrent = true;
    }
    await rename(staging, target);
    installed = true;
    await verifyFilesAgainstManifest(target, verification.manifest.files);
    if (postInstallCheck) await postInstallCheck(target);
    if (preRestoreBackup) {
      assertRestorableBackup(await verifyBackupDirectory(preRestoreBackup));
    }
  } catch (error) {
    let rollbackError = null;
    try {
      if (installed && existsSync(target)) {
        if (existsSync(staging)) await rm(staging, { recursive: true, force: true });
        await rename(target, staging);
        installed = false;
      }
      if (movedCurrent && existsSync(previous)) {
        await rename(previous, target);
        movedCurrent = false;
      }
      if (existsSync(staging)) await rm(staging, { recursive: true, force: true });
    } catch (rollbackFailure) {
      rollbackError = rollbackFailure;
    }
    if (rollbackError) {
      throw new AggregateError([error, rollbackError], `還原失敗且自動回復未完整完成。請保留 ${previous}、${staging} 與預還原備份，不要再啟動網站。`);
    }
    throw error;
  }

  if (existsSync(previous)) {
    try {
      await rm(previous, { recursive: true, force: true });
    } catch {
      console.warn(`還原已完成，但舊資料暫存尚未刪除：${previous}`);
    }
  }
  return {
    target,
    preRestoreBackup,
    fileCount: verification.fileCount,
    totalBytes: verification.totalBytes,
  };
}

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

const managedProcessOwnership = Object.freeze({
  managed: "managed",
  stopped: "stopped",
  foreign: "foreign",
  unknown: "unknown",
});

function runPowerShellProcessQuery(script, { timeoutMs }) {
  return spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
    timeout: timeoutMs,
  });
}

function queryDidTimeOut(result) {
  return result?.error?.code === "ETIMEDOUT" || (result?.status === null && Boolean(result?.signal));
}

function processQueryOutcome(result, matches) {
  if (result?.status === 3) return managedProcessOwnership.stopped;
  if (result?.status !== 0 || queryDidTimeOut(result)) return managedProcessOwnership.unknown;
  try {
    return matches(JSON.parse(result.stdout))
      ? managedProcessOwnership.managed
      : managedProcessOwnership.foreign;
  } catch {
    return managedProcessOwnership.unknown;
  }
}

/**
 * Verifies that a PID still belongs to the exact Wrangler process launched by
 * this script. `unknown` is intentionally distinct from `stopped`: slow or
 * unavailable Windows process inspection must never authorize PID cleanup or
 * taskkill.
 */
export function inspectManagedProcess(record, {
  platform = process.platform,
  isProcessRunning = processIsRunning,
  runPowerShellQuery = runPowerShellProcessQuery,
  queryTimeoutMs = 15_000,
} = {}) {
  if (!record || !isProcessRunning(record.pid)) {
    return { ownership: managedProcessOwnership.stopped, reason: "pid-not-running" };
  }
  if (platform !== "win32") {
    return { ownership: managedProcessOwnership.managed, reason: "posix-live-pid" };
  }

  const commandLineScript = [
    "$process = Get-CimInstance Win32_Process -Filter \"ProcessId = " + record.pid + "\" -ErrorAction SilentlyContinue",
    "if ($null -eq $process) { exit 3 }",
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "[pscustomobject]@{ ExecutablePath = $process.ExecutablePath; CommandLine = $process.CommandLine } | ConvertTo-Json -Compress",
  ].join("; ");
  const commandLineResult = runPowerShellQuery(commandLineScript, { timeoutMs: queryTimeoutMs });
  const commandLineOutcome = processQueryOutcome(commandLineResult, (info) => {
    const commandLine = normalizePath(info.CommandLine);
    return normalizePath(info.ExecutablePath) === normalizePath(process.execPath) &&
      commandLine.includes(normalizePath(wranglerCli)) &&
      commandLine.includes(normalizePath(wranglerConfig));
  });
  if (commandLineOutcome !== managedProcessOwnership.unknown) {
    return { ownership: commandLineOutcome, reason: "command-line" };
  }

  const startTimeScript = [
    "$process = Get-Process -Id " + record.pid + " -ErrorAction SilentlyContinue",
    "if ($null -eq $process) { exit 3 }",
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "[pscustomobject]@{ ExecutablePath = $process.Path; StartedAt = $process.StartTime.ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress",
  ].join("; ");
  const startTimeResult = runPowerShellQuery(startTimeScript, { timeoutMs: queryTimeoutMs });
  const startTimeOutcome = processQueryOutcome(startTimeResult, (info) => {
    const expectedStart = Date.parse(record.startedAt);
    const actualStart = Date.parse(info.StartedAt);
    return normalizePath(info.ExecutablePath) === normalizePath(process.execPath) &&
      Number.isFinite(expectedStart) && Number.isFinite(actualStart) &&
      Math.abs(actualStart - expectedStart) < 15_000;
  });
  return {
    ownership: startTimeOutcome,
    reason: startTimeOutcome === managedProcessOwnership.unknown
      ? "windows-process-query-unavailable"
      : "executable-and-start-time",
  };
}

/**
 * Combines ownership evidence with the application health probe. Health proves
 * that a Taijuda service answers on the expected port, but does not prove which
 * PID owns it. Destructive actions therefore require verified ownership even
 * when health is good, and stale-record cleanup additionally requires an
 * unhealthy endpoint.
 */
export async function evaluateManagedProcess(record, {
  healthCheck = checkHealth,
  ...inspectionOptions
} = {}) {
  const inspection = inspectManagedProcess(record, inspectionOptions);
  const healthy = await healthCheck();
  return {
    ...inspection,
    healthy,
    safeToTerminate: inspection.ownership === managedProcessOwnership.managed,
    safeToDeleteRecord: inspection.ownership === managedProcessOwnership.stopped && !healthy,
  };
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
    return body?.ok === true && body?.site === "taijuda";
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
      worker.includes("/api/admin/system-status") &&
      worker.includes("/api/content/articles") &&
      worker.includes("/api/admin/products") &&
      worker.includes("/api/store/orders") &&
      worker.includes("/api/admin/pages") &&
      worker.includes("/api/admin/site-export");
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

async function stopProcessTree(record, inspection = inspectManagedProcess(record)) {
  // Never pass an unverified PID to taskkill/process.kill. A timeout while
  // reading process metadata is not evidence that the recorded process ended.
  if (inspection.ownership !== managedProcessOwnership.managed) return false;

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

async function startSite(openBrowser = true) {
  await mkdir(runtimeDir, { recursive: true });
  await ensureDependencies();

  const current = await readPidRecord();
  const currentState = await evaluateManagedProcess(current);
  const managedHealthy = Boolean(current && currentState.safeToTerminate && currentState.healthy);
  if (managedHealthy) {
    const currentBuild = !await buildIsRequired() && await validateBuild();
    if (currentBuild) {
      console.log(`泰聚達本機版已經在運行：${siteUrl}`);
      console.log(`營運總覽：${adminUrl}`);
      console.log(`文章管理後台：${articleAdminUrl}`);
      console.log(`商品與庫存：${productAdminUrl}`);
      console.log(`訂單管理：${orderAdminUrl}`);
      console.log(`網站編輯器：${siteAdminUrl}`);
      if (openBrowser) openSiteInBrowser();
      return;
    }
    console.log("偵測到網站程式已有更新，正在安全重啟本機版……");
  }

  if (!managedHealthy && currentState.healthy) {
    console.log(`泰聚達本機版已經在運行：${siteUrl}`);
    console.log(currentState.ownership === managedProcessOwnership.unknown
      ? "網站健康，但 Windows 暫時無法驗證啟動程序；已保留啟動紀錄，不會誤停其他程式。"
      : "目前的網站不是由本啟動器開啟，因此停止器不會結束它。");
    if (openBrowser) openSiteInBrowser();
    return;
  }

  if (current) {
    if (currentState.safeToTerminate) {
      if (!await stopProcessTree(current, currentState)) {
        throw new Error("舊的泰聚達本機程序無法安全停止，請稍後再試。");
      }
      await rm(pidFile, { force: true });
    } else if (currentState.safeToDeleteRecord) {
      await rm(pidFile, { force: true });
    } else {
      throw new Error("無法安全確認既有啟動程序的身分；已保留啟動紀錄，未停止任何程序。請稍後再試。");
    }
    await wait(1_250);
  }
  await buildLocal();
  await migrateLegacyData();
  const adminAuth = await ensureLocalAdminAuth();
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
      "--var", "ADMIN_LOCAL_AUTH_REQUIRED:1",
      "--var", `ADMIN_LOCAL_SESSION_SECRET:${adminAuth.sessionSecret}`,
      "--var", `ADMIN_LOCAL_ACCOUNTS:${adminAuth.accountsJson}`,
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
  // On Windows, Wrangler can spend more than a minute warming Workerd and the
  // persisted D1 database after a fresh build. Keep the launcher alive long
  // enough to distinguish a slow first start from a real startup failure.
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await checkHealth()) {
      // D1 schema upgrades can briefly restart the local Worker after the first
      // successful request. Give that one-time reload time to settle, then warm
      // the new isolate before opening the site.
      await wait(12_000);
      if (!await checkHealth()) continue;
      process.stdout.write("\n");
      console.log(`網站已啟動：${siteUrl}`);
      console.log(`營運總覽：${adminUrl}`);
      console.log(`文章管理後台：${articleAdminUrl}`);
      console.log(`商品與庫存：${productAdminUrl}`);
      console.log(`訂單管理：${orderAdminUrl}`);
      console.log(`網站編輯器：${siteAdminUrl}`);
      console.log("文章、商品、庫存與訂單資料會保存在本機專案的 .local-data 資料夾中。");
      console.log(`後台登入：${siteUrl}admin/login/`);
      console.log(`後台帳號設定：${adminUsersFile}`);
      if (openBrowser) openSiteInBrowser();
      return;
    }
    // This PID came directly from the child spawned above. During its initial
    // warm-up, a liveness check is enough and avoids launching PowerShell on
    // every 750 ms poll.
    if (!processIsRunning(record.pid)) break;
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
  const currentState = await evaluateManagedProcess(current);
  if (currentState.safeToDeleteRecord) {
    await rm(pidFile, { force: true });
    console.log("本機版目前未運行；已清除過期的啟動紀錄，沒有結束其他程式。");
    return;
  }
  if (!currentState.safeToTerminate) {
    if (currentState.healthy) {
      throw new Error("泰聚達網站健康，但 Windows 暫時無法確認記錄中的程序身分；已保留啟動紀錄，未停止任何程序。請稍後再試。");
    }
    throw new Error("無法安全確認記錄中的程序已停止或仍屬於本站；已保留啟動紀錄，未停止任何程序。請稍後再試。");
  }

  if (!await stopProcessTree(current, currentState)) {
    throw new Error("網站仍在運行，停止紀錄已保留；請稍後再試。");
  }
  await rm(pidFile, { force: true });
  console.log("泰聚達本機版已停止；文章與設定資料仍保留在電腦中。");
}

function backupFolderName(date = new Date(), prefix = "taijuda-data") {
  const pad = (value) => String(value).padStart(2, "0");
  return `${prefix}-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

async function backupLocalData() {
  await mkdir(backupsDir, { recursive: true });
  const current = await readPidRecord();
  const currentState = await evaluateManagedProcess(current);
  const managedRunning = Boolean(current && currentState.safeToTerminate);
  const healthy = currentState.healthy;
  const portBusy = await portIsInUse();

  if (current && !managedRunning && currentState.ownership !== managedProcessOwnership.stopped) {
    throw new Error("無法安全確認啟動紀錄中的程序身分；未停止程序、未備份資料，請稍後再試。");
  }
  if ((healthy || portBusy) && !managedRunning) {
    throw new Error("網站正在運行，但不是由本啟動器開啟。請先安全停止該網站，再執行備份。");
  }
  if (!existsSync(dataDir)) {
    throw new Error("目前還沒有本機營運資料可備份。請先啟動網站並建立資料。");
  }

  if (managedRunning) {
    console.log("正在暫停網站並確認資料已寫入……");
    if (!await stopProcessTree(current, currentState)) throw new Error("網站無法安全停止，已取消備份。");
    await rm(pidFile, { force: true });
    await wait(1_000);
  }

  let backupError = null;
  try {
    if (managedRunning && await portIsInUse()) {
      throw new Error("網站連接埠尚未完全停止，已取消備份。");
    }
    const destination = await allocateBackupDestination(backupsDir, "taijuda-data");
    await createVerifiedBackup(dataDir, destination, { purpose: "manual" });
    console.log(`備份已完成：${destination}`);
    console.log("已建立 v2 清單並逐檔驗證 SHA-256、大小與檔案集合。");
    console.log("請定期把 .local-backups 複製到另一顆硬碟或可信任的雲端空間。");
  } catch (error) {
    backupError = error;
  } finally {
    if (managedRunning) {
      console.log("正在重新啟動泰聚達本機版……");
      await startSite(false);
    }
  }

  if (backupError) throw backupError;
}

async function portIsInUse() {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1_500);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function assertLocalServiceStopped() {
  const current = await readPidRecord();
  const currentState = await evaluateManagedProcess(current);
  if (current && currentState.ownership !== managedProcessOwnership.stopped) {
    throw new Error("泰聚達本機程序仍在運行或無法安全確認。請先執行 npm run local:stop，確認停止後再還原。");
  }
  if (await portIsInUse()) {
    throw new Error(`連接埠 ${port} 仍有程式運行。為避免資料損壞，已拒絕還原。請先停止網站與占用該連接埠的程式。`);
  }
}

function readSingleBackupArgument(commandName) {
  const rawArguments = process.argv.slice(3);
  const args = rawArguments[0] === "--" ? rawArguments.slice(1) : rawArguments;
  if (args.length !== 1) {
    throw new Error(`${commandName} 必須且只能指定一個確切的備份資料夾。`);
  }
  return args[0];
}

async function verifyBackupFromCommand(rawPath) {
  const backupDirectory = await resolveExplicitBackupDirectory(rawPath);
  const result = await verifyBackupDirectory(backupDirectory);
  if (result.kind === "legacy") {
    console.log(`舊版 v1 備份的基本格式與檔案安全檢查已通過：${result.directory}`);
    console.log(`檔案數：${result.fileCount}；總大小：${result.totalBytes} bytes。`);
    console.log("此舊版沒有逐檔 SHA-256，因此不能直接還原。請先用舊資料啟動網站，再以目前版本重新備份成 v2。");
    return result;
  }
  console.log(`備份驗證通過：${result.directory}`);
  console.log(`格式：v2；檔案數：${result.fileCount}；總大小：${result.totalBytes} bytes。`);
  console.log("檔案集合、逐檔大小與 SHA-256 均一致；本次驗證沒有修改備份或本機資料。");
  return result;
}

async function restoreLocalData(rawPath) {
  const backupDirectory = await resolveExplicitBackupDirectory(rawPath);
  const verification = assertRestorableBackup(await verifyBackupDirectory(backupDirectory));
  await assertLocalServiceStopped();
  if (path.resolve(dataDir) !== path.join(projectRoot, ".local-data")) {
    throw new Error("本機資料目標與專案固定路徑不符，已拒絕還原。");
  }

  console.log(`準備從已驗證的 v2 備份還原：${verification.directory}`);
  console.log("網站已確認停止；還原程式只會寫入本專案的 .local-data。");
  const result = await restoreVerifiedBackup({
    backupDirectory,
    targetDataDirectory: dataDir,
    backupStorageDirectory: backupsDir,
    beforeCommitCheck: assertLocalServiceStopped,
  });
  console.log(`檔案層級還原與雜湊複查已完成：${result.fileCount} 個檔案。`);
  if (result.preRestoreBackup) {
    console.log(`原有資料已先完整備份，可供回復：${result.preRestoreBackup}`);
  } else {
    console.log("還原前沒有既有 .local-data，因此未建立預還原備份。");
  }
  console.log("尚未宣告網站健康，也沒有自動啟動網站。請執行 npm run local:start，讓系統完成資料庫 migration 與 health 驗證。");
}

async function showStatus() {
  const current = await readPidRecord();
  const currentState = await evaluateManagedProcess(current);
  if (currentState.healthy) {
    console.log(`運行中：${siteUrl}`);
    console.log(`營運總覽：${adminUrl}`);
    console.log(`文章管理後台：${articleAdminUrl}`);
    console.log(`商品與庫存：${productAdminUrl}`);
    console.log(`訂單管理：${orderAdminUrl}`);
    console.log(`網站編輯器：${siteAdminUrl}`);
    if (currentState.ownership === managedProcessOwnership.managed) {
      console.log(`本機程序編號：${current.pid}`);
    } else if (currentState.ownership === managedProcessOwnership.unknown) {
      console.log("網站健康；Windows 程序查詢暫時無回應，啟動紀錄已保留。");
    } else {
      console.log("網站正在運行，但不是由本啟動器開啟。");
    }
    return;
  }

  if (current && !currentState.safeToDeleteRecord) {
    console.log("網站健康檢查目前無回應，且程序身分無法安全確認；啟動紀錄已保留，未停止任何程序。");
    return;
  }
  console.log("目前未運行。請雙擊「啟動泰聚達本機版.cmd」。");
  if (currentState.safeToDeleteRecord) await rm(pidFile, { force: true });
}

async function main() {
  const command = process.argv[2] || "status";
  try {
    if (command === "build") {
      await buildLocal(true);
      console.log("泰聚達本機版已完成更新。");
    } else if (command === "start") await startSite();
    else if (command === "stop") await stopSite();
    else if (command === "status") await showStatus();
    else if (command === "backup") await backupLocalData();
    else if (command === "backup:verify") {
      await verifyBackupFromCommand(readSingleBackupArgument("backup:verify"));
    } else if (command === "restore") {
      await restoreLocalData(readSingleBackupArgument("restore"));
    } else throw new Error(`不支援的操作：${command}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const invokedAsScript = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedAsScript) await main();
