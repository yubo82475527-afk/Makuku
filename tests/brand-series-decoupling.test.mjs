import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const migrationPath = "supabase/migrations/202606150001_competitor_product_series.sql";
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const typesFile = readFileSync("src/lib/types.ts", "utf8");
const excelRoute = readFileSync("src/app/api/internal/excel-price-import/route.ts", "utf8");
const pricesPage = readFileSync("src/app/[locale]/prices/page.tsx", "utf8");
const priceSnapshotsTable = readFileSync("src/components/price-snapshots-table.tsx", "utf8");
const priceExportRoute = readFileSync("src/app/api/price-snapshots/export/route.ts", "utf8");
const competitorProductsTable = readFileSync("src/components/competitor-products-table.tsx", "utf8");
const competitorsRoute = readFileSync("src/app/api/competitors/route.ts", "utf8");

test("brand series helper splits Excel brand names by longest parent brand prefix", () => {
  const { splitBrandSeries, brandSeriesLabel } = loadBrandSeriesModule();
  const brands = [
    { id: "b1", name: "Sweety", country: "Indonesia", is_own_brand: false, created_at: "" },
    { id: "b2", name: "MamyPoko", country: "Indonesia", is_own_brand: false, created_at: "" },
    { id: "b3", name: "MamyPoko Royal", country: "Indonesia", is_own_brand: false, created_at: "" },
  ];

  assert.deepEqual({ ...splitBrandSeries("SWEETY BRONZE", brands) }, { brandName: "Sweety", productSeries: "Bronze" });
  assert.deepEqual({ ...splitBrandSeries("MAMYPOKO ROYAL SOFT", brands) }, { brandName: "MamyPoko Royal", productSeries: "Soft" });
  assert.deepEqual({ ...splitBrandSeries("CONFIDENCE DAILY FRESH", brands) }, { brandName: "CONFIDENCE", productSeries: "Daily Fresh" });
  assert.equal(brandSeriesLabel("Makuku", "Comfort Fit"), "MAKUKU COMFORT FIT");
  assert.equal(brandSeriesLabel("Sweety", "Bronze"), "SWEETY BRONZE");
});

test("competitor product series migration and type are present", () => {
  assert.match(migration, /alter table public\.competitor_products[\s\S]*add column if not exists product_series text/);
  assert.match(migration, /split_part/);
  assert.match(migration, /update public\.competitor_products/);
  assert.match(typesFile, /product_series\?: string \| null/);
});

test("Excel import stores parent brand and product series separately", () => {
  assert.match(excelRoute, /splitBrandSeries/);
  assert.match(excelRoute, /product_series: row\.product_series/);
  assert.match(excelRoute, /brand_id: brands\.get\(normalizeKey\(row\.brand\)\)/);
  assert.match(excelRoute, /product_series: product\.product_series/);
  assert.match(excelRoute, /uniqueBy\(importRows\.filter\(\(row\) => !row\.is_makuku\), productKey\)/);
});

test("real market price uses brand series labels for filtering display and export", () => {
  assert.doesNotMatch(pricesPage, /getBrands\(\)/);
  assert.match(pricesPage, /priceBrandSeriesLabel/);
  assert.match(pricesPage, /brandSeriesOptions/);
  assert.match(pricesPage, /params\.brand && priceBrandSeriesLabel\(snapshot\) !== params\.brand/);
  assert.match(priceSnapshotsTable, /priceBrandSeriesLabel/);
  assert.match(priceExportRoute, /priceBrandSeriesLabel/);
});

test("competitor product master exposes editable product series", () => {
  assert.match(competitorProductsTable, /product_series/);
  assert.match(competitorProductsTable, /series/);
  assert.match(competitorsRoute, /product_series/);
  assert.match(competitorsRoute, /normalizeOptionalText/);
});

function loadBrandSeriesModule() {
  const source = readFileSync("src/lib/brand-series.ts", "utf8");
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
    require,
  };
  vm.runInNewContext(compiled, sandbox);
  return cjsModule.exports;
}
