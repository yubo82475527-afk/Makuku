import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const competitorProductsPage = readFileSync("src/app/[locale]/competitor-products/page.tsx", "utf8");
const competitorProductsTable = readFileSync("src/components/competitor-products-table.tsx", "utf8");
const competitorsRoute = readFileSync("src/app/api/competitors/route.ts", "utf8");
const skuMatchesRoute = readFileSync("src/app/api/sku-matches/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/202606130001_competitor_master_excel_import.sql", "utf8");
const excelUpsertMigration = readFileSync("supabase/migrations/202606130002_excel_price_snapshot_upsert.sql", "utf8");
const excelRoute = readFileSync("src/app/api/internal/excel-price-import/route.ts", "utf8");
const excelPage = readFileSync("src/app/[locale]/internal/excel-price-import/page.tsx", "utf8");
const excelWorkbench = readFileSync("src/components/excel-price-import-workbench.tsx", "utf8");
const excelParser = readFileSync("src/lib/offline-price-excel-import.ts", "utf8");
const require = createRequire(import.meta.url);

test("competitor product master is framed as product master data with editable master fields", () => {
  assert.match(competitorProductsPage, /竞品主数据|Competitor Product Master/);
  assert.match(competitorProductsPage, /Excel 导入|Excel Import/);
  assert.match(competitorProductsPage, /const productBrandIds = new Set/);
  assert.match(competitorProductsPage, /looksLikeBrandSeries/);
  assert.match(competitorProductsPage, /brands=\{brandOptions\}/);
  assert.match(competitorProductsTable, /packageType/);
  assert.match(competitorProductsTable, /piece_count/);
  assert.match(competitorProductsTable, /status/);
  assert.match(competitorProductsTable, /openProduct/);
  assert.match(competitorProductsTable, /competitorCode/);
  assert.match(competitorProductsTable, /method: "PATCH"/);
  assert.match(competitorProductsTable, /brand_id/);
  assert.doesNotMatch(competitorProductsTable, /productType/);
  assert.doesNotMatch(competitorProductsTable, /competitorGrade/);
  assert.doesNotMatch(competitorProductsTable, /bulkGrade/);
  assert.doesNotMatch(competitorProductsTable, /applyBulkGrade/);
  assert.doesNotMatch(competitorProductsPage, /getMaterialMaster/);
  assert.doesNotMatch(competitorProductsTable, /ProductMasterSearchSelect/);
  assert.match(competitorsRoute, /if \("brand_id" in body\) update\.brand_id/);
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

test("offline price Excel parser skips empty weekly prices without blocking valid weeks", () => {
  const { parseOfflinePriceExcel } = loadExcelParser();
  const XLSX = require("xlsx");
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    [
      "AREA",
      "KOTA",
      "NAMA TOKO",
      "TYPE TOKO",
      "CATEGORY",
      "BRAND",
      "GPL 2",
      "NAMA PRODUCT MAKUKU",
      "SIZE",
      "PACK",
      "PRICE/ PACK W1",
      "PRICE/PCS W1",
      "PRICE/ PACK W2",
      "PRICE/PCS W2",
      "PRICE/ PACK W3",
      "PRICE/PCS W3",
      "PRICE/ PACK W4",
      "PRICE/PCS W4",
    ],
    [
      "DKI Jakarta",
      "Jakarta Utara",
      "Test Store",
      "BABY SHOP",
      "BD MID",
      "SWEETY BRONZE",
      "BAG",
      "Sweety Bronze Pants",
      "XL",
      32,
      "",
      "",
      100000,
      3125,
      90000,
      2812.5,
      0,
      0,
    ],
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

  const preview = parseOfflinePriceExcel(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), "MAKUKU产品价格表_202605.xlsx");

  assert.equal(preview.error_count, 0);
  assert.equal(preview.skipped_no_price_rows, 0);
  assert.equal(preview.snapshot_count, 2);
  assert.equal(JSON.stringify(preview.rows[0].weeks.map((week) => week.package_price)), JSON.stringify([null, 100000, 90000, null]));
});

test("offline price Excel parser treats all-empty weekly prices as skipped rows, not errors", () => {
  const { parseOfflinePriceExcel } = loadExcelParser();
  const XLSX = require("xlsx");
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    [
      "AREA",
      "KOTA",
      "NAMA TOKO",
      "TYPE TOKO",
      "CATEGORY",
      "BRAND",
      "GPL 2",
      "NAMA PRODUCT MAKUKU",
      "SIZE",
      "PACK",
      "PRICE/ PACK W1",
      "PRICE/PCS W1",
      "PRICE/ PACK W2",
      "PRICE/PCS W2",
      "PRICE/ PACK W3",
      "PRICE/PCS W3",
      "PRICE/ PACK W4",
      "PRICE/PCS W4",
    ],
    ["DKI Jakarta", "Jakarta Utara", "Test Store", "BABY SHOP", "BD MID", "SWEETY BRONZE", "BAG", "Sweety Bronze Pants", "XL", 32, "", "", 0, 0, "", "", 0, 0],
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

  const preview = parseOfflinePriceExcel(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), "MAKUKU产品价格表_202605.xlsx");

  assert.equal(preview.error_count, 0);
  assert.equal(preview.skipped_no_price_rows, 1);
  assert.equal(preview.snapshot_count, 0);
});

test("offline price Excel parser does not block import when no-price rows also miss product fields", () => {
  const { parseOfflinePriceExcel } = loadExcelParser();
  const XLSX = require("xlsx");
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    [
      "AREA",
      "KOTA",
      "NAMA TOKO",
      "TYPE TOKO",
      "CATEGORY",
      "BRAND",
      "GPL 2",
      "NAMA PRODUCT MAKUKU",
      "SIZE",
      "PACK",
      "PRICE/ PACK W1",
      "PRICE/PCS W1",
      "PRICE/ PACK W2",
      "PRICE/PCS W2",
      "PRICE/ PACK W3",
      "PRICE/PCS W3",
      "PRICE/ PACK W4",
      "PRICE/PCS W4",
    ],
    ["SOUTH SUMATRA", "JAMBI", "JAMTOS GROUP", "MODERN TRADE", "AD", "CONFIDENCE DAILY FRESH", "BIG PACK", "DAILY FRESH XL6", "XL", "", "", 0, 0, 0, 0, 0, 0, 0],
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

  const preview = parseOfflinePriceExcel(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), "MAKUKU产品价格表_202605.xlsx");

  assert.equal(preview.error_count, 0);
  assert.equal(preview.skipped_no_price_rows, 1);
  assert.equal(preview.snapshot_count, 0);
});

test("offline price Excel import matches Makuku shorthand rows by product line size and total pack", () => {
  const route = readFileSync("src/app/api/internal/excel-price-import/route.ts", "utf8");

  assert.match(route, /inferMakukuProductLine/);
  assert.match(route, /scoreMaterialMatch/);
  assert.match(route, /rowLine !== materialLine/);
  assert.match(route, /Number\(material\.pack_count\) !== Number\(row\.piece_count\)/);
  assert.match(route, /candidates\.sort\(\(left, right\) => scoreMaterialMatch\(row, right\) - scoreMaterialMatch\(row, left\)\)/);
  assert.match(route, /Makuku SKU ambiguous/);
});

test("Excel price import is protected by database upsert and partial unique indexes", () => {
  assert.match(excelUpsertMigration, /delete from public\.price_snapshots[\s\S]*ranked_competitor_duplicates/);
  assert.match(excelUpsertMigration, /delete from public\.price_snapshots[\s\S]*ranked_makuku_duplicates/);
  assert.match(excelUpsertMigration, /uniq_price_snapshots_excel_competitor/);
  assert.match(excelUpsertMigration, /uniq_price_snapshots_excel_makuku/);
  assert.match(excelUpsertMigration, /create or replace function public\.import_excel_price_snapshots/);
  assert.match(excelUpsertMigration, /on conflict \(source, captured_at, offline_store_id, competitor_product_id\)/);
  assert.match(excelUpsertMigration, /on conflict \(source, captured_at, offline_store_id, sku_master_id\)/);
  assert.match(excelUpsertMigration, /do update set[\s\S]*promo_price_idr = excluded\.promo_price_idr/);
  assert.match(excelRoute, /\.rpc\("import_excel_price_snapshots"/);
  assert.match(excelRoute, /updated_snapshots/);
  assert.match(excelWorkbench, /updated_snapshots/);
});

test("Excel price import lets database upsert handle duplicates and reports current-file counts", () => {
  assert.doesNotMatch(excelRoute, /readExistingSnapshotKeys/);
  assert.doesNotMatch(excelRoute, /existingSnapshotKeys/);
  assert.match(excelRoute, /stores: preview\.store_count/);
  assert.match(excelRoute, /competitor_products: uniqueBy\(importRows\.filter\(\(row\) => !row\.is_makuku\), productKey\)\.length/);
  assert.match(excelRoute, /skipped_snapshots: rowErrors\.length/);
});

function loadExcelParser() {
  const source = readFileSync("src/lib/offline-price-excel-import.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const cjsModule = { exports: {} };
  const sandbox = {
    module: cjsModule,
    exports: cjsModule.exports,
    require: (specifier) => {
      if (specifier === "xlsx") return require("xlsx");
      if (specifier === "@/lib/segments") {
        return {
          normalizeProductGrade(value) {
            const normalized = String(value ?? "").trim().toUpperCase();
            if (normalized === "AD") return "AD";
            if (normalized === "BD ECO") return "BD Eco";
            if (normalized === "BD MID") return "BD MID";
            return "unknown";
          },
        };
      }
      return require(specifier);
    },
  };
  vm.runInNewContext(compiled, sandbox);
  return cjsModule.exports;
}
