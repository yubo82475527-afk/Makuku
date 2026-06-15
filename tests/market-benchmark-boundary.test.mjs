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
const marketBenchmarkBackfillDialog = readFileSync("src/components/market-benchmark-backfill-dialog.tsx", "utf8");
const marketBenchmarkRuleDialog = readFileSync("src/components/market-benchmark-rule-dialog.tsx", "utf8");
const marketBenchmarksRoute = readFileSync("src/app/api/market-benchmarks/route.ts", "utf8");
const dashboardPage = readFileSync("src/app/[locale]/dashboard/page.tsx", "utf8");
const dataFile = readFileSync("src/lib/data.ts", "utf8");
const productMasterSearchSelect = readFileSync("src/components/product-master-search-select.tsx", "utf8");

test("SKU price monitor stays a price fact view without benchmark configuration actions", () => {
  assert.match(pricesPage, /Export CSV|瀵煎嚭 CSV/);
  assert.doesNotMatch(pricesPage, /PriceSnapshotActions/);
  assert.match(priceSnapshotsTable, /price_per_piece/);
  assert.doesNotMatch(pricesPage, /market-benchmarks/);
  assert.doesNotMatch(pricesPage, /Set as benchmark|璁句负甯傚満鏍囨潌|benchmark_competitor_product_id/);
});

test("competitor mapping exposes only mapping and set-as-benchmark controls", () => {
  assert.match(competitorMappingsPage, /CompetitorMappingsTable/);
  assert.match(competitorMappingsPage, /getMaterialMaster/);
  assert.match(competitorMappingTable, /setBenchmarkHref/);
  assert.match(competitorMappingTable, /sku_master/);
  assert.match(competitorMappingTable, /Set benchmark|璁句负甯傚満鏍囨潌/);
  assert.match(competitorMappingTable, /Missing Makuku SKU|鏈叧鑱?Makuku SKU/);
  assert.match(competitorMappingTable, /Mapped Makuku SKU|瀵规爣 Makuku SKU/);
  assert.match(competitorMappingTable, /tenant_sku_code/);
  assert.match(competitorMappingTable, /tenant_sku_name/);
  assert.match(competitorMappingTable, /action="\/api\/sku-matches"/);
  assert.match(competitorMappingTable, /name="competitor_product_id"/);
  assert.match(competitorMappingTable, /ProductMasterSearchSelect/);
  assert.doesNotMatch(competitorMappingTable, /\/api\/competitors/);
  assert.doesNotMatch(competitorMappingTable, /intent: "update_segment"/);
  assert.doesNotMatch(competitorMappingTable, /onBlur=\{\(\) => saveProductFields/);
  assert.doesNotMatch(competitorProductsTable, /intent: "update_segment"/);
  assert.doesNotMatch(competitorProductsTable, /Product Grade|鍟嗗搧绛夌骇|Grade/);
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

test("market benchmark page is the regional series rule configuration center", () => {
  assert.match(marketBenchmarksPage, /getMarketBenchmarkRules/);
  assert.match(marketBenchmarksPage, /getCompetitorProducts/);
  assert.match(marketBenchmarksPage, /searchParams/);
  assert.match(marketBenchmarksPage, /MarketBenchmarkRuleDialog/);
  assert.match(marketBenchmarksPage, /MarketBenchmarkBackfillDialog/);
  assert.match(marketBenchmarksPage, /name="province"/);
  assert.match(marketBenchmarksPage, /name="cityName"/);
  assert.match(marketBenchmarksPage, /name="district"/);
  assert.match(marketBenchmarksPage, /name="brand"/);
  assert.match(marketBenchmarksPage, /name="series"/);
  assert.match(marketBenchmarksPage, /visibleRows/);
  assert.match(marketBenchmarksPage, /market_benchmark_period_prices/);
  assert.match(marketBenchmarkRuleDialog, /新增规则|New Rule/);
  assert.match(marketBenchmarkRuleDialog, /name="brand_id"/);
  assert.match(marketBenchmarkRuleDialog, /name="product_series"/);
  assert.match(marketBenchmarkBackfillDialog, /补算历史周期价|Backfill Prices/);
  assert.match(marketBenchmarkBackfillDialog, /backfill_period_prices/);
  assert.doesNotMatch(marketBenchmarksPage, /competitorProductId/);
  assert.doesNotMatch(marketBenchmarksPage, /name="benchmark_price_per_piece"/);
});

test("market benchmark API saves regional series rules and period prices", () => {
  assert.match(marketBenchmarksRoute, /getMarketBenchmarkRules/);
  assert.match(marketBenchmarksRoute, /findActiveRule/);
  assert.match(marketBenchmarksRoute, /backfillPeriodPrices/);
  assert.match(marketBenchmarksRoute, /market_benchmark_rules/);
  assert.match(marketBenchmarksRoute, /market_benchmark_period_prices/);
  assert.match(marketBenchmarksRoute, /calculateBenchmarkAverage/);
  assert.match(marketBenchmarksRoute, /carried_forward/);
  assert.match(marketBenchmarksRoute, /price_snapshots/);
  assert.match(marketBenchmarksRoute, /\.eq\("active", true\)/);
  assert.doesNotMatch(marketBenchmarksRoute, /benchmark_competitor_product_id/);
});
test("dashboard missing benchmark drilldown goes to benchmark configuration", () => {
  assert.match(dataFile, /buildMarketBenchmarkHref/);
  assert.match(dataFile, /\/market-benchmarks\?/);
  assert.match(dashboardPage, /Add benchmark/);
});
