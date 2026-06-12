import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const pricesPage = readFileSync("src/app/[locale]/prices/page.tsx", "utf8");
const priceSnapshotsTable = readFileSync("src/components/price-snapshots-table.tsx", "utf8");
const competitorsPage = readFileSync("src/app/[locale]/competitors/page.tsx", "utf8");
const competitorMappingTable = readFileSync("src/components/competitor-mapping-table.tsx", "utf8");
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

test("competitor mapping exposes only a lightweight set-as-benchmark shortcut", () => {
  assert.match(competitorsPage, /CompetitorMappingTable/);
  assert.match(competitorMappingTable, /setBenchmarkHref/);
  assert.match(competitorMappingTable, /sku_master/);
  assert.match(competitorMappingTable, /Set benchmark|设为标杆/);
  assert.match(competitorMappingTable, /Missing product master|缺少产品主数据/);
  assert.match(competitorMappingTable, /Map product master|关联产品主数据/);
  assert.match(competitorsPage, /getMaterialMaster/);
  assert.match(competitorMappingTable, /tenant_sku_code/);
  assert.match(competitorMappingTable, /tenant_sku_name/);
  assert.match(competitorMappingTable, /action="\/api\/sku-matches"/);
  assert.match(competitorMappingTable, /name="competitor_product_id"/);
  assert.match(competitorMappingTable, /ProductMasterSearchSelect/);
  assert.match(competitorMappingTable, /\/api\/competitors/);
  assert.match(competitorMappingTable, /intent: "update_segment"/);
  assert.match(competitorMappingTable, /Competitor Grade|竞品商品等级/);
  assert.doesNotMatch(competitorMappingTable, /Makuku Grade|Makuku商品等级/);
  assert.match(productMasterSearchSelect, /name="material_sku_code"/);
  assert.doesNotMatch(competitorsPage, /getSkuMaster/);
  assert.doesNotMatch(competitorMappingTable, /name="reviewed"/);
  assert.doesNotMatch(competitorMappingTable, /Review mapping first|先审核映射/);
  assert.doesNotMatch(competitorMappingTable, /match\?\.reviewed && match\.sku_master/);
  assert.doesNotMatch(competitorMappingTable, /dict\.competitors\.addTitle/);
  assert.doesNotMatch(competitorMappingTable, /name="raw_title"/);
  assert.doesNotMatch(competitorMappingTable, /benchmark_price_per_piece/);
  assert.doesNotMatch(competitorMappingTable, /active benchmark/i);
});

test("manual competitor mapping is confirmed without a second approval step", () => {
  assert.match(skuMatchesRoute, /reviewed: true/);
  assert.match(skuMatchesRoute, /match_id/);
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
