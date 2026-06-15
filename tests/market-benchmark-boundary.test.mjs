import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const pricesPage = readFileSync("src/app/[locale]/prices/page.tsx", "utf8");
const priceSnapshotsTable = readFileSync("src/components/price-snapshots-table.tsx", "utf8");
const competitorMappingsPage = readFileSync("src/app/[locale]/competitor-mappings/page.tsx", "utf8");
const competitorMappingTable = readFileSync("src/components/competitor-mappings-table.tsx", "utf8");
const competitorProductsTable = readFileSync("src/components/competitor-products-table.tsx", "utf8");
const competitorsRoute = readFileSync("src/app/api/competitors/route.ts", "utf8");
const skuMatchesRoute = readFileSync("src/app/api/sku-matches/route.ts", "utf8");
const skuMasterBridge = readFileSync("src/lib/sku-master-bridge.ts", "utf8");
const marketBenchmarksPage = readFileSync("src/app/[locale]/market-benchmarks/page.tsx", "utf8");
const marketBenchmarksRoute = readFileSync("src/app/api/market-benchmarks/route.ts", "utf8");
const dashboardPage = readFileSync("src/app/[locale]/dashboard/page.tsx", "utf8");
const dataFile = readFileSync("src/lib/data.ts", "utf8");
const productMasterSearchSelect = readFileSync("src/components/product-master-search-select.tsx", "utf8");

test("SKU price monitor stays a price fact view without benchmark configuration actions", () => {
  assert.match(pricesPage, /Export CSV|导出 CSV/);
  assert.doesNotMatch(pricesPage, /PriceSnapshotActions/);
  assert.match(priceSnapshotsTable, /price_per_piece/);
  assert.doesNotMatch(pricesPage, /market-benchmarks/);
  assert.doesNotMatch(pricesPage, /Set as benchmark|设为市场标杆|benchmark_competitor_product_id/);
});

test("competitor mapping exposes only mapping and set-as-benchmark controls", () => {
  assert.match(competitorMappingsPage, /CompetitorMappingsTable/);
  assert.match(competitorMappingsPage, /getMaterialMaster/);
  assert.match(competitorMappingTable, /setBenchmarkHref/);
  assert.match(competitorMappingTable, /sku_master/);
  assert.match(competitorMappingTable, /Set benchmark|设为市场标杆/);
  assert.match(competitorMappingTable, /Missing Makuku SKU|未关联 Makuku SKU/);
  assert.match(competitorMappingTable, /Mapped Makuku SKU|对标 Makuku SKU/);
  assert.match(competitorMappingTable, /tenant_sku_code/);
  assert.match(competitorMappingTable, /tenant_sku_name/);
  assert.match(competitorMappingTable, /action="\/api\/sku-matches"/);
  assert.match(competitorMappingTable, /name="competitor_product_id"/);
  assert.match(competitorMappingTable, /ProductMasterSearchSelect/);
  assert.doesNotMatch(competitorMappingTable, /\/api\/competitors/);
  assert.doesNotMatch(competitorMappingTable, /intent: "update_segment"/);
  assert.doesNotMatch(competitorMappingTable, /onBlur=\{\(\) => saveProductFields/);
  assert.doesNotMatch(competitorProductsTable, /intent: "update_segment"/);
  assert.doesNotMatch(competitorProductsTable, /Product Grade|商品等级|Grade/);
  assert.match(productMasterSearchSelect, /name="material_sku_code"/);
  assert.doesNotMatch(competitorMappingsPage, /getSkuMaster/);
  assert.doesNotMatch(competitorMappingTable, /name="reviewed"/);
  assert.doesNotMatch(competitorMappingTable, /benchmark_price_per_piece/);
  assert.doesNotMatch(competitorMappingTable, /active benchmark/i);
});

test("manual competitor mapping is confirmed without a second approval step", () => {
  assert.match(skuMatchesRoute, /reviewed: true/);
  assert.match(skuMatchesRoute, /\.delete\(\)[\s\S]*\.eq\("competitor_product_id", competitorProductId\)/);
  assert.match(skuMatchesRoute, /sku_matches/);
  assert.match(skuMatchesRoute, /material_sku_code/);
  assert.match(skuMatchesRoute, /ensureSkuMasterFromMaterial/);
  assert.match(skuMasterBridge, /\.from\("material_master"\)/);
  assert.doesNotMatch(competitorsRoute, /body\.reviewed/);
});

test("market benchmark page is the configuration center with mapped SKU prefill", () => {
  assert.match(marketBenchmarksPage, /searchParams/);
  assert.match(marketBenchmarksPage, /selectedCompetitorId/);
  assert.match(marketBenchmarksPage, /latestBenchmarkPrice/);
  assert.match(marketBenchmarksPage, /matchedSku/);
  assert.match(marketBenchmarksPage, /Missing mapping|缺少映射/);
  assert.match(marketBenchmarksPage, /Owner|负责人/i);
  assert.match(marketBenchmarksPage, /benchmark_competitor_product_id/);
  assert.match(marketBenchmarksPage, /readonly|readOnly/);
});

test("market benchmark API derives segment from mapped competitor and replaces active benchmark", () => {
  assert.match(marketBenchmarksRoute, /deriveBenchmarkPayload/);
  assert.match(marketBenchmarksRoute, /getLatestCompetitorPrice/);
  assert.match(marketBenchmarksRoute, /disableExistingActiveBenchmark/);
  assert.match(marketBenchmarksRoute, /sku_matches/);
  assert.match(marketBenchmarksRoute, /benchmark_competitor_product_id/);
  assert.match(marketBenchmarksRoute, /price_snapshots/);
  assert.match(marketBenchmarksRoute, /\.eq\("active", true\)/);
});

test("dashboard missing benchmark drilldown goes to benchmark configuration", () => {
  assert.match(dataFile, /buildMarketBenchmarkHref/);
  assert.match(dataFile, /\/market-benchmarks\?/);
  assert.match(dashboardPage, /Add benchmark|补标杆/);
});
