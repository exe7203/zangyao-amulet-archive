import { access, copyFile, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const adminDir = path.resolve(projectRoot, "app", "admin");
const buildRoot = path.resolve(projectRoot, ".pages-build-work");
const buildOut = path.resolve(buildRoot, "out");
const projectOut = path.resolve(projectRoot, "out");
const nextCli = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);

function assertDirectChild(target, expectedParent) {
  if (path.dirname(target) !== expectedParent || !target.startsWith(`${expectedParent}${path.sep}`)) {
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

async function copySourceDirectory(name, filter) {
  const source = path.resolve(projectRoot, name);
  if (!await exists(source)) return;
  await cp(source, path.resolve(buildRoot, name), { recursive: true, filter });
}

async function runNextBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextCli, "build"], {
      cwd: buildRoot,
      env: {
        ...process.env,
        STATIC_EXPORT: "1",
        NEXT_PUBLIC_STORE_MODE: "demo",
        PAGES_BASE_PATH: process.env.PAGES_BASE_PATH || "/zangyao-amulet-archive",
        NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ||
          "https://exe7203.github.io/zangyao-amulet-archive/",
      },
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

assertDirectChild(buildRoot, projectRoot);
assertDirectChild(projectOut, projectRoot);

await rm(buildRoot, { recursive: true, force: true });
await mkdir(buildRoot, { recursive: true });

let buildSucceeded = false;
try {
  await copySourceDirectory("app", (source) => {
    const resolved = path.resolve(source);
    return resolved !== adminDir && !resolved.startsWith(`${adminDir}${path.sep}`);
  });
  await writeFile(
    path.resolve(buildRoot, "app", "checkout-dialog.tsx"),
    `"use client";

type DemoCheckoutProps = {
  lines: unknown[];
  open: boolean;
  subtotal: number;
  onClose(): void;
  onCompleted(order: { id: string; orderNumber: string; status: string; total: number }): void;
};

export default function CheckoutDialog(props: DemoCheckoutProps) {
  void props;
  return null;
}
`,
    "utf8",
  );
  await copySourceDirectory("public");
  await copySourceDirectory("shared");
  await copySourceDirectory("content");

  for (const name of ["package.json", "next.config.ts", "postcss.config.mjs", "tsconfig.json"]) {
    await copyFile(path.resolve(projectRoot, name), path.resolve(buildRoot, name));
  }

  await runNextBuild();
  await rm(projectOut, { recursive: true, force: true });
  await cp(buildOut, projectOut, { recursive: true });
  buildSucceeded = true;
} finally {
  await rm(buildRoot, { recursive: true, force: true });
}

if (buildSucceeded) {
  await import("./prepare-pages-export.mjs");
}
