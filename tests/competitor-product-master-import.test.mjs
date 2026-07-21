import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const page = readFileSync("src/app/[locale]/competitor-products/page.tsx", "utf8");
const table = readFileSync("src/components/competitor-products-table.tsx", "utf8");
const routePath = "src/app/api/competitor-products/import/route.ts";
const exportRoutePath = "src/app/api/competitor-products/export/route.ts";
const parserPath = "src/lib/competitor-product-excel-import.ts";
const migrationPath = "supabase/migrations/202606170001_competitor_product_code_import.sql";
const ownBrandGuardMigrationPath = "supabase/migrations/202607200003_own_brand_competitor_guard.sql";
const route = existsSync(routePath) ? readFileSync(routePath, "utf8") : "";
const exportRoute = existsSync(exportRoutePath) ? readFileSync(exportRoutePath, "utf8") : "";
const parser = existsSync(parserPath) ? readFileSync(parserPath, "utf8") : "";
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const ownBrandGuardMigration = existsSync(ownBrandGuardMigrationPath) ? readFileSync(ownBrandGuardMigrationPath, "utf8") : "";

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
  ]) {
    assert.match(exportRoute, new RegExp(column));
  }
  assert.doesNotMatch(exportRoute, /target_material_sku_code/);
  assert.doesNotMatch(exportRoute, /sku_master\(material_sku_code\)/);
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
  ]) {
    assert.match(parser, new RegExp(field));
  }
  assert.doesNotMatch(parser, /target_material_sku_code/);
  assert.match(parser, /parseCompetitorProductExcel/);
  assert.match(parser, /piece_count must be a positive integer/);
  assert.match(readFileSync("src/components/competitor-product-import-workbench.tsx", "utf8"), /downloadTemplate/);
  assert.match(readFileSync("src/components/competitor-product-import-workbench.tsx", "utf8"), /competitor-product-master-template\.csv/);
});

test("competitor product import API replaces competitor master data without SKU-level mappings", () => {
  assert.match(route, /parseCompetitorProductExcel/);
  assert.match(route, /intent !== "import"/);
  assert.match(route, /competitor_sku_code/);
  assert.match(route, /replaceCompetitorMaster/);
  assert.match(route, /replace_competitor_product_master/);
  assert.doesNotMatch(route, /Competitor SKU code not found/);
  assert.doesNotMatch(route, /ensureSkuMasterFromMaterial/);
  assert.doesNotMatch(route, /match_method: "manual"/);
  assert.doesNotMatch(route, /skipped_manual_mappings/);
  assert.doesNotMatch(route, /price_snapshots/);
  assert.doesNotMatch(route, /offline_stores/);
});

test("competitor product import rejects all material-master own brands", () => {
  assert.match(route, /from\("material_master"\)\s*\.select\("brand"\)/);
  assert.match(route, /ownMaterialBrandKeys/);
  assert.match(route, /Own-brand rows cannot be imported as competitors/);
  assert.match(ownBrandGuardMigration, /update public\.brands[\s\S]*is_own_brand = true/);
  assert.match(ownBrandGuardMigration, /create trigger reject_own_brand_competitor_product/);
});

test("competitor SKU code migration enforces uniqueness and generated codes", () => {
  assert.match(migration, /ux_competitor_products_competitor_sku_code/);
  assert.match(migration, /where competitor_sku_code is not null/);
  assert.match(migration, /assign_competitor_sku_code/);
  assert.match(migration, /before insert on public\.competitor_products/);
  assert.match(migration, /left\(clean_name, 2\)/);
  assert.match(migration, /left\(clean_name, 3\)/);
});
