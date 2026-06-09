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

test("app shell groups the backend navigation for price positioning and master data", () => {
  assert.match(appShell, /Dashboard/);
  assert.match(appShell, /价格监控|Price Monitoring/);
  assert.match(appShell, /SKU价格监控|SKU Price Monitor/);
  assert.match(appShell, /照片价格复核|Photo Price Review/);
  assert.match(appShell, /价格定位管理|Price Positioning/);
  assert.match(appShell, /竞品映射管理|Competitor Mapping/);
  assert.match(appShell, /市场标杆管理|Market Benchmarks/);
  assert.match(appShell, /主数据|Master Data/);
  assert.match(appShell, /产品主数据|Product Master/);
  assert.match(appShell, /门店主数据|Store Master/);
  assert.match(appShell, /用户管理|User Management/);
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
});

test("dashboard is the product segment price index board with problem stores", () => {
  assert.match(dashboardPage, /产品段价格指数战况|Product Segment Price Index/);
  assert.match(dashboardPage, /problemStoreCount/);
  assert.match(dashboardPage, /worstProblemStore/);
  assert.match(dashboardPage, /priceIndex/);
  assert.match(dashboardPage, /benchmarkPricePerPiece/);
  assert.match(dashboardPage, /province/);
  assert.match(dashboardPage, /cityName/);
  assert.match(dashboardPage, /district/);
  assert.doesNotMatch(dashboardPage, /首页倒推的后台能力/);
  assert.doesNotMatch(dashboardPage, /今日最该处理/);
});

test("dashboard derived data calculates price index and supports filter and sort parameters", () => {
  assert.match(typesFile, /priceIndex/);
  assert.match(typesFile, /problemStoreCount/);
  assert.match(typesFile, /worstProblemStore/);
  assert.match(dataFile, /getProductSegmentPriceIndexBattles/);
  assert.match(dataFile, /priceIndexSort/);
  assert.match(dataFile, /problemStoreSort/);
  assert.match(dataFile, /benchmark_price_per_piece/);
  assert.match(dataFile, /offline_store_visits/);
  assert.match(dataFile, /offline_stores/);
});

test("dashboard region filters use structured store regions and ignore numeric legacy city values", () => {
  assert.match(typesFile, /"id" \| "store_name" \| "city" \| "province" \| "city_name" \| "district"/);
  assert.match(dataFile, /province,city_name,district/);
  assert.match(dataFile, /function cleanRegionText/);
  assert.match(dataFile, /function cleanStoreName/);
  assert.match(dataFile, /\^\\d\+\$/);
  assert.match(dataFile, /cleanRegionText\(visit\?\.province\)/);
  assert.match(dataFile, /cleanStoreName\(visit\?\.store_name\)/);
  assert.doesNotMatch(dataFile, /byName\.size === 0 && shouldFlagSegment/);
});

test("prices accepts dashboard drilldown filters", () => {
  assert.match(pricesPage, /province\?: string/);
  assert.match(pricesPage, /cityName\?: string/);
  assert.match(pricesPage, /district\?: string/);
  assert.match(pricesPage, /store\?: string/);
});
