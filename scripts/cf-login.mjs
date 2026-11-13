import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const wranglerCli = path.join(projectRoot, "node_modules", "wrangler", "wrangler-dist", "cli.js");

if (!existsSync(wranglerCli)) {
  console.error("找不到 wrangler，請先執行 npm install。");
  process.exit(1);
}

function runWrangler(args) {
  const result = spawnSync(process.execPath, [wranglerCli, ...args], {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("");
console.log("即將開啟瀏覽器，請登入 Cloudflare 並按 Allow。");
console.log("");

runWrangler(["login"]);
runWrangler(["whoami"]);
