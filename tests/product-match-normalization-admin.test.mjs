import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/202607160001_product_match_normalizations.sql";
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const routePath = "src/app/api/product-match-normalizations/route.ts";
const route = existsSync(routePath) ? readFileSync(routePath, "utf8") : "";
const pagePath = "src/app/[locale]/product-match-normalizations/page.tsx";
const page = existsSync(pagePath) ? readFileSync(pagePath, "utf8") : "";
const panelPath = "src/components/product-match-normalizations-panel.tsx";
const panel = existsSync(panelPath) ? readFileSync(panelPath, "utf8") : "";
const types = readFileSync("src/lib/types.ts", "utf8");
const shell = readFileSync("src/components/app-shell.tsx", "utf8");

test("product-match normalization migration stores one active alias source and seeds legacy rules", () => {
  assert.match(migration, /create table if not exists public\.product_match_normalizations/);
  assert.match(migration, /field text not null check \(field in \('brand', 'series', 'size', 'piece_count'\)\)/);
  assert.match(migration, /brand_scope text/);
  assert.match(migration, /uniq_active_product_match_normalizations/);
  assert.match(migration, /SWETY/);
  assert.match(migration, /SLIMCARE/);
  assert.match(migration, /GOLD SERIES/);
  assert.match(migration, /NBS/);
});

test("normalization admin is manager-only and rendered as master data", () => {
  assert.match(route, /requireAdminSession/);
  assert.match(route, /product_match_normalizations/);
  assert.match(route, /intent === "deactivate"/);
  assert.match(route, /editing_rule_id/);
  assert.match(route, /piece_count rules cannot remap a bare integer/);
  assert.match(page, /ProductMatchNormalizationsPanel/);
  assert.match(panel, /canonical_value/);
  assert.match(panel, /brand_scope/);
  assert.match(panel, /editingRule/);
  assert.match(panel, /intent" value="deactivate"/);
  assert.match(types, /ProductMatchNormalization/);
  assert.match(shell, /product-match-normalizations/);
});

test("normalization admin keeps validation failures in the editor and shows an alert", () => {
  assert.match(panel, /"use client"/);
  assert.match(panel, /fetch\("\/api\/product-match-normalizations"/);
  assert.match(panel, /event\.preventDefault\(\)/);
  assert.match(panel, /window\.alert/);
  assert.match(panel, /router\.refresh\(\)/);
});
