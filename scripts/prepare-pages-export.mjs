import { access, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const outDir = path.resolve(projectRoot, "out");
const adminDir = path.resolve(outDir, "admin");

if (path.dirname(adminDir) !== outDir) {
  throw new Error("Refusing to remove a Pages path outside the generated out directory");
}

await access(outDir, constants.R_OK);
await rm(adminDir, { recursive: true, force: true });

console.log("Removed the write-enabled admin surface from the static GitHub Pages export");
