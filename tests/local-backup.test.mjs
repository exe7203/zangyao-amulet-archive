import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertRestorableBackup,
  createVerifiedBackup,
  evaluateManagedProcess,
  inspectManagedProcess,
  resolveExplicitBackupDirectory,
  restoreVerifiedBackup,
  verifyBackupDirectory,
} from "../scripts/local-site.mjs";

async function temporaryWorkspace(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "taijuda-backup-test-"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

async function makeSource(root, name, files) {
  const source = path.join(root, name);
  await mkdir(source, { recursive: true });
  for (const [relativePath, contents] of Object.entries(files)) {
    const target = path.join(source, ...relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  return source;
}

function timedOutProcessQuery() {
  const error = new Error("process query timed out");
  error.code = "ETIMEDOUT";
  return { status: null, signal: "SIGTERM", error, stdout: "" };
}

test("Windows process-query timeouts keep a healthy recorded service fail-closed", async () => {
  const record = {
    pid: 24_964,
    startedAt: "2026-08-12T04:05:06.000Z",
  };
  const queries = [];
  let healthChecks = 0;

  const state = await evaluateManagedProcess(record, {
    platform: "win32",
    isProcessRunning: (pid) => pid === record.pid,
    runPowerShellQuery: (script, options) => {
      queries.push({ script, options });
      return timedOutProcessQuery();
    },
    healthCheck: async () => {
      healthChecks += 1;
      return true;
    },
  });

  assert.equal(queries.length, 2, "both Windows ownership queries should be attempted");
  assert.ok(queries.every(({ options }) => options.timeoutMs === 15_000));
  assert.equal(healthChecks, 1);
  assert.equal(state.ownership, "unknown");
  assert.equal(state.reason, "windows-process-query-unavailable");
  assert.equal(state.healthy, true);
  assert.equal(state.safeToTerminate, false, "health alone must not authorize taskkill");
  assert.equal(state.safeToDeleteRecord, false, "a timeout must not authorize deleting server.json");
});

test("Windows fallback verifies the recorded Node PID by executable and start time", () => {
  const startedAt = "2026-08-12T04:05:06.000Z";
  let queries = 0;
  const state = inspectManagedProcess({ pid: 24_964, startedAt }, {
    platform: "win32",
    isProcessRunning: () => true,
    runPowerShellQuery: () => {
      queries += 1;
      if (queries === 1) return timedOutProcessQuery();
      return {
        status: 0,
        signal: null,
        stdout: JSON.stringify({ ExecutablePath: process.execPath, StartedAt: startedAt }),
      };
    },
  });

  assert.equal(queries, 2);
  assert.deepEqual(state, {
    ownership: "managed",
    reason: "executable-and-start-time",
  });
});

test("v2 backup records and verifies exact paths, sizes, and SHA-256 hashes", async (t) => {
  const root = await temporaryWorkspace(t);
  const source = await makeSource(root, "source", {
    "v3/d1/database.sqlite": "database-v1",
    "v3/d1/database.sqlite-wal": "wal-v1",
  });
  const backup = path.join(root, "backup-v2");

  await createVerifiedBackup(source, backup);
  const verification = await verifyBackupDirectory(backup);
  assert.equal(verification.restorable, true);
  assert.equal(verification.fileCount, 2);
  assert.deepEqual(verification.manifest.files.map((entry) => entry.path), [
    "v3/d1/database.sqlite",
    "v3/d1/database.sqlite-wal",
  ]);
  assert.equal(
    verification.manifest.files[0].sha256,
    createHash("sha256").update("database-v1").digest("hex"),
  );

  await writeFile(path.join(backup, "v3", "d1", "database.sqlite"), "tampered-v1");
  await assert.rejects(() => verifyBackupDirectory(backup), /雜湊不符/);
});

test("verification rejects missing or extra files and manifest path traversal", async (t) => {
  const root = await temporaryWorkspace(t);
  const source = await makeSource(root, "source", { "data.sqlite": "safe" });
  const backup = path.join(root, "backup-v2");
  await createVerifiedBackup(source, backup);

  await writeFile(path.join(backup, "unexpected.txt"), "extra");
  await assert.rejects(() => verifyBackupDirectory(backup), /檔案集合不符/);
  await rm(path.join(backup, "unexpected.txt"));

  await rm(path.join(backup, "data.sqlite"));
  await assert.rejects(() => verifyBackupDirectory(backup), /檔案集合不符/);
  await writeFile(path.join(backup, "data.sqlite"), "safe");

  const manifestPath = path.join(backup, "backup-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.files[0].path = "../outside.sqlite";
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(() => verifyBackupDirectory(backup), /路徑穿越|不安全/);
});

test("legacy v1 backup gets a read-only safety result but cannot be restored", async (t) => {
  const root = await temporaryWorkspace(t);
  const legacy = await makeSource(root, "legacy", { "v3/d1/old.sqlite": "legacy" });
  await writeFile(path.join(legacy, "backup-manifest.json"), JSON.stringify({
    format: "taijuda-local-data-backup-v1",
    createdAt: "2026-08-12T00:00:00.000Z",
    source: ".local-data",
    siteCode: "taijuda",
  }));

  const verification = await verifyBackupDirectory(legacy);
  assert.equal(verification.kind, "legacy");
  assert.equal(verification.restorable, false);
  assert.throws(() => assertRestorableBackup(verification), /舊版 v1.*不能直接還原/);
});

test("an empty source cannot become a restorable backup", async (t) => {
  const root = await temporaryWorkspace(t);
  const source = path.join(root, "empty-source");
  await mkdir(source);
  await assert.rejects(
    () => createVerifiedBackup(source, path.join(root, "empty-backup")),
    /沒有任何檔案/,
  );
});

test("backup creation rejects symbolic links instead of following them", async (t) => {
  const root = await temporaryWorkspace(t);
  const source = await makeSource(root, "source", { "real.sqlite": "real" });
  const outside = await makeSource(root, "outside", { "outside.sqlite": "outside" });
  try {
    await symlink(outside, path.join(source, "linked-directory"), process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (error?.code === "EPERM" || error?.code === "EACCES") {
      t.skip("This Windows account cannot create a test symlink.");
      return;
    }
    throw error;
  }

  await assert.rejects(
    () => createVerifiedBackup(source, path.join(root, "backup-v2")),
    /符號連結|接合點/,
  );
});

test("explicit backup selection rejects broad, traversing, and glob paths", async (t) => {
  const root = await temporaryWorkspace(t);
  const project = path.join(root, "project");
  const fakeHome = path.join(root, "home");
  const backup = path.join(root, "one-backup");
  await Promise.all([
    mkdir(project),
    mkdir(fakeHome),
    mkdir(backup),
  ]);
  const options = {
    baseDirectory: root,
    protectedProjectRoot: project,
    protectedHome: fakeHome,
  };

  assert.equal(await resolveExplicitBackupDirectory(backup, options), backup);
  await assert.rejects(() => resolveExplicitBackupDirectory(project, options), /不能把/);
  await assert.rejects(() => resolveExplicitBackupDirectory("one-*", options), /萬用字元/);
  await assert.rejects(() => resolveExplicitBackupDirectory("folder/../one-backup", options), /路徑穿越/);
});

test("temporary-directory restore preserves a verified pre-restore backup", async (t) => {
  const root = await temporaryWorkspace(t);
  const newSource = await makeSource(root, "new-source", {
    "v3/d1/database.sqlite": "new-database",
    "v3/d1/database.sqlite-wal": "new-wal",
  });
  const backup = path.join(root, "incoming-backup");
  await createVerifiedBackup(newSource, backup);
  const target = await makeSource(root, ".local-data", { "old.sqlite": "old-database" });
  const backupStorage = path.join(root, "safety-backups");

  const result = await restoreVerifiedBackup({
    backupDirectory: backup,
    targetDataDirectory: target,
    backupStorageDirectory: backupStorage,
  });

  assert.equal(await readFile(path.join(target, "v3", "d1", "database.sqlite"), "utf8"), "new-database");
  await assert.rejects(() => readFile(path.join(target, "old.sqlite")), /ENOENT/);
  assert.ok(result.preRestoreBackup);
  assert.equal(await readFile(path.join(result.preRestoreBackup, "old.sqlite"), "utf8"), "old-database");
  assert.equal((await verifyBackupDirectory(result.preRestoreBackup)).restorable, true);
});

test("failed temporary-directory restore rolls the original data back", async (t) => {
  const root = await temporaryWorkspace(t);
  const newSource = await makeSource(root, "new-source", { "new.sqlite": "new" });
  const backup = path.join(root, "incoming-backup");
  await createVerifiedBackup(newSource, backup);
  const target = await makeSource(root, ".local-data", { "old.sqlite": "old" });
  const backupStorage = path.join(root, "safety-backups");

  await assert.rejects(() => restoreVerifiedBackup({
    backupDirectory: backup,
    targetDataDirectory: target,
    backupStorageDirectory: backupStorage,
    postInstallCheck: async () => {
      throw new Error("simulated post-install failure");
    },
  }), /simulated post-install failure/);

  assert.equal(await readFile(path.join(target, "old.sqlite"), "utf8"), "old");
  await assert.rejects(() => readFile(path.join(target, "new.sqlite")), /ENOENT/);
  const parentEntries = await readdir(root);
  assert.equal(parentEntries.some((name) => name.includes("restore-staging") || name.includes("restore-previous")), false);
  const safetyBackups = await readdir(backupStorage);
  assert.equal(safetyBackups.length, 1);
});
