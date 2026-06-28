import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const appShell = readFileSync("src/components/app-shell.tsx", "utf8");
const dashboardPage = readFileSync("src/app/[locale]/dashboard/page.tsx", "utf8");
const pricesPage = readFileSync("src/app/[locale]/prices/page.tsx", "utf8");
const dataFile = readFileSync("src/lib/data.ts", "utf8");
const typesFile = readFileSync("src/lib/types.ts", "utf8");
const reverseRoute = readFileSync("src/app/api/location/reverse/route.ts", "utf8");
const offlineStoresRoute = readFileSync("src/app/api/offline-stores/route.ts", "utf8");
const priceSnapshotsTable = readFileSync("src/components/price-snapshots-table.tsx", "utf8");
const storeMasterTable = readFileSync("src/components/store-master-table.tsx", "utf8");

test("app shell groups the backend navigation for price positioning and master data", () => {
  assert.match(appShell, /Dashboard/);
  assert.match(appShell, /Price Monitoring/);
  assert.match(appShell, /真实市场价格|Real Market Price/);
  assert.match(appShell, /Photo Price Review/);
  assert.match(appShell, /Price Positioning/);
  assert.match(appShell, /Competitor Mapping/);
  assert.doesNotMatch(appShell, /Market Benchmarks/);
  assert.doesNotMatch(appShell, /\/market-benchmarks/);
  assert.match(appShell, /Master Data/);
  assert.match(appShell, /Product Master/);
  assert.match(appShell, /Store Master/);
  assert.match(appShell, /User Management/);
  assert.doesNotMatch(appShell, /SKU Price Monitor/);
  assert.doesNotMatch(appShell, /Executive Board/);
});

test("market benchmark management moved into competitor mapping", () => {
  assert.equal(existsSync("src/app/[locale]/market-benchmarks/page.tsx"), false);
  assert.equal(existsSync("src/app/api/market-benchmarks/route.ts"), false);
  assert.match(appShell, /Competitor Mapping/);
  assert.match(appShell, /\/competitor-mappings/);
  assert.match(typesFile, /export type MarketBenchmark/);
  assert.match(dataFile, /getMarketBenchmarks/);
  assert.match(dataFile, /market_benchmarks/);
  assert.match(readFileSync("supabase/migrations/202606090001_market_benchmarks_and_store_regions.sql", "utf8"), /create table if not exists public\.market_benchmarks/);
});

test("location reverse and offline stores support structured province city district", () => {
  assert.match(reverseRoute, /province/);
  assert.match(reverseRoute, /cityName/);
  assert.match(reverseRoute, /district/);
  assert.match(offlineStoresRoute, /province/);
  assert.match(offlineStoresRoute, /city_name/);
  assert.match(offlineStoresRoute, /district/);
  assert.match(typesFile, /@deprecated Use city_name instead\. Kept only for legacy compatibility\./);
});

test("dashboard now combines price index, exception follow-up, and execution sections", () => {
  assert.match(dashboardPage, /Price Index/);
  assert.match(dashboardPage, /Exception Follow-up/);
  assert.match(dashboardPage, /Promoter Execution/);
  assert.match(dashboardPage, /PriceIndexTreeTable/);
  assert.match(dashboardPage, /flattenProblemStoreRows/);
  assert.match(dashboardPage, /buildExecutionBoard/);
  assert.match(dashboardPage, /name="month"/);
  assert.match(dashboardPage, /name="organization"/);
  assert.match(dashboardPage, /name="ownSeries"/);
  assert.doesNotMatch(dashboardPage, /name="sku"/);
  assert.doesNotMatch(dashboardPage, /name="benchmarkRuleId"/);
  assert.match(dashboardPage, /name="exceptionProvince"/);
  assert.match(dashboardPage, /name="executionMonth"/);
  assert.match(readFileSync("src/components/price-index-tree-table.tsx", "utf8"), /PRICE\/PCS \{week\.label\}/);
  assert.match(readFileSync("src/components/price-index-tree-table.tsx", "utf8"), /CombinedMetricCell/);
  assert.doesNotMatch(readFileSync("src/components/price-index-tree-table.tsx", "utf8"), /function PriceCell/);
  assert.match(readFileSync("src/components/price-index-tree-table.tsx", "utf8"), /WEEK_COLUMN_CLASS/);
});

test("dashboard derived data calculates weekly coefficients from own and benchmark averages", () => {
  assert.match(typesFile, /WeeklyPriceCoefficientBoard/);
  assert.match(typesFile, /WeeklyPriceCoefficientCell/);
  assert.match(typesFile, /ownCoefficient: number \| null/);
  assert.match(typesFile, /WeeklyPriceCoefficientCompetitorSeries/);
  assert.match(typesFile, /WeeklyPriceCoefficientCompetitorCell/);
  assert.match(dataFile, /getWeeklyPriceCoefficientBoard/);
  assert.match(dataFile, /buildWeeklyPriceCoefficientBoard/);
  assert.match(dataFile, /monthWeeks/);
  assert.match(dataFile, /averageOrNull/);
  assert.match(dataFile, /getCompetitorSeriesMappings/);
  assert.match(dataFile, /seriesNamesOverlap/);
  assert.match(dataFile, /competitorSeriesLabel/);
  assert.match(dataFile, /competitorCells/);
  assert.match(dataFile, /ownBenchmarkAvgPrice/);
  assert.match(dataFile, /ownCoefficient:/);
  assert.match(dataFile, /is_default_benchmark/);
  assert.match(dataFile, /defaultBenchmarkSeries/);
  assert.match(dataFile, /defaultBenchmarkSeries \? defaultBenchmarkPrices : \[\]/);
  assert.doesNotMatch(dataFile, /allMappedBenchmarkPrices/);
  assert.doesNotMatch(dataFile, /benchmarkPricesFromPeriodPrices/);
  assert.doesNotMatch(dataFile, /market_benchmark_period_prices/);
  assert.doesNotMatch(dataFile, /pickBestBenchmarkRuleForSnapshot/);
  assert.match(dataFile, /ownAvgPrice \/ benchmarkAvgPrice/);
  assert.match(dataFile, /series\.isBenchmark/);
  assert.match(dataFile, /coefficient:\s+series\.isBenchmark/);
  assert.match(readFileSync("src/components/price-index-tree-table.tsx", "utf8"), /isBenchmark \? \(isZh \? "（标杆）" : " \(Benchmark\)"\) : ""/);
  assert.match(dataFile, /material_master/);
  assert.match(dataFile, /canonicalDashboardProvinceLabel/);
  assert.match(dataFile, /buildWeeklyCoefficientTree/);
  assert.match(dataFile, /snapshotOrganizationName/);
});

test("dashboard exception and execution sections reuse current data sources before dedicated aggregate tables exist", () => {
  assert.match(dashboardPage, /getProductSegmentBattles/);
  assert.match(dashboardPage, /getAlerts/);
  assert.match(dashboardPage, /getOfflineStoreVisits/);
  assert.match(dashboardPage, /problemStoreCount/);
  assert.match(dashboardPage, /visitWeekKey/);
  assert.match(dashboardPage, /actualVisitCount/);
  assert.match(dashboardPage, /completionRate/);
  assert.match(dashboardPage, /normalizeExecutionOrganization/);
  assert.match(dashboardPage, /formatExecutionRegionLabel/);
  assert.match(dashboardPage, /formatLooseRegionText/);
});

test("dashboard region filters use structured store regions and ignore numeric legacy city values", () => {
  assert.match(dataFile, /offline_store_visits\(id,store_name,city,province,city_name,district/);
  assert.match(dataFile, /snapshotProvince/);
  assert.match(dataFile, /const visitRegionParts = visitRegion\(visit\)/);
  assert.match(dataFile, /const storeRegionParts = storeRegion\(store\)/);
  assert.match(dataFile, /regionLabel\(visitRegion\(visit\)\)/);
  assert.match(dataFile, /function cityLabelFromRegionSource\(source:/);
  assert.match(dataFile, /function storeRegionKeyLabel\(store:/);
  assert.match(dataFile, /const city = storeRegionKeyLabel\(store\)/);
  assert.match(dataFile, /cityLabelFromRegionSource\(store\)/);
  assert.match(dataFile, /cityLabelFromRegionSource\(visit\)/);
  assert.match(dataFile, /cityLabelFromRegionSource\(\{ city: item\.city \}\)/);
  assert.match(dataFile, /city:\s+cityLabelFromRegionSource\(visit\) \?\? visit\.city/);
  assert.match(dataFile, /city:\s+cityLabelFromRegionSource\(\{ city: upload\.city \}\) \?\? upload\.city/);
  assert.match(dataFile, /const city = cityLabelFromRegionSource\(visit\)/);
  assert.match(dataFile, /query = query\.or\(`store_name\.ilike\.\%\$\{q\}\%,city_name\.ilike\.\%\$\{q\}\%,city\.ilike\.\%\$\{q\}\%,uploader_name\.ilike\.\%\$\{q\}\%`\)/);
  assert.match(dataFile, /cleanRegionText\(visit\?\.province\)/);
  assert.match(dataFile, /snapshotRegionParts\(snapshot\)/);
  assert.match(dataFile, /visitRegionParts\.province \?\? storeRegionParts\.province/);
  assert.match(dataFile, /visitRegionParts\.cityName \?\? storeRegionParts\.cityName/);
  assert.match(dataFile, /visitRegionParts\.district \?\? storeRegionParts\.district/);
  assert.doesNotMatch(dataFile, /byName\.size === 0 && shouldFlagSegment/);
  assert.match(pricesPage, /cleanDisplayText\(visit\?\.city_name\) \?\? cleanDisplayText\(store\?\.city_name\) \?\? legacyRegion\.cityName \?\? cleanDisplayText\(visit\?\.city\) \?\? cleanDisplayText\(store\?\.city\)/);
  assert.match(priceSnapshotsTable, /cleanDisplayText\(visit\?\.city_name\) \?\? cleanDisplayText\(store\?\.city_name\) \?\? legacyRegion\.cityName \?\? cleanDisplayText\(visit\?\.city\) \?\? cleanDisplayText\(store\?\.city\)/);
  assert.match(storeMasterTable, /store\.city_name \?\? store\.city \?\? "-"/);
});

test("prices accepts dashboard drilldown filters", () => {
  assert.match(dataFile, /params\.set\("brand", input\.brand\)/);
  assert.match(dataFile, /params\.set\("sku", input\.sku\)/);
  assert.match(pricesPage, /createdFrom\?: string/);
  assert.match(pricesPage, /createdTo\?: string/);
  assert.match(pricesPage, /matchesCreatedFrom\(snapshot\.captured_at, params\.createdFrom\)/);
  assert.match(pricesPage, /matchesCreatedTo\(snapshot\.captured_at, params\.createdTo\)/);
  assert.match(pricesPage, /const resolvedBrand = resolveOptionValue\(brandSeriesOptions, params\.brand\)/);
  assert.match(pricesPage, /const capturedToExclusive = toExclusiveCapturedTo\(params\.createdTo\)/);
  assert.match(pricesPage, /getPriceSnapshots\(\{\s*capturedFrom: params\.createdFrom \|\| undefined,/);
  assert.match(pricesPage, /capturedTo: capturedToExclusive \?\? undefined,/);
  assert.match(pricesPage, /defaultValue=\{resolvedBrand \?\? \"\"\}/);
  assert.match(pricesPage, /brand: resolvedBrand \?\? params\.brand/);
  assert.match(pricesPage, /province\?: string/);
  assert.match(pricesPage, /cityName\?: string/);
  assert.match(pricesPage, /district\?: string/);
  assert.match(pricesPage, /store\?: string/);
});

test("real market price filters use primary and collapsible advanced groups", () => {
  assert.match(pricesPage, /const hasAdvancedFilters =/);
  assert.match(pricesPage, /<PriceDateRangeFilter/);
  assert.match(pricesPage, /<details open=\{hasAdvancedFilters \|\| undefined\}/);
  assert.match(pricesPage, /<summary[\s\S]*SlidersHorizontal/);
  for (const name of ["brand", "priceBand", "size", "createdFrom", "createdTo", "province", "cityName", "district", "store", "sku", "visitCode"]) {
    assert.match(pricesPage, new RegExp(`name="${name}"`));
  }
});
