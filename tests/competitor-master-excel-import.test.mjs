import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const competitorProductsPage = readFileSync("src/app/[locale]/competitor-products/page.tsx", "utf8");
const competitorProductsTable = readFileSync("src/components/competitor-products-table.tsx", "utf8");
const competitorsRoute = readFileSync("src/app/api/competitors/route.ts", "utf8");
const skuMatchesRoute = readFileSync("src/app/api/sku-matches/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/202606130001_competitor_master_excel_import.sql", "utf8");
const excelRoute = readFileSync("src/app/api/internal/excel-price-import/route.ts", "utf8");
const excelPage = readFileSync("src/app/[locale]/internal/excel-price-import/page.tsx", "utf8");
const excelParser = readFileSync("src/lib/offline-price-excel-import.ts", "utf8");

test("competitor product master is framed as product master data with editable master fields", () => {
  assert.match(competitorProductsPage, /竞品主数据|Competitor Product Master/);
  assert.match(competitorProductsPage, /Excel 导入|Excel Import/);
  assert.match(competitorProductsTable, /productType/);
  assert.match(competitorProductsTable, /packageType/);
  assert.match(competitorProductsTable, /piece_count/);
  assert.match(competitorProductsTable, /status/);
  assert.match(competitorProductsTable, /intent: "update_fields"/);
  assert.doesNotMatch(competitorProductsPage, /getMaterialMaster/);
  assert.doesNotMatch(competitorProductsTable, /ProductMasterSearchSelect/);
  assert.match(competitorsRoute, /body\.intent === "update_fields"/);
  assert.match(competitorsRoute, /buildCompetitorProductUpdate/);
  assert.match(competitorsRoute, /normalizePieceCount/);
});

test("competitor to Makuku mapping is saved as one current relation per competitor product", () => {
  assert.match(migration, /uniq_sku_matches_competitor_product/);
  assert.match(migration, /partition by competitor_product_id/);
  assert.match(skuMatchesRoute, /\.delete\(\)[\s\S]*\.eq\("competitor_product_id", competitorProductId\)/);
  assert.match(skuMatchesRoute, /cleared: true/);
  assert.doesNotMatch(skuMatchesRoute, /match_id/);
});

test("Excel price import has preview and import entrypoints without joining the main navigation", () => {
  assert.match(excelPage, /ExcelPriceImportWorkbench/);
  assert.match(excelPage, /competitor-products/);
  assert.match(excelRoute, /intent !== "import"/);
  assert.match(excelRoute, /parseOfflinePriceExcel/);
  assert.match(excelRoute, /price_snapshots/);
  assert.match(excelRoute, /offline_store_id/);
  assert.match(migration, /add column if not exists offline_store_id/);
});

test("offline price Excel parser recognizes the May field layout and expands weekly prices", () => {
  for (const header of ["AREA", "KOTA", "NAMA TOKO", "TYPE TOKO", "CATEGORY", "BRAND", "GPL 2", "NAMA PRODUCT MAKUKU", "SIZE", "PACK"]) {
    assert.match(excelParser, new RegExp(`"${header}"`));
  }
  for (const week of [1, 2, 3, 4]) {
    assert.match(excelParser, new RegExp(`PRICE/ PACK W\\$\\{week\\}|PRICE/ PACK W${week}`));
    assert.match(excelParser, new RegExp(`PRICE/PCS W\\$\\{week\\}|PRICE/PCS W${week}`));
  }
  assert.match(excelParser, /excel_import:\$\{fileMonth\}:W\$\{week\}/);
  assert.match(excelParser, /snapshot_count/);
});
