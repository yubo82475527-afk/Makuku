import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const appShell = readFileSync("src/components/app-shell.tsx", "utf8");
const rootLayout = readFileSync("src/app/layout.tsx", "utf8");
const demoData = readFileSync("src/lib/demo-data.ts", "utf8");
const dashboardPage = readFileSync("src/app/[locale]/dashboard/page.tsx", "utf8");
const pricesPage = readFileSync("src/app/[locale]/prices/page.tsx", "utf8");
const typesFile = readFileSync("src/lib/types.ts", "utf8");
const dataFile = readFileSync("src/lib/data.ts", "utf8");
const promoEventsPage = readFileSync("src/app/[locale]/promo-events/page.tsx", "utf8");
const priceSnapshotsTable = existsSync("src/components/price-snapshots-table.tsx")
  ? readFileSync("src/components/price-snapshots-table.tsx", "utf8")
  : "";
const priceSnapshotsRoute = readFileSync("src/app/api/price-snapshots/route.ts", "utf8");
const priceSnapshotsExportRoute = readFileSync("src/app/api/price-snapshots/export/route.ts", "utf8");
const priceSnapshotBusiness = readFileSync("src/lib/price-snapshot-business.ts", "utf8");

test("board navigation exposes the one-week product workflow", () => {
  assert.match(appShell, /Dashboard/);
  assert.match(appShell, /Price Monitoring/);
  assert.match(appShell, /Real Market Price/);
  assert.match(appShell, /真实市场价格|\\u771f\\u5b9e\\u5e02\\u573a\\u4ef7\\u683c/);
  assert.match(appShell, /Photo Price Review/);
  assert.match(appShell, /Price Positioning/);
  assert.match(appShell, /Competitor Mapping/);
  assert.match(appShell, /Master Data/);
  assert.match(appShell, /Product Master/);
  assert.match(appShell, /Store Master/);
  assert.match(appShell, /User Management/);
  assert.match(appShell, /\/offline-stores/);
  assert.match(appShell, /\/competitor-mappings/);
  assert.doesNotMatch(appShell, /\/market-benchmarks/);
  assert.doesNotMatch(appShell, /Market Benchmarks/);

  assert.doesNotMatch(appShell, /Operating Queue/);
  assert.doesNotMatch(appShell, /SKU Price Monitor/);
  assert.doesNotMatch(appShell, /AI Debug/);
  assert.doesNotMatch(appShell, /TikTok Phase 2|tiktokPhase2/);
  assert.doesNotMatch(appShell, /Channels|channels/);
  assert.doesNotMatch(appShell, /Competitors"/);
  assert.doesNotMatch(appShell, /Alerts|alerts/);
});

test("mobile screens keep access to the board navigation", () => {
  assert.match(appShell, /lg:hidden/);
  assert.match(appShell, /mobileNavLabel/);
  assert.match(appShell, /<summary/);
});

test("desktop sidebar can collapse to an icon rail and persist the choice", () => {
  assert.match(appShell, /"use client"/);
  assert.match(appShell, /makuku_sidebar_collapsed/);
  assert.match(appShell, /localStorage\.getItem/);
  assert.match(appShell, /localStorage\.setItem/);
  assert.match(appShell, /sidebarCollapsed/);
  assert.match(appShell, /lg:pl-\[64px\]/);
  assert.match(appShell, /w-\[64px\]/);
  assert.match(appShell, /aria-label=\{sidebarToggleLabel\}/);
  assert.match(appShell, /title=\{item\.label\[locale\]\}/);
});

test("root layout avoids build-time Google font network fetches", () => {
  assert.doesNotMatch(rootLayout, /next\/font\/google/);
  assert.match(rootLayout, /className="h-full antialiased"/);
});

test("visible sample data does not look like throwaway mock data", () => {
  assert.doesNotMatch(demoData, /name: "Demo/);
  assert.doesNotMatch(demoData, /address: "Demo address"/);
  assert.doesNotMatch(demoData, /source: "demo"/);
  assert.match(demoData, /source: "pilot-sample"/);
});

test("dashboard states the price 1.0 homepage objective", () => {
  assert.match(dashboardPage, /Price Index/);
  assert.match(dashboardPage, /Price Exception Follow-up/);
  assert.match(dashboardPage, /Promoter Execution/);
});

test("dashboard keeps the weekly coefficient board but is no longer a single-panel page", () => {
  assert.match(typesFile, /export type WeeklyPriceCoefficientBoard/);
  assert.match(typesFile, /export type WeeklyPriceCoefficientCell/);
  assert.match(typesFile, /export type WeeklyPriceCoefficientCompetitorSeries/);
  assert.match(dataFile, /export async function getWeeklyPriceCoefficientBoard/);
  assert.match(dataFile, /getCompetitorSeriesMappings/);
  assert.match(dataFile, /is_default_benchmark/);
  assert.match(dataFile, /materialMaster\.map\(\(item\) => cleanText\(item\.sub_brand\)\)/);
  assert.match(dataFile, /ownAvgPrice \/ benchmarkAvgPrice/);
  assert.match(dashboardPage, /PriceIndexTreeTable/);
  assert.match(readFileSync("src/components/price-index-tree-table.tsx", "utf8"), /PRICE\/PCS \{week\.label\}/);
  assert.match(readFileSync("src/components/price-index-tree-table.tsx", "utf8"), /CombinedMetricCell/);
  assert.match(readFileSync("src/components/price-index-tree-table.tsx", "utf8"), /WEEK_COLUMN_CLASS/);
  assert.match(readFileSync("src/components/price-index-tree-table.tsx", "utf8"), /competitorSeries/);
  assert.match(dashboardPage, /name="month"/);
  assert.match(dashboardPage, /name="organization"/);
  assert.match(dashboardPage, /name="ownSeries"/);
  assert.doesNotMatch(dashboardPage, /name="sku"/);
  assert.doesNotMatch(dashboardPage, /name="benchmarkRuleId"/);
  assert.match(dashboardPage, /Exception Follow-up/);
  assert.match(dashboardPage, /Promoter Execution/);
  assert.match(dashboardPage, /flattenProblemStoreRows/);
  assert.match(dashboardPage, /buildExecutionBoard/);
});

test("dashboard serves the product board directly instead of a loading shell", () => {
  assert.equal(existsSync("src/app/[locale]/dashboard/loading.tsx"), false);
});

test("prices table is store-region focused without manual snapshot entry", () => {
  assert.match(pricesPage, /line\?: string/);
  assert.match(pricesPage, /size\?: string/);
  assert.match(pricesPage, /priceBand\?: string/);
  assert.match(pricesPage, /province\?: string/);
  assert.match(pricesPage, /cityName\?: string/);
  assert.match(pricesPage, /district\?: string/);
  assert.match(pricesPage, /store\?: string/);
  assert.match(pricesPage, /params\.line/);
  assert.match(pricesPage, /params\.size/);
  assert.match(pricesPage, /priceSnapshotBusinessSegment/);
  assert.match(pricesPage, /priceSnapshotBusinessSize/);
  assert.match(priceSnapshotBusiness, /priceSnapshotBenchmarkSku/);
  assert.match(priceSnapshotBusiness, /priceSnapshotBusinessSegment/);
  assert.match(priceSnapshotBusiness, /priceSnapshotBusinessSize/);
  assert.match(pricesPage, /storeRegionForSnapshot/);
  assert.match(pricesPage, /storeNameForSnapshot/);
  assert.match(priceSnapshotsTable, /formatSnapshotCapturedAt/);
  assert.match(priceSnapshotsTable, /visit_date/);
  assert.match(priceSnapshotsTable, /uploaderNameForSnapshot/);
  assert.match(priceSnapshotsTable, /采集人/);
  assert.match(priceSnapshotsTable, /formatSnapshotCreatedAt/);
  assert.match(priceSnapshotsTable, /创建时间/);
  assert.match(priceSnapshotsTable, /Create Time/);
  assert.equal(existsSync("src/components/price-snapshots-table.tsx"), true);
  assert.match(pricesPage, /PriceSnapshotsTable/);
  assert.match(priceSnapshotsTable, /selectedIds/);
  assert.match(priceSnapshotsTable, /deleteSelected/);
  assert.match(priceSnapshotsTable, /fetch\("\/api\/price-snapshots"/);
  assert.match(priceSnapshotsTable, /method: "DELETE"/);
  assert.match(priceSnapshotsTable, /ConfirmDeletePanel/);
  assert.match(priceSnapshotsRoute, /export async function DELETE/);
  assert.match(priceSnapshotsRoute, /\.from\("price_snapshots"\)\s*\.delete\(\)/s);
  assert.match(dataFile, /offline_store_visits\(id,store_name,city,province,city_name,district,channel_type,visit_date,uploader_name/);
  assert.match(dataFile, /competitorProductSegment/);
  assert.match(pricesPage, /name="province"/);
  assert.match(pricesPage, /name="cityName"/);
  assert.match(pricesPage, /name="district"/);
  assert.match(pricesPage, /name="store"/);
  assert.match(pricesPage, /name="brand"/);
  assert.match(pricesPage, /currentParams\.set\("locale", locale\)/);
  assert.doesNotMatch(pricesPage, /name="owner"/);
  assert.doesNotMatch(pricesPage, /name="channel"/);
  assert.doesNotMatch(pricesPage, /currentParams\.set\("owner"/);
  assert.doesNotMatch(pricesPage, /currentParams\.set\("channel"/);
  assert.doesNotMatch(pricesPage, /name="line"/);
  assert.doesNotMatch(pricesPage, /dict\.prices\.promoType/);
  assert.doesNotMatch(pricesPage, /PriceSnapshotActions/);
  assert.equal(existsSync("src/app/[locale]/prices/loading.tsx"), false);
});

test("price snapshot CSV export follows the current language and table columns", () => {
  assert.match(priceSnapshotsExportRoute, /searchParams\.get\("locale"\) === "zh"/);
  assert.match(priceSnapshotsExportRoute, /"采集时间"/);
  assert.match(priceSnapshotsExportRoute, /"门店名称"/);
  assert.match(priceSnapshotsExportRoute, /"采集人"/);
  assert.match(priceSnapshotsExportRoute, /"创建时间"/);
  assert.match(priceSnapshotsExportRoute, /"Captured"/);
  assert.match(priceSnapshotsExportRoute, /"Collector"/);
  assert.match(priceSnapshotsExportRoute, /"Create Time"/);
  assert.match(priceSnapshotsExportRoute, /"SKU"/);
  assert.match(priceSnapshotsExportRoute, /"Grade"/);
  assert.match(priceSnapshotsExportRoute, /"Spec"/);
  assert.match(priceSnapshotsExportRoute, /formatSnapshotCreatedAt\(snapshot\)/);
  assert.doesNotMatch(priceSnapshotsExportRoute, /channelLabel\(snapshot\.channel, locale\)/);
  assert.doesNotMatch(priceSnapshotsExportRoute, /"Channel"/);
  assert.doesNotMatch(priceSnapshotsExportRoute, /searchParams\.get\("channel"\)/);
  assert.doesNotMatch(priceSnapshotsExportRoute, /snapshot\.channel !== channel/);
  assert.doesNotMatch(priceSnapshotsExportRoute, /"snapshot_id"/);
  assert.doesNotMatch(priceSnapshotsExportRoute, /"price_per_piece"/);
});

test("opportunity feed stays available but is not the board entry point", () => {
  assert.match(promoEventsPage, /OpportunityQueueTabs/);
  assert.match(promoEventsPage, /OpportunityTaskCard/);
  assert.match(promoEventsPage, /pending_review|capture_needed|completed/);
});
