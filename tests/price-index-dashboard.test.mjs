import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const nextConfig = readFileSync("next.config.ts", "utf8");
const priceSnapshotListQueryIndexes = readFileSync("supabase/migrations/202607100001_price_snapshot_list_query_indexes.sql", "utf8");
const dashboardPriceIndexQueryIndexes = existsSync("supabase/migrations/202607200002_dashboard_price_index_query_indexes.sql")
  ? readFileSync("supabase/migrations/202607200002_dashboard_price_index_query_indexes.sql", "utf8")
  : "";
const appShell = readFileSync("src/components/app-shell.tsx", "utf8");
const localeShellLayout = readFileSync("src/components/locale-shell-layout.tsx", "utf8");
const dashboardPage = readFileSync("src/app/[locale]/dashboard/page.tsx", "utf8");
const dashboardClient = existsSync("src/components/dashboard-client.tsx")
  ? readFileSync("src/components/dashboard-client.tsx", "utf8")
  : "";
const dashboardContent = existsSync("src/components/dashboard-content.tsx")
  ? readFileSync("src/components/dashboard-content.tsx", "utf8")
  : "";
const dashboardData = existsSync("src/lib/dashboard-data.ts")
  ? readFileSync("src/lib/dashboard-data.ts", "utf8")
  : "";
const dashboardRoute = existsSync("src/app/api/dashboard/route.ts")
  ? readFileSync("src/app/api/dashboard/route.ts", "utf8")
  : "";
const priceIndexTable = existsSync("src/components/price-index-tree-table.tsx")
  ? readFileSync("src/components/price-index-tree-table.tsx", "utf8")
  : "";
const priceSnapshotLinkedFilters = existsSync("src/components/price-snapshot-linked-filters.tsx")
  ? readFileSync("src/components/price-snapshot-linked-filters.tsx", "utf8")
  : "";
const pricesPage = readFileSync("src/app/[locale]/prices/page.tsx", "utf8");
const priceExportRoute = [
  readFileSync("src/app/api/price-snapshots/export/route.ts", "utf8"),
  readFileSync("src/lib/price-snapshot-export.ts", "utf8"),
].join("\n");
const photoReviewPage = readFileSync("src/app/[locale]/offline-price-candidates/page.tsx", "utf8");
const dataFile = readFileSync("src/lib/data.ts", "utf8");
const typesFile = readFileSync("src/lib/types.ts", "utf8");
const reverseRoute = readFileSync("src/app/api/location/reverse/route.ts", "utf8");
const offlineStoresRoute = readFileSync("src/app/api/offline-stores/route.ts", "utf8");
const priceSnapshotsTable = readFileSync("src/components/price-snapshots-table.tsx", "utf8");
const storeMasterTable = readFileSync("src/components/store-master-table.tsx", "utf8");

test("app shell groups the backend navigation for price positioning and master data", () => {
  assert.match(appShell, /Dashboard/);
  assert.match(appShell, /Price Monitoring/);
  assert.match(appShell, /鐪熷疄甯傚満浠锋牸|Real Market Price/);
  assert.match(appShell, /Price Anomaly Review/);
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

test("dashboard entrypoint mounts only the client-loaded price index", () => {
  assert.match(dashboardPage, /DashboardClient/);
  assert.doesNotMatch(dashboardPage, /Dashboard under refactor/);
  assert.doesNotMatch(dashboardPage, /getWeeklyPriceCoefficientBoard/);
  assert.doesNotMatch(dashboardPage, /getProductSegmentBattles/);
  assert.doesNotMatch(dashboardPage, /getAlerts/);
  assert.doesNotMatch(dashboardPage, /getOfflineStoreVisits/);
  assert.doesNotMatch(dashboardPage, /Promise\.all/);
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
  assert.match(readFileSync("src/components/price-index-tree-table.tsx", "utf8"), /series\.isBenchmark \? \(isZh \? "（标杆）" : " \(Benchmark\)"\) : ""/);
  assert.match(dataFile, /material_master/);
  assert.match(dataFile, /canonicalDashboardProvinceLabel/);
  assert.match(dataFile, /buildWeeklyCoefficientTree/);
  assert.match(dataFile, /snapshotOrganizationName/);
});

test("dashboard organization selection matches normalized labels", () => {
  assert.match(dataFile, /function selectDashboardTextOption\(/);
  assert.match(dataFile, /function matchesDashboardText\(/);
  assert.match(dataFile, /const selectedOrganization = selectDashboardTextOption\(input\.filters\.organization, organizationOptions\)/);
  assert.match(dataFile, /matchesDashboardText\(snapshotOrganizationName\(snapshot\), selectedOrganization\)/);
  assert.match(dataFile, /\.ilike\("name", organizationName\)/);
});

test("dashboard price API normalizes and forwards requested dimension order", () => {
  const dimensions = readFileSync("src/lib/price-index-dimensions.ts", "utf8");
  assert.match(dashboardData, /normalizePriceIndexDimensions\(query\.dimensions\)/);
  assert.match(dashboardRoute, /"dimensions"/);
  assert.match(typesFile, /export type WeeklyPriceCoefficientNodeLevel = "organization" \| "province" \| "city" \| "district" \| "size" \| "sku"/);
  assert.match(typesFile, /dimensions: WeeklyPriceCoefficientNodeLevel\[\]/);
  assert.match(dimensions, /DEFAULT_PRICE_INDEX_DIMENSIONS/);
  assert.match(dimensions, /"size"/);
});

test("weekly price tree is grouped by the requested dimensions without fixed level builders", () => {
  assert.match(dataFile, /function buildWeeklyCoefficientTree\(input:/);
  assert.match(dataFile, /dimensions: WeeklyPriceCoefficientNodeLevel\[\]/);
  assert.match(dataFile, /function buildWeeklyCoefficientRecords\(/);
  assert.match(dataFile, /size: weeklyCoefficientRecordSize\(/);
  assert.match(dataFile, /shape: weeklyCoefficientRecordShape\(/);
  assert.match(dataFile, /buildWeeklyCoefficientNodes\(/);
  assert.match(dataFile, /case "size":[\s\S]*return record\.size/);
  assert.match(dataFile, /case "size":[\s\S]*return \{ \.\.\.context, size: label \}/);
  assert.match(dataFile, /size: input\.size/);
  assert.doesNotMatch(dataFile, /function buildProvinceNodes\(/);
  assert.doesNotMatch(dataFile, /function buildCityNodes\(/);
  assert.doesNotMatch(dataFile, /function buildDistrictNodes\(/);
  assert.doesNotMatch(dataFile, /function buildSkuNodes\(/);
});

test("sku-level benchmark prices are broadcast by same size and product shape", () => {
  assert.match(dataFile, /function weeklyCoefficientBenchmarkRecordsForOwnGroup\(/);
  assert.match(dataFile, /if \(level !== "sku"\) return exactBenchmarkRecords/);
  assert.match(dataFile, /const broadcastKey = weeklyCoefficientBroadcastKey\(ownRecords\[0\]\)/);
  assert.match(dataFile, /input\.benchmarkRecords\.filter\(\(record\) => weeklyCoefficientBroadcastKey\(record\) === broadcastKey\)/);
  assert.match(dataFile, /function weeklyCoefficientBroadcastKey\(record: WeeklyCoefficientRecord\)/);
  assert.match(dataFile, /return `\$\{normalizeDashboardText\(record\.size\)\}\|\$\{record\.shape\}`/);
  assert.match(dataFile, /function weeklyCoefficientRecordShape\(/);
});

test("price index table renders selected dimensions instead of a fixed five-column hierarchy", () => {
  assert.match(priceIndexTable, /board\.dimensions\.map/);
  assert.match(priceIndexTable, /renderNodeRows\(node, expandedIds, toggle, activeLevels/);
  assert.match(priceIndexTable, /size: \{ label: isZh \? "\\u5c3a\\u7801" : "Size"/);
  assert.match(priceIndexTable, /case "size":[\s\S]*return node\.size/);
  assert.match(priceIndexTable, /size: \[\]/);
  assert.doesNotMatch(priceIndexTable, /const LEVELS: WeeklyPriceCoefficientNodeLevel\[\] = \["organization", "province", "city", "district", "sku"\]/);
});

test("dashboard page entrypoint still avoids server-side report queries", () => {
  assert.doesNotMatch(dashboardPage, /getWeeklyPriceCoefficientBoard/);
  assert.doesNotMatch(dashboardPage, /getProductSegmentBattles/);
  assert.doesNotMatch(dashboardPage, /getAlerts/);
  assert.doesNotMatch(dashboardPage, /getOfflineStoreVisits/);
  assert.doesNotMatch(dashboardPage, /Promise\.all/);
});

test("dashboard region filters use structured store regions and ignore numeric legacy city values", () => {
  assert.match(dataFile, /offline_store_visits!source_visit_id\(id,store_name,city,province,city_name,district/);
  assert.match(dataFile, /canonicalDashboardProvinceLabel\(region\.province \?\? "UNKNOWN"\)/);
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

test("prices accepts structured dashboard drilldown filters", () => {
  assert.match(dataFile, /params\.set\("brand", input\.brand\)/);
  assert.match(dataFile, /params\.set\("sku", input\.sku\)/);
  assert.match(dataFile, /params\.set\("organization", input\.organization\)/);
  assert.match(dataFile, /params\.set\("shape", input\.shape\)/);
  assert.match(pricesPage, /createdFrom\?: string/);
  assert.match(pricesPage, /createdTo\?: string/);
  assert.match(pricesPage, /const capturedToExclusive = toExclusiveCapturedTo\(params\.createdTo\)/);
  assert.match(pricesPage, /function toInclusiveCapturedFrom\(/);
  assert.match(pricesPage, /getPriceSnapshotsPage\(\{/);
  assert.match(pricesPage, /capturedTo: capturedToExclusive \?\? undefined,/);
  assert.match(pricesPage, /capturedFrom: toInclusiveCapturedFrom\(params\.createdFrom\) \?\? undefined,/);
  assert.match(pricesPage, /const owner = normalizeOwner\(params\.owner\)/);
  assert.match(pricesPage, /getPriceSnapshotsPage\(\{[\s\S]*owner,/);
  assert.match(pricesPage, /series: params\.series \|\| undefined/);
  assert.match(pricesPage, /province\?: string/);
  assert.match(pricesPage, /cityName\?: string/);
  assert.match(pricesPage, /district\?: string/);
  assert.match(pricesPage, /store\?: string/);
  assert.match(pricesPage, /organization\?: string/);
  assert.match(pricesPage, /owner\?: string/);
  assert.match(pricesPage, /series\?: string/);
  assert.match(pricesPage, /shape\?: string/);
  assert.match(pricesPage, /name="shape"/);
  assert.match(dataFile, /function shouldUseNormalizedPriceSnapshotPageFilters\(filters: PriceSnapshotPageFilters\)/);
  assert.match(dataFile, /function priceSnapshotVisitForFilters\(snapshot: PriceSnapshot\)/);
  assert.match(dataFile, /snapshot\.ai_price_candidates\?\.find\(\(candidate\) => candidate\.offline_store_visits\)\?\.offline_store_visits/);
  assert.match(dataFile, /priceSnapshotBrandForFilters\(snapshot\)/);
  assert.match(dataFile, /priceSnapshotSeriesForFilters\(snapshot, context\)/);
  assert.match(dataFile, /function priceSnapshotSizeForFilters\(/);
  assert.match(dataFile, /function priceSnapshotShapeForFilters\(/);
  assert.match(priceSnapshotLinkedFilters, /PriceSnapshotLinkedFilters/);
});

test("real market price separates ownership brand and series filters", () => {
  assert.match(dataFile, /export type PriceSnapshotFilterOptions/);
  assert.match(dataFile, /export async function getPriceSnapshotFilterOptions/);
  assert.match(dataFile, /series\?: string/);
  assert.match(dataFile, /filters\.series/);
  assert.match(dataFile, /isOwnMaterialBrandName/);
  assert.match(dataFile, /function priceSnapshotBrandForFilters\(snapshot: PriceSnapshot, context\?: PriceSnapshotPageFilterContext \| null\)/);
  assert.match(dataFile, /context\?\.materialByCode\.get\(materialCode\)/);
  assert.match(pricesPage, /getPriceSnapshotFilterOptions/);
  assert.match(priceSnapshotLinkedFilters, /name="owner"/);
  assert.match(priceSnapshotLinkedFilters, /name="brand"/);
  assert.match(priceSnapshotLinkedFilters, /name="series"/);
  assert.match(priceSnapshotLinkedFilters, /const brandOptions = brandsByOwner\[ownerValue\] \?\? \[\]/);
  assert.match(priceSnapshotLinkedFilters, /const seriesOptions = brandValue \? seriesByBrand\[brandValue\] \?\? \[\] : \[\]/);
  assert.match(priceSnapshotLinkedFilters, /const sizeOptions = brandValue \? sizesByBrand\[brandValue\] \?\? \[\] : sizesByOwner\[ownerValue\] \?\? \[\]/);
  assert.match(priceSnapshotLinkedFilters, /setBrandValue\(""\)/);
  assert.match(priceSnapshotLinkedFilters, /setSeriesValue\(""\)/);
  assert.match(priceSnapshotLinkedFilters, /setSizeValue\(""\)/);
  assert.doesNotMatch(pricesPage, /name="priceBand"/);
  assert.match(priceExportRoute, /series: filters\.series/);
  assert.doesNotMatch(priceExportRoute, /priceBand:/);
});

test("real market price filters use primary and collapsible advanced groups", () => {
  assert.match(pricesPage, /const hasAdvancedFilters =/);
  assert.match(pricesPage, /<PriceDateRangeFilter/);
  assert.match(pricesPage, /<details open=\{hasAdvancedFilters \|\| undefined\}/);
  assert.match(pricesPage, /<summary[\s\S]*SlidersHorizontal/);
  for (const name of ["createdFrom", "createdTo", "province", "cityName", "district", "store", "sku", "visitCode", "shape"]) {
    assert.match(pricesPage, new RegExp(`name="${name}"`));
  }
  for (const name of ["owner", "brand", "series", "size"]) {
    assert.match(priceSnapshotLinkedFilters, new RegExp(`name="${name}"`));
  }
});

test("real market price pagination and filters are pushed down to the data layer", () => {
  assert.match(pricesPage, /getPriceSnapshotsPage\(/);
  assert.doesNotMatch(pricesPage, /limit:\s*5000/);
  assert.doesNotMatch(pricesPage, /pricesResult\.data\.filter/);
  assert.doesNotMatch(pricesPage, /prices\.slice\(/);
  assert.match(dataFile, /export async function getPriceSnapshotsPage/);
  assert.equal((dataFile.match(/export async function getPriceSnapshotsPage/g) ?? []).length, 1);
  assert.match(dataFile, /count:\s*"planned"/);
  assert.match(dataFile, /priceSnapshotSelectForPageFilters/);
  assert.match(dataFile, /const shouldPostFilter = shouldUseNormalizedPriceSnapshotPageFilters\(filters\)/);
  assert.match(dataFile, /return \{ data: scanResult\.rows, total: scanResult\.total, page, perPage, error: null, isDemo: false \}/);
  assert.doesNotMatch(dataFile, /offline_store_visits!source_visit_id!inner/);
  assert.match(dataFile, /if \(filters\.brand\)/);
  assert.match(dataFile, /if \(filters\.province\)/);
  assert.match(dataFile, /if \(filters\.cityName\)/);
  assert.match(dataFile, /if \(filters\.district\)/);
  assert.match(dataFile, /if \(filters\.store\)/);
  assert.match(dataFile, /if \(filters\.sku\)/);
  assert.match(dataFile, /if \(filters\.visitCode\)/);
  assert.match(dataFile, /return \{ data: candidates, total: count \?\? 0/);
  assert.match(priceSnapshotListQueryIndexes, /idx_price_snapshots_list_order/);
  assert.match(priceSnapshotListQueryIndexes, /idx_price_snapshots_captured_list_order/);
  assert.match(priceSnapshotListQueryIndexes, /idx_price_snapshots_competitor_list_order/);
  assert.match(priceSnapshotListQueryIndexes, /idx_price_snapshots_makuku_list_order/);
});

test("real market price post filters scan all candidate pages with bounded memory", () => {
  assert.match(dataFile, /const priceSnapshotPageFilterScanPageSize = 1000/);
  assert.doesNotMatch(dataFile, /priceSnapshotPageFilterScanLimit/);
  assert.match(dataFile, /const scanFilteredPageWithSelect = async \(select: string\) =>/);
  assert.match(dataFile, /buildQuery\(select, "scan", scanFrom, scanFrom \+ priceSnapshotPageFilterScanPageSize - 1\)/);
  assert.match(dataFile, /const candidates = filterPriceSnapshotPageRows\(pageRows, filters, filterContext\)/);
  assert.match(dataFile, /if \(matchedCount >= from && matchedCount <= to\) rows\.push\(candidate\)/);
  assert.doesNotMatch(dataFile, /const rows: PriceSnapshot\[\] = \[\];\s*let scanFrom/);
  const pageQuerySource = dataFile.slice(
    dataFile.indexOf("export async function getPriceSnapshotsPage"),
    dataFile.indexOf("function priceSnapshotSelectForPageFilters"),
  );
  assert.doesNotMatch(pageQuerySource, /rows\.push\(\.\.\.pageRows\)/);
  assert.match(dataFile, /return \{ data: scanResult\.rows, total: scanResult\.total, page, perPage, error: null, isDemo: false \}/);
});

test("real market price narrows organization and competitor source before post filtering", () => {
  assert.match(dataFile, /const queryScope = await buildPriceSnapshotPageQueryScope\(filters, supabase, filterContext\)/);
  assert.match(dataFile, /if \(queryScope\.storeIds\) query = query\.in\("offline_store_id", queryScope\.storeIds\)/);
  assert.match(dataFile, /if \(queryScope\.competitorProductIds\) query = query\.in\("competitor_product_id", queryScope\.competitorProductIds\)/);
  assert.match(dataFile, /if \(queryScope\.ownMaterialCodes\) query = query\.in\("material_sku_code", queryScope\.ownMaterialCodes\)/);
  assert.match(dataFile, /function buildPriceSnapshotPageQueryScope\(/);
  assert.match(dataFile, /ownMaterialCodes/);
  assert.match(dataFile, /function priceSnapshotStoreIdsForOrganization\(/);
  assert.match(dataFile, /function priceSnapshotCompetitorProductIdsForBrand\(/);
  assert.match(dataFile, /filters\.owner === "competitor"/);
  assert.match(dataFile, /isOwnMaterialBrandName\(productBrand, ownBrandKeys\)/);
  assert.match(dataFile, /select\("id,product_series,status,brands\(name\)"/);
});

test("real market price excludes own material brands from competitor results", () => {
  assert.match(dataFile, /function isOwnMaterialBrandName\(/);
  assert.match(dataFile, /owner === "competitor"/);
  assert.match(dataFile, /!isOwnMaterialBrandName\(priceSnapshotBrandForFilters\(snapshot\), context\.ownBrandKeys\)/);
});

test("price index drill-through keeps the dashboard calendar sample scope", () => {
  assert.match(dataFile, /priceIndexDrill\?: boolean/);
  assert.match(dataFile, /if \(filters\.priceIndexDrill && !snapshotMatchesPriceIndexDrillPeriod\(snapshot, filters\)\) return false/);
  assert.match(dataFile, /function snapshotMatchesPriceIndexDrillPeriod\(/);
  assert.match(dataFile, /const capturedDate = dateKey\(new Date\(snapshot\.captured_at\)\)/);
  assert.match(dataFile, /params\.set\("priceIndexDrill", "1"\)/);
  assert.match(pricesPage, /priceIndexDrill\?: string/);
  assert.match(pricesPage, /dashboardDateFrom: params\.createdFrom \|\| undefined/);
  assert.match(pricesPage, /dashboardDateTo: params\.createdTo \|\| undefined/);
  assert.match(pricesPage, /<HiddenFilter name="priceIndexDrill" value=\{params\.priceIndexDrill\} \/>/);
});

test("dashboard drill-through sends structured ownership brand and series filters", () => {
  assert.match(dataFile, /params\.set\("owner", input\.owner\)/);
  assert.match(dataFile, /params\.set\("series", input\.series\)/);
  assert.match(dataFile, /params\.set\("ownSeries", input\.ownSeries\)/);
  assert.match(dataFile, /owner: "makuku"/);
  assert.match(dataFile, /owner: "competitor"/);
  assert.match(dataFile, /series: input\.selectedOwnSeries/);
  assert.match(dataFile, /brand: series\.brand/);
  assert.match(dataFile, /series: series\.series/);
});

test("price snapshot export reuses the list scope, including dashboard drill-through filters", () => {
  assert.match(priceExportRoute, /import \{ getPriceSnapshotsPage, type PriceSnapshotOwnerFilter \} from "@\/lib\/data"/);
  assert.match(priceExportRoute, /await getPriceSnapshotsPage\(\{/);
  assert.match(priceExportRoute, /owner: filters\.owner \?\? "all"/);
  assert.match(priceExportRoute, /series: filters\.series/);
  assert.match(priceExportRoute, /ownSeries: filters\.ownSeries/);
  assert.match(priceExportRoute, /organization: filters\.organization/);
  assert.match(priceExportRoute, /priceIndexDrill: filters\.priceIndexDrill/);
  assert.match(priceExportRoute, /dashboardDateFrom: filters\.dashboardDateFrom \?\? filters\.createdFrom/);
  assert.match(priceExportRoute, /dashboardDateTo: filters\.dashboardDateTo \?\? filters\.createdTo/);
  assert.match(priceExportRoute, /capturedFrom: toInclusiveCapturedFrom\(filters\.createdFrom\) \?\? undefined/);
  assert.match(priceExportRoute, /function toInclusiveCapturedFrom\(/);
  assert.match(priceExportRoute, /const date = new Date\(`\$\{text\}T00:00:00`\)/);
  assert.match(priceExportRoute, /perPage: priceSnapshotExportBatchSize/);
  assert.doesNotMatch(priceExportRoute, /\.from\("price_snapshots"\)/);
  assert.match(dataFile, /const shouldScan = shouldPostFilter \|\| perPage > 200/);
  assert.match(pricesPage, /<InlineTextFilter name="organization"/);
  assert.match(priceSnapshotLinkedFilters, /name="series"/);
  assert.match(pricesPage, /<HiddenFilter name="ownSeries" value=\{params\.ownSeries\} \/>/);
});

test("dashboard price index avoids loading unrelated snapshot relationships", () => {
  const boardQuerySource = dataFile.slice(
    dataFile.indexOf("async function getWeeklyBoardSnapshotsForPeriod"),
    dataFile.indexOf("export async function getProductSegmentPriceIndexBattles"),
  );
  assert.match(boardQuerySource, /competitor_products\(id,brand_id,product_series,raw_title,normalized_name,size,piece_count,pack_type,brands\(id,name\)\)/);
  assert.doesNotMatch(boardQuerySource, /ai_price_candidates\(/);
  assert.doesNotMatch(boardQuerySource, /sku_master\(material_sku_code\)/);
  assert.equal(existsSync("supabase/migrations/202607200002_dashboard_price_index_query_indexes.sql"), true);
  assert.match(dashboardPriceIndexQueryIndexes, /idx_price_snapshots_dashboard_makuku_period/);
  assert.match(dashboardPriceIndexQueryIndexes, /material_sku_code, captured_at desc, created_at desc, id asc/);
  assert.match(dashboardPriceIndexQueryIndexes, /idx_price_snapshots_dashboard_competitor_period/);
  assert.match(dashboardPriceIndexQueryIndexes, /competitor_product_id, captured_at desc, created_at desc, id asc/);
  assert.match(boardQuerySource, /const visitRegionSelect = filters\.includeVisitRegion/);
  assert.match(dataFile, /dimensions\.some\(\(level\) => level === "province" \|\| level === "city" \|\| level === "district"\)/);
});

test("dashboard loads snapshot pages with bounded concurrency", () => {
  assert.match(dataFile, /const dashboardSnapshotPageConcurrency = 4/);
  assert.match(dataFile, /function getAllWeeklyBoardSnapshotPages\(/);
  assert.match(dataFile, /const remainingPages = await Promise\.all\(/);
  assert.match(dataFile, /pageIndex \+= dashboardSnapshotPageConcurrency/);
});

test("next config keeps instant navigation tooling without enabling cacheComponents on dynamic routes", () => {
  assert.match(nextConfig, /instantNavigationDevToolsToggle:\s*true/);
  assert.doesNotMatch(nextConfig, /cacheComponents:\s*true/);
});

test("backend shell no longer fetches header session on the client", () => {
  assert.doesNotMatch(appShell, /fetch\("\/api\/auth\/session"\)/);
  assert.match(appShell, /headerUser\?: HeaderUser \| null/);
  assert.match(appShell, /headerUser=\{/);
});

test("dashboard and prices expose streaming loading states for fast shell transitions", () => {
  assert.equal(existsSync("src/app/[locale]/dashboard/loading.tsx"), true);
  assert.equal(existsSync("src/app/[locale]/prices/loading.tsx"), true);
  assert.equal(existsSync("src/app/[locale]/offline-price-candidates/loading.tsx"), true);
});

test("dashboard client loads only price index and aborts stale homepage requests", () => {
  assert.match(dashboardPage, /DashboardClient/);
  assert.match(dashboardClient, /AbortController/);
  assert.match(dashboardClient, /controller\.abort\(\)/);
  assert.match(dashboardClient, /params\.set\("section", "price"\)/);
  assert.match(dashboardClient, /PriceIndexSection/);
  assert.doesNotMatch(dashboardClient, /ExceptionSection/);
  assert.doesNotMatch(dashboardClient, /ExecutionSection/);
  assert.doesNotMatch(dashboardClient, /section:\s*string/);
  assert.doesNotMatch(dashboardClient, /setExceptionPayload/);
  assert.doesNotMatch(dashboardClient, /setExecutionPayload/);
  assert.doesNotMatch(dashboardClient, /section=exceptions|section=execution/);
  assert.equal(typeof dashboardClient, "string");
  assert.equal(typeof dashboardContent, "string");
  assert.equal(typeof dashboardData, "string");
  assert.equal(typeof dashboardRoute, "string");
});

test("dashboard price index removes the competitor mapping quick entry", () => {
  assert.doesNotMatch(dashboardContent, /from "next\/link"/);
  assert.doesNotMatch(dashboardContent, /competitor-mappings/);
  assert.doesNotMatch(dashboardContent, /Maintain competitor mapping/);
});

test("dashboard price index filters follow the price review filter shell and place column setup after query", () => {
  const formStart = dashboardContent.indexOf(
    '<QueryForm className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(180px,220px)_minmax(220px,280px)_minmax(240px,320px)_minmax(120px,180px)_minmax(120px,180px)]">',
  );
  assert.notEqual(formStart, -1);
  const formEnd = dashboardContent.indexOf("</QueryForm>", formStart);
  assert.notEqual(formEnd, -1);
  const filterForm = dashboardContent.slice(formStart, formEnd);

  assert.match(
    dashboardContent,
    /flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm/,
  );
  assert.match(filterForm, /<MonthFilter/);
  assert.match(filterForm, /<OrganizationFilter/);
  assert.match(filterForm, /<OwnSeriesFilter/);
  assert.match(filterForm, /<QuerySubmitButton[\s\S]*className="min-h-10"/);
  assert.match(filterForm, /<PriceIndexLayoutDialog[\s\S]*dimensions=\{dimensions\}/);
  assert.ok(filterForm.indexOf("<QuerySubmitButton") < filterForm.indexOf("<PriceIndexLayoutDialog"));
});

test("photo price review uses the same client-side shell navigation path as the other backend pages", () => {
  assert.doesNotMatch(photoReviewPage, /export const dynamic = "force-dynamic"/);
  assert.doesNotMatch(dashboardPage, /export const dynamic = "force-dynamic"/);
  assert.match(appShell, /href=\{`\/\$\{locale\}\$\{item\.href\}`\}/);
});

test("locale shell keeps backend pages inside the shared shell and bypasses login and mobile capture", () => {
  assert.match(localeShellLayout, /shouldBypassShell/);
  assert.match(localeShellLayout, /login\|mobile\\\/offline-capture/);
  assert.match(localeShellLayout, /<AppShell/);
});
