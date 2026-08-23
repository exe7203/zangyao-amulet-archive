import { cp, readdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const backupRoot = path.join(projectRoot, ".design-backup");
const name = process.argv[2];

if (!name) {
  console.log("用法：node scripts/restore-design-backup.mjs <備份資料夾名稱>");
  const entries = await readdir(backupRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.filter((item) => item.isDirectory())) {
    console.log(`  - ${entry.name}`);
  }
  process.exit(1);
}

const source = path.join(backupRoot, name);
await access(source);

const files = [
  ["app/globals.css", "app/globals.css"],
  ["app/storefront.tsx", "app/storefront.tsx"],
  ["app/public-chrome.module.css", "app/public-chrome.module.css"],
  ["app/public-footer.tsx", "app/public-footer.tsx"],
  ["shared/site-settings.ts", "shared/site-settings.ts"],
  ["content/published-site.json", "content/published-site.json"],
];

for (const [from, to] of files) {
  await cp(path.join(source, from), path.join(projectRoot, to), { force: true });
  console.log(`已還原 ${to}`);
}

console.log("");
console.log("請接著執行：");
console.log("  node scripts/local-site.mjs build");
console.log("  node scripts/local-site.mjs stop");
console.log("  node scripts/local-site.mjs start");
