import { access, mkdir, rename, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const adminDir = path.resolve(projectRoot, "app", "admin");
const excludedRoot = path.resolve(projectRoot, ".pages-build-excluded");
const excludedAdminDir = path.resolve(excludedRoot, "admin");
const nextCli = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);

function assertInsideProject(target, expectedParent) {
  if (path.dirname(target) !== expectedParent || !target.startsWith(projectRoot)) {
    throw new Error(`Unsafe Pages build path: ${target}`);
  }
}

async function exists(target) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function runNextBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextCli, "build"], {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`Next build stopped by signal ${signal}`));
      else if (code !== 0) reject(new Error(`Next build exited with code ${code}`));
      else resolve();
    });
  });
}

assertInsideProject(adminDir, path.resolve(projectRoot, "app"));
assertInsideProject(excludedAdminDir, excludedRoot);

if (await exists(excludedAdminDir)) {
  if (await exists(adminDir)) {
    throw new Error("Both the live and excluded admin directories exist; refusing to guess which one to build");
  }
  await rename(excludedAdminDir, adminDir);
}

await mkdir(excludedRoot, { recursive: true });
await rename(adminDir, excludedAdminDir);

let buildSucceeded = false;
try {
  await runNextBuild();
  buildSucceeded = true;
} finally {
  if (await exists(excludedAdminDir)) {
    await rename(excludedAdminDir, adminDir);
  }
  await rm(excludedRoot, { recursive: true, force: true });
}

if (buildSucceeded) {
  await import("./prepare-pages-export.mjs");
}
