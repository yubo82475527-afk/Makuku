import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const pricesPage = readFileSync("src/app/[locale]/prices/page.tsx", "utf8");
const priceSnapshotsTable = readFileSync("src/components/price-snapshots-table.tsx", "utf8");
const competitorsPage = readFileSync("src/app/[locale]/competitors/page.tsx", "utf8");
const competitorsRoute = readFileSync("src/app/api/competitors/route.ts", "utf8");
const skuMatchesRoute = readFileSync("src/app/api/sku-matches/route.ts", "utf8");
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
  assert.match(competitorsPage, /setBenchmarkHref/);
  assert.match(competitorsPage, /sku_master/);
  assert.match(competitorsPage, /设为市场标杆|Set benchmark/);
  assert.match(competitorsPage, /未关联产品主数据|Missing product master/);
  assert.match(competitorsPage, /关联产品主数据|Map product master/);
  assert.match(competitorsPage, /getMaterialMaster/);
  assert.match(competitorsPage, /tenant_sku_code/);
  assert.match(competitorsPage, /tenant_sku_name/);
  assert.match(competitorsPage, /action="\/api\/sku-matches"/);
  assert.match(competitorsPage, /name="competitor_product_id"/);
  assert.match(competitorsPage, /ProductMasterSearchSelect/);
  assert.match(productMasterSearchSelect, /name="material_sku_code"/);
  assert.doesNotMatch(competitorsPage, /getSkuMaster/);
  assert.doesNotMatch(competitorsPage, /name="reviewed"/);
  assert.doesNotMatch(competitorsPage, /Review mapping first|先审核映射/);
  assert.doesNotMatch(competitorsPage, /match\?\.reviewed && match\.sku_master/);
  assert.doesNotMatch(competitorsPage, /action="\/api\/competitors"/);
  assert.doesNotMatch(competitorsPage, /dict\.competitors\.addTitle/);
  assert.doesNotMatch(competitorsPage, /name="raw_title"/);
  assert.doesNotMatch(competitorsPage, /benchmark_price_per_piece/);
  assert.doesNotMatch(competitorsPage, /active benchmark/i);
});

test("manual competitor mapping is confirmed without a second approval step", () => {
  assert.match(skuMatchesRoute, /reviewed: true/);
  assert.match(skuMatchesRoute, /match_id/);
  assert.match(skuMatchesRoute, /sku_matches/);
  assert.match(skuMatchesRoute, /material_sku_code/);
  assert.match(skuMatchesRoute, /ensureSkuMasterFromMaterial/);
  assert.match(skuMatchesRoute, /\.from\("material_master"\)/);
  assert.doesNotMatch(competitorsRoute, /body\.reviewed/);
});

test("market benchmark page is the configuration center with mapped SKU prefill", () => {
  assert.match(marketBenchmarksPage, /searchParams/);
  assert.match(marketBenchmarksPage, /selectedCompetitorId/);
  assert.match(marketBenchmarksPage, /latestBenchmarkPrice/);
  assert.match(marketBenchmarksPage, /matchedSku/);
  assert.match(marketBenchmarksPage, /缺少映射|Missing mapping/);
  assert.match(marketBenchmarksPage, /负责人|owner|Owner/i);
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
  assert.match(dashboardPage, /补标杆|Add benchmark/);
});
