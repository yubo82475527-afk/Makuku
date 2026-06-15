import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const migration = readFileSync("supabase/migrations/202606150004_market_benchmark_rules.sql", "utf8");
const types = readFileSync("src/lib/types.ts", "utf8");
const dataFile = readFileSync("src/lib/data.ts", "utf8");
const helper = readFileSync("src/lib/market-benchmark-rules.ts", "utf8");
const apiRoute = readFileSync("src/app/api/market-benchmarks/route.ts", "utf8");
const page = readFileSync("src/app/[locale]/market-benchmarks/page.tsx", "utf8");
const dialog = readFileSync("src/components/market-benchmark-rule-dialog.tsx", "utf8");
const backfillDialog = readFileSync("src/components/market-benchmark-backfill-dialog.tsx", "utf8");

test("market benchmark rule schema supports region series rules and flexible periods", () => {
  assert.match(migration, /create table if not exists public\.market_benchmark_rules/);
  assert.match(migration, /province text not null/);
  assert.match(migration, /city_name text not null/);
  assert.match(migration, /district text/);
  assert.match(migration, /brand_id uuid not null/);
  assert.match(migration, /product_series text/);
  assert.match(migration, /create table if not exists public\.market_benchmark_period_prices/);
  assert.match(migration, /period_type text not null check \(period_type in \('week', 'month'\)\)/);
  assert.match(migration, /uniq_market_benchmark_rules_active_scope/);
  assert.match(migration, /uniq_market_benchmark_period_prices_period/);
  assert.match(migration, /truncate table public\.market_benchmarks/);
  assert.match(types, /MarketBenchmarkRule/);
  assert.match(types, /MarketBenchmarkPeriodPrice/);
});

test("market benchmark API saves rules and calculates or carries forward period prices", () => {
  assert.match(apiRoute, /getMarketBenchmarkRules/);
  assert.match(apiRoute, /backfill_period_prices/);
  assert.match(apiRoute, /backfillPeriodPrices/);
  assert.match(apiRoute, /overwrite/);
  assert.match(apiRoute, /buildPeriods/);
  assert.match(apiRoute, /province/);
  assert.match(apiRoute, /city_name/);
  assert.match(apiRoute, /district/);
  assert.match(apiRoute, /brand_id/);
  assert.match(apiRoute, /product_series/);
  assert.match(apiRoute, /currentBenchmarkPeriod\("week"\)/);
  assert.match(apiRoute, /calculateBenchmarkAverage/);
  assert.match(apiRoute, /carried_forward/);
  assert.doesNotMatch(apiRoute, /benchmark_competitor_product_id/);
  assert.doesNotMatch(apiRoute, /benchmark_sku_name/);
});

test("market benchmark page is a region series rule configuration surface", () => {
  assert.match(page, /getMarketBenchmarkRules/);
  assert.match(page, /MarketBenchmarkRuleDialog/);
  assert.match(page, /MarketBenchmarkBackfillDialog/);
  assert.match(page, /name="province"/);
  assert.match(page, /name="cityName"/);
  assert.match(page, /name="district"/);
  assert.match(page, /name="brand"/);
  assert.match(page, /name="series"/);
  assert.match(page, /market_benchmark_period_prices/);
  assert.match(page, /visibleRows/);
  assert.match(page, /沿用上一期|Carried forward/);
  assert.match(dialog, /新增规则|New Rule/);
  assert.match(dialog, /name="city_name"/);
  assert.match(dialog, /name="brand_id"/);
  assert.match(dialog, /name="product_series"/);
  assert.match(backfillDialog, /补算历史周期价|Backfill Prices/);
  assert.match(backfillDialog, /name="intent" value="backfill_period_prices"/);
  assert.match(backfillDialog, /name="period_type"/);
  assert.match(backfillDialog, /name="start_date"/);
  assert.match(backfillDialog, /name="end_date"/);
  assert.match(backfillDialog, /name="overwrite"/);
  assert.doesNotMatch(page, /competitorProductId/);
  assert.doesNotMatch(page, /name="benchmark_price_per_piece"/);
});

test("market benchmark helpers match optional district and preserve period labels", () => {
  assert.match(helper, /currentBenchmarkPeriod/);
  assert.match(helper, /periodType === "month"/);
  assert.match(helper, /snapshotMatchesRule/);
  assert.match(helper, /cleanText\(rule\.district\)/);
  assert.match(helper, /formatBenchmarkPeriod/);
  assert.match(dataFile, /getMarketBenchmarkRules/);
  assert.match(dataFile, /market_benchmark_period_prices/);
});
