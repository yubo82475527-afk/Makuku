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
  assert.match(appShell, /Market Benchmarks/);
  assert.match(appShell, /Master Data/);
  assert.match(appShell, /Product Master/);
  assert.match(appShell, /Store Master/);
  assert.match(appShell, /User Management/);
  assert.doesNotMatch(appShell, /SKU Price Monitor/);
  assert.doesNotMatch(appShell, /Executive Board/);
});

test("market benchmark schema and page exist", () => {
  assert.equal(existsSync("src/app/[locale]/market-benchmarks/page.tsx"), true);
  assert.equal(existsSync("src/app/api/market-benchmarks/route.ts"), true);
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

test("dashboard is the weekly price coefficient board with month and region filters", () => {
  assert.match(dashboardPage, /Weekly Price Coefficient/);
  assert.match(dashboardPage, /WeeklyPriceCoefficientTable/);
  assert.match(dashboardPage, /month/);
  assert.match(dashboardPage, /ownSeries/);
  assert.match(dashboardPage, /sku/);
  assert.match(dashboardPage, /benchmarkRuleId/);
  assert.match(dashboardPage, /region/);
  assert.match(dataFile, /region: "NASIONAL"/);
  assert.match(dashboardPage, /PRICE\/PCS \{week\.label\}/);
  assert.match(dashboardPage, /COEFFICIENT/);
  assert.doesNotMatch(dashboardPage, /PriorityActionCard/);
  assert.doesNotMatch(dashboardPage, /Today Priority Actions/);
});

test("dashboard derived data calculates weekly coefficients from own and benchmark averages", () => {
  assert.match(typesFile, /WeeklyPriceCoefficientBoard/);
  assert.match(typesFile, /WeeklyPriceCoefficientCell/);
  assert.match(dataFile, /getWeeklyPriceCoefficientBoard/);
  assert.match(dataFile, /buildWeeklyPriceCoefficientBoard/);
  assert.match(dataFile, /monthWeeks/);
  assert.match(dataFile, /averageOrNull/);
  assert.match(dataFile, /benchmarkRuleLabel/);
  assert.match(dataFile, /snapshotMatchesBenchmarkRegion/);
  assert.match(dataFile, /ownAvgPrice \/ benchmarkAvgPrice/);
  assert.match(dataFile, /material_master/);
  assert.match(dataFile, /market_benchmark_rules/);
});

test("dashboard region filters use structured store regions and ignore numeric legacy city values", () => {
  assert.match(dataFile, /offline_store_visits\(id,store_name,city,province,city_name,district/);
  assert.match(dataFile, /snapshotProvince/);
  assert.match(dataFile, /snapshotMatchesBenchmarkRegion/);
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
  assert.match(dataFile, /sameLoose\(province, rule\.province\)/);
  assert.match(dataFile, /sameLoose\(cityName, rule\.city_name\)/);
  assert.match(dataFile, /sameLoose\(district, rule\.district\)/);
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
  assert.match(pricesPage, /province\?: string/);
  assert.match(pricesPage, /cityName\?: string/);
  assert.match(pricesPage, /district\?: string/);
  assert.match(pricesPage, /store\?: string/);
});
