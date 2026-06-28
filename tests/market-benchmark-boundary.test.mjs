import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const pricesPage = readFileSync("src/app/[locale]/prices/page.tsx", "utf8");
const priceSnapshotsTable = readFileSync("src/components/price-snapshots-table.tsx", "utf8");
const competitorMappingsPage = readFileSync("src/app/[locale]/competitor-mappings/page.tsx", "utf8");
const competitorMappingTable = readFileSync("src/components/competitor-mappings-table.tsx", "utf8");
const competitorSeriesRulesPanel = readFileSync("src/components/competitor-series-rules-panel.tsx", "utf8");
const competitorProductsTable = readFileSync("src/components/competitor-products-table.tsx", "utf8");
const competitorsRoute = readFileSync("src/app/api/competitors/route.ts", "utf8");
const skuMatchesRoute = readFileSync("src/app/api/sku-matches/route.ts", "utf8");
const skuMasterBridge = readFileSync("src/lib/sku-master-bridge.ts", "utf8");
const dashboardPage = readFileSync("src/app/[locale]/dashboard/page.tsx", "utf8");
const dataFile = readFileSync("src/lib/data.ts", "utf8");
const productMasterSearchSelect = readFileSync("src/components/product-master-search-select.tsx", "utf8");
const appShell = readFileSync("src/components/app-shell.tsx", "utf8");

test("SKU price monitor stays a price fact view without benchmark configuration actions", () => {
  assert.match(pricesPage, /Export CSV/);
  assert.doesNotMatch(pricesPage, /PriceSnapshotActions/);
  assert.match(priceSnapshotsTable, /price_per_piece/);
  assert.doesNotMatch(pricesPage, /market-benchmarks/);
  assert.doesNotMatch(pricesPage, /benchmark_competitor_product_id/);
});

test("competitor mapping exposes automatic series rules and benchmark selection", () => {
  assert.match(competitorMappingsPage, /CompetitorSeriesRulesPanel/);
  assert.match(competitorMappingsPage, /getCompetitorSeriesMappings/);
  assert.match(competitorMappingsPage, /getMaterialMaster/);
  assert.match(competitorSeriesRulesPanel, /data-role="automatic-mapping-rules"/);
  assert.match(competitorSeriesRulesPanel, /target_makuku_series/);
  assert.match(competitorSeriesRulesPanel, /name="intent" value="set_benchmark"/);
  assert.match(competitorSeriesRulesPanel, /name="intent" value="clear_benchmark"/);
  assert.match(competitorSeriesRulesPanel, /is_default_benchmark/);
  assert.match(competitorSeriesRulesPanel, /coveredSkus/);
  assert.doesNotMatch(competitorMappingsPage, /CompetitorMappingsTable/);
  assert.doesNotMatch(competitorMappingsPage, /ProductMasterSearchSelect/);
  assert.doesNotMatch(competitorSeriesRulesPanel, /manualOverrides/);
  assert.doesNotMatch(competitorSeriesRulesPanel, /Manual override/);
  assert.doesNotMatch(competitorMappingTable, /\/api\/competitors/);
  assert.doesNotMatch(competitorMappingTable, /intent: "update_segment"/);
  assert.doesNotMatch(competitorMappingTable, /onBlur=\{\(\) => saveProductFields/);
  assert.doesNotMatch(competitorProductsTable, /intent: "update_segment"/);
  assert.doesNotMatch(competitorProductsTable, /Product Grade|Grade/);
  assert.doesNotMatch(competitorMappingsPage, /getSkuMaster/);
  assert.doesNotMatch(competitorMappingsPage, /benchmark_price_per_piece/);
  assert.doesNotMatch(competitorMappingsPage, /setBenchmarkHref/);
  assert.match(productMasterSearchSelect, /name="material_sku_code"/);
});

test("manual competitor mapping remains an explicit SKU exception path", () => {
  assert.match(skuMatchesRoute, /reviewed: true/);
  assert.match(skuMatchesRoute, /\.delete\(\)[\s\S]*\.eq\("competitor_product_id", competitorProductId\)/);
  assert.match(skuMatchesRoute, /sku_matches/);
  assert.match(skuMatchesRoute, /material_sku_code/);
  assert.match(skuMatchesRoute, /ensureSkuMasterFromMaterial/);
  assert.match(skuMasterBridge, /\.from\("material_master"\)/);
  assert.doesNotMatch(competitorsRoute, /body\.reviewed/);
});

test("standalone market benchmark management is removed from product routes", () => {
  assert.equal(existsSync("src/app/[locale]/market-benchmarks/page.tsx"), false);
  assert.equal(existsSync("src/app/api/market-benchmarks/route.ts"), false);
  assert.equal(existsSync("src/components/market-benchmark-rule-dialog.tsx"), false);
  assert.equal(existsSync("src/components/market-benchmark-backfill-dialog.tsx"), false);
  assert.doesNotMatch(appShell, /market-benchmarks/);
  assert.doesNotMatch(appShell, /Market Benchmarks/);
  assert.doesNotMatch(dashboardPage, /Maintain benchmark rules/);
  assert.match(dashboardPage, /competitor-mappings/);
});

test("dashboard price index derives benchmark selection from competitor mappings", () => {
  assert.match(dataFile, /getCompetitorSeriesMappings/);
  assert.match(dataFile, /is_default_benchmark/);
  assert.match(dataFile, /defaultBenchmarkSeries/);
  assert.match(dataFile, /defaultBenchmarkSeries \? defaultBenchmarkPrices : \[\]/);
  assert.doesNotMatch(dataFile, /allMappedBenchmarkPrices/);
  assert.doesNotMatch(dataFile, /getMarketBenchmarkRules\(\)/);
  assert.doesNotMatch(dataFile, /market_benchmark_rules/);
  assert.doesNotMatch(dataFile, /market_benchmark_period_prices/);
  assert.doesNotMatch(dataFile, /buildMarketBenchmarkHref/);
  assert.doesNotMatch(dataFile, /\/market-benchmarks\?/);
});
