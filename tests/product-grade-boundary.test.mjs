import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const typesFile = readFileSync("src/lib/types.ts", "utf8");
const segmentsFile = readFileSync("src/lib/segments.ts", "utf8");
const migrationFile = readFileSync("supabase/migrations/202606120001_product_grade_segments.sql", "utf8");
const aiPriceReviewFile = readFileSync("src/lib/ai-price-review.ts", "utf8");
const dataFile = readFileSync("src/lib/data.ts", "utf8");
const skuMasterPage = readFileSync("src/app/[locale]/sku-master/page.tsx", "utf8");
const skuMasterTable = readFileSync("src/components/sku-master-segment-table.tsx", "utf8");
const materialMasterTable = readFileSync("src/components/material-master-table.tsx", "utf8");
const materialMasterExportRoute = readFileSync("src/app/api/material-master/export/route.ts", "utf8");
const competitorProductsPage = readFileSync("src/app/[locale]/competitor-products/page.tsx", "utf8");
const competitorMappingsPage = readFileSync("src/app/[locale]/competitor-mappings/page.tsx", "utf8");
const pricesPage = readFileSync("src/app/[locale]/prices/page.tsx", "utf8");
const priceSnapshotsRoute = readFileSync("src/app/api/price-snapshots/route.ts", "utf8");
const competitorProductsTablePath = "src/components/competitor-products-table.tsx";
const competitorProductsTable = existsSync(competitorProductsTablePath) ? readFileSync(competitorProductsTablePath, "utf8") : "";

test("product grade vocabulary is centralized on master data values", () => {
  assert.match(typesFile, /"AD" \| "BD Eco" \| "BD MID" \| "unknown"/);
  assert.match(segmentsFile, /productGradeValues/);
  assert.match(segmentsFile, /normalizeProductGrade/);
  assert.match(segmentsFile, /premium" \|\| text === "mid"/);
  assert.match(segmentsFile, /return "BD MID"/);
  assert.match(segmentsFile, /value"\) return "BD Eco"/);
});

test("database migration maps old segment values without touching price snapshots", () => {
  assert.match(migrationFile, /in \('premium', 'mid'\) then 'BD MID'/);
  assert.match(migrationFile, /= 'value' then 'BD Eco'/);
  assert.match(migrationFile, /sku_master_segment_check/);
  assert.match(migrationFile, /competitor_products_segment_check/);
  assert.match(migrationFile, /market_benchmarks/);
  assert.doesNotMatch(migrationFile, /alter table public\.price_snapshots/i);
});

test("Makuku master data maintains product grade, while competitor products stay lean and price snapshots stay facts", () => {
  assert.match(skuMasterPage, /SkuMasterSegmentTable/);
  assert.match(skuMasterPage, /<MaterialMasterTable dict=\{dict\} rows=\{result\.data\} locale=\{locale\}/);
  assert.match(skuMasterTable, /if \(rows\.length === 0\) return null/);
  assert.match(skuMasterTable, /intent" value="update_segment"/);
  assert.match(competitorProductsPage, /CompetitorProductsTable/);
  assert.doesNotMatch(competitorProductsTable, /Product Grade|Grade/);
  assert.match(competitorProductsTable, /pack_type/);
  assert.match(competitorProductsTable, /segment/);
  assert.doesNotMatch(competitorMappingsPage, /update_segment/);
  assert.equal(existsSync("src/components/competitor-mappings-table.tsx"), false);
  assert.equal(existsSync("src/components/competitor-mapping-table.tsx"), false);
  assert.match(pricesPage, /priceSnapshotBusinessSegment/);
  assert.match(readFileSync("src/lib/price-snapshot-business.ts", "utf8"), /snapshot\.competitor_products\?\.segment/);
  assert.doesNotMatch(priceSnapshotsRoute, /segment/);
});

test("SKU master records can be exported from the product master page", () => {
  assert.match(materialMasterTable, /\/api\/material-master\/export\?locale=\$\{locale\}/);
  assert.match(materialMasterTable, /导出 SKU 主数据|Export SKU Master/);
  assert.match(materialMasterExportRoute, /export async function GET/);
  assert.match(materialMasterExportRoute, /requireAdminSession/);
  assert.match(materialMasterExportRoute, /from\("material_master"\)/);
  assert.match(materialMasterExportRoute, /materialMasterColumns\.map\(csvEscape\)/);
  assert.match(materialMasterExportRoute, /Content-Disposition/);
});

test("photo review creates competitor products with unknown grade and derived views do not infer grade from facts", () => {
  assert.match(aiPriceReviewFile, /segment: "unknown"/);
  assert.doesNotMatch(aiPriceReviewFile, /deriveSegment|inferPriceBand/);
  assert.doesNotMatch(dataFile, /function inferPriceBand/);
  assert.match(dataFile, /const priceBand = "unknown"/);
  assert.match(dataFile, /return \{ line, size, priceBand: product\.segment \}/);
  assert.match(dataFile, /candidate\.matched_entity_type !== "competitor_product"/);
});

test("competitor product master keeps only 1.0 required fields editable", () => {
  assert.equal(existsSync(competitorProductsTablePath), true);
  assert.match(competitorProductsTable, /"use client"/);
  assert.match(competitorProductsTable, /function saveProduct/);
  assert.match(competitorProductsTable, /package_type/);
  assert.match(competitorProductsTable, /piece_count/);
  assert.match(competitorProductsTable, /status/);
  assert.doesNotMatch(competitorProductsTable, /bulkGrade/);
  assert.doesNotMatch(competitorProductsTable, /applyBulkGrade/);
  assert.doesNotMatch(competitorProductsTable, /copy\.confirmSaveGrade/);
  assert.match(competitorProductsTable, /min-w-\[1240px\]/);
  assert.match(competitorProductsTable, /overflow-x-auto/);
  assert.match(competitorProductsTable, /whitespace-nowrap/);
});
