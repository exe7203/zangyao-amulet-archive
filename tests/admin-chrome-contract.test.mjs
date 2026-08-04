import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("all backoffice modules render the same global chrome and page action bar", async () => {
  const [chrome, dashboard, articles, commerce, site] = await Promise.all([
    source("app/admin/admin-chrome.tsx"),
    source("app/admin/admin-dashboard.tsx"),
    source("app/admin/admin-shell.tsx"),
    source("app/admin/store-manager.tsx"),
    source("app/admin/site/site-editor.tsx"),
  ]);

  assert.match(chrome, /data-admin-topbar/);
  assert.match(chrome, /data-admin-actionbar/);
  assert.match(dashboard, /<AdminTopbar active="dashboard"/);
  assert.match(articles, /<AdminTopbar[\s\S]*active="articles"/);
  assert.match(articles, /<AdminActionBar/);
  assert.match(commerce, /<AdminTopbar active=\{active\}/);
  assert.equal((commerce.match(/<AdminActionBar/g) || []).length, 2);
  assert.match(site, /<AdminTopbar active="site"/);
  assert.match(site, /<AdminActionBar/);
});

test("site builder removes Puck's duplicate publish action through the supported override", async () => {
  const site = await source("app/admin/site/site-editor.tsx");
  assert.match(site, /headerActions:\s*\(\)\s*=>\s*<><\/>/);
  assert.match(site, /overrides=\{puckOverrides\}/);
  assert.match(site, />發布頁面<\/AdminButton>/);
});

test("shared chrome keeps navigation visible and uses stable desktop dimensions", async () => {
  const css = await source("app/admin/admin-chrome.module.css");
  assert.match(css, /\.topbar\s*\{[\s\S]*?height:\s*72px/);
  assert.match(css, /\.actionbar\s*\{[\s\S]*?min-height:\s*64px/);
  assert.match(css, /\.control\s*\{[\s\S]*?min-height:\s*36px/);
  assert.doesNotMatch(css, /\.navigation\s*\{[^}]*display:\s*none/);
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*?\.control\s*\{\s*min-height:\s*44px/);
});
