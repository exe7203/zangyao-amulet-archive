import { access, copyFile, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const adminDir = path.resolve(projectRoot, "app", "admin");
const accountDir = path.resolve(projectRoot, "app", "account");
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
    return ![
      adminDir,
      accountDir,
    ].some((privateDir) => resolved === privateDir || resolved.startsWith(`${privateDir}${path.sep}`));
  });
  await writeFile(
    path.resolve(buildRoot, "app", "checkout-dialog.tsx"),
    `"use client";

type DemoCheckoutProps = {
  lines: unknown[];
  open: boolean;
  subtotal: number;
  testingMode?: boolean;
  initialProfile?: import("../shared/member-contract").DeviceCheckoutProfile | null;
  onClose(): void;
  onCompleted(
    order: CheckoutResult,
    profile: import("../shared/member-contract").DeviceCheckoutProfile,
    rememberProfile: boolean,
  ): void;
};

export type CheckoutResult = {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  currency?: "TWD";
  createdAt?: string;
  reservedUntil?: string | null;
};

export default function CheckoutDialog(props: DemoCheckoutProps) {
  void props;
  return null;
}
`,
    "utf8",
  );
  await writeFile(
    path.resolve(buildRoot, "app", "member", "device-storage.ts"),
    `import type { DeviceCheckoutProfile } from "../../shared/member-contract";

export const DEVICE_PROFILE_STORAGE_KEY = "taijuda:device-profile:disabled";
export function readDeviceProfile(_storage: unknown): DeviceCheckoutProfile | null { return null; }
export function saveDeviceProfile(_storage: unknown, _profile: unknown, _remember: boolean): false { return false; }
export function clearDeviceProfile(_storage: unknown): void {}
export function rememberDeviceOrder(_storage: unknown, _order: unknown, _now?: Date): false { return false; }
`,
    "utf8",
  );
  await copySourceDirectory("public");
  await copySourceDirectory("shared");
  await copySourceDirectory("lib");
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
