import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const page = readFileSync("src/app/[locale]/competitor-products/page.tsx", "utf8");
const table = readFileSync("src/components/competitor-products-table.tsx", "utf8");
const routePath = "src/app/api/competitor-products/import/route.ts";
const exportRoutePath = "src/app/api/competitor-products/export/route.ts";
const parserPath = "src/lib/competitor-product-excel-import.ts";
const migrationPath = "supabase/migrations/202606170001_competitor_product_code_import.sql";
const route = existsSync(routePath) ? readFileSync(routePath, "utf8") : "";
const exportRoute = existsSync(exportRoutePath) ? readFileSync(exportRoutePath, "utf8") : "";
const parser = existsSync(parserPath) ? readFileSync(parserPath, "utf8") : "";
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

test("competitor product master lists competitor SKU code and uses dedicated import entry", () => {
  assert.match(table, /competitor_sku_code/);
  assert.match(table, /competitorCode/);
  assert.match(table, /selectedProduct\.competitor_sku_code/);
  assert.match(page, /competitor-products\/import/);
  assert.doesNotMatch(page, /internal\/excel-price-import/);
});

test("competitor product master exports the import template columns next to Excel import", () => {
  assert.match(page, /\/api\/competitor-products\/export/);
  assert.match(page, /copy\.export/);
  assert.match(page, /copy\.excelImport/);
  for (const column of [
    "competitor_sku_code",
    "brand",
    "product_series",
    "product_name",
    "package_type",
    "size",
    "piece_count",
    "target_material_sku_code",
  ]) {
    assert.match(exportRoute, new RegExp(column));
  }
  assert.match(exportRoute, /sku_master\(material_sku_code\)/);
  assert.match(exportRoute, /Content-Disposition/);
  assert.match(exportRoute, /competitor-products-\$\{date\}\.csv/);
});

test("competitor product import parser supports code-based upsert template", () => {
  for (const field of [
    "competitor_sku_code",
    "brand",
    "product_series",
    "product_name",
    "package_type",
    "size",
    "piece_count",
    "target_material_sku_code",
  ]) {
    assert.match(parser, new RegExp(field));
  }
  assert.match(parser, /parseCompetitorProductExcel/);
  assert.match(parser, /piece_count must be a positive integer/);
  assert.match(readFileSync("src/components/competitor-product-import-workbench.tsx", "utf8"), /downloadTemplate/);
  assert.match(readFileSync("src/components/competitor-product-import-workbench.tsx", "utf8"), /competitor-product-master-template\.csv/);
});

test("competitor product import API upserts by existing competitor SKU code only", () => {
  assert.match(route, /parseCompetitorProductExcel/);
  assert.match(route, /intent !== "import"/);
  assert.match(route, /competitor_sku_code/);
  assert.match(route, /Competitor SKU code not found/);
  assert.match(route, /ensureSkuMasterFromMaterial/);
  assert.match(route, /match_method: "manual"/);
  assert.match(route, /skipped_manual_mappings/);
  assert.doesNotMatch(route, /price_snapshots/);
  assert.doesNotMatch(route, /offline_stores/);
});

test("competitor SKU code migration enforces uniqueness and generated codes", () => {
  assert.match(migration, /ux_competitor_products_competitor_sku_code/);
  assert.match(migration, /where competitor_sku_code is not null/);
  assert.match(migration, /assign_competitor_sku_code/);
  assert.match(migration, /before insert on public\.competitor_products/);
  assert.match(migration, /left\(clean_name, 2\)/);
  assert.match(migration, /left\(clean_name, 3\)/);
});
