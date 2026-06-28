import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const mappingMigration = readFileSync("supabase/migrations/202606280001_competitor_series_mapping_default_benchmark.sql", "utf8");
const types = readFileSync("src/lib/types.ts", "utf8");
const dataFile = readFileSync("src/lib/data.ts", "utf8");
const competitorSeriesRoute = readFileSync("src/app/api/competitor-series-matches/route.ts", "utf8");
const competitorMappingPage = readFileSync("src/app/[locale]/competitor-mappings/page.tsx", "utf8");
const rulesPanel = readFileSync("src/components/competitor-series-rules-panel.tsx", "utf8");

test("competitor series mapping schema owns the default benchmark flag", () => {
  assert.match(mappingMigration, /alter table public\.competitor_series_mappings/);
  assert.match(mappingMigration, /is_default_benchmark boolean not null default false/);
  assert.match(mappingMigration, /uniq_competitor_series_mappings_default_benchmark/);
  assert.match(types, /is_default_benchmark: boolean/);
});

test("benchmark selection is configured inline on competitor mapping rules", () => {
  assert.match(competitorMappingPage, /CompetitorSeriesRulesPanel/);
  assert.match(rulesPanel, /name="intent" value="set_benchmark"/);
  assert.match(rulesPanel, /name="intent" value="clear_benchmark"/);
  assert.match(rulesPanel, /is_default_benchmark/);
  assert.match(rulesPanel, /defaultBenchmark/);
  assert.match(competitorSeriesRoute, /setDefaultBenchmarkRule/);
  assert.match(competitorSeriesRoute, /clearDefaultBenchmarkRule/);
  assert.match(competitorSeriesRoute, /is_default_benchmark: true/);
  assert.match(competitorSeriesRoute, /is_default_benchmark: false/);
});

test("standalone market benchmark management surface is gone", () => {
  assert.equal(existsSync("src/app/[locale]/market-benchmarks/page.tsx"), false);
  assert.equal(existsSync("src/app/api/market-benchmarks/route.ts"), false);
  assert.equal(existsSync("src/components/market-benchmark-rule-dialog.tsx"), false);
  assert.equal(existsSync("src/components/market-benchmark-backfill-dialog.tsx"), false);
});

test("weekly price coefficient board does not use legacy benchmark rule period prices", () => {
  assert.match(dataFile, /getCompetitorSeriesMappings/);
  assert.match(dataFile, /mapping\.is_default_benchmark/);
  assert.match(dataFile, /defaultBenchmarkSeries/);
  assert.match(dataFile, /defaultBenchmarkSeries \? defaultBenchmarkPrices : \[\]/);
  assert.doesNotMatch(dataFile, /allMappedBenchmarkPrices/);
  assert.doesNotMatch(dataFile, /getMarketBenchmarkRules\(\)/);
  assert.doesNotMatch(dataFile, /benchmarkPricesFromPeriodPrices/);
  assert.doesNotMatch(dataFile, /pickBestBenchmarkRuleForSnapshot/);
  assert.doesNotMatch(dataFile, /market_benchmark_period_prices/);
});
