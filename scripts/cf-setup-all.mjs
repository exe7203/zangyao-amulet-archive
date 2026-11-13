import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const deployScript = path.join(projectRoot, "scripts", "deploy-cloudflare.mjs");
const wranglerCli = path.join(projectRoot, "node_modules", "wrangler", "wrangler-dist", "cli.js");

function runNode(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function assertAuthenticated() {
  if (process.env.CLOUDFLARE_API_TOKEN?.trim()) {
    console.log("使用 CLOUDFLARE_API_TOKEN 進行部署。");
    return;
  }
  const result = spawnSync(process.execPath, [wranglerCli, "whoami"], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (/not authenticated/i.test(output)) {
    console.error("");
    console.error("尚未登入 Cloudflare。");
    console.error("請先執行：npm run cf:login");
    console.error("或在系統環境變數設定 CLOUDFLARE_API_TOKEN 後再跑此指令。");
    process.exit(1);
  }
  console.log(output.trim());
}

console.log("=== 泰聚達 Cloudflare 一鍵部署 ===");
assertAuthenticated();
runNode(deployScript, ["bootstrap"]);
runNode(deployScript, ["migrate"]);
runNode(deployScript, ["seed"]);
runNode(deployScript, ["deploy"]);
console.log("");
console.log("全部完成。請開啟 .cloudflare/deploy.json 中的 siteUrl 驗證前台與 /admin/。");
