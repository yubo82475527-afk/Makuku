import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const migrationPath = "supabase/migrations/202606150002_competitor_series_mappings.sql";
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const benchmarkMigrationPath = "supabase/migrations/202606280001_competitor_series_mapping_default_benchmark.sql";
const benchmarkMigration = existsSync(benchmarkMigrationPath) ? readFileSync(benchmarkMigrationPath, "utf8") : "";
const methodMigrationPath = "supabase/migrations/202606150003_sku_matches_series_rule_method.sql";
const methodMigration = existsSync(methodMigrationPath) ? readFileSync(methodMigrationPath, "utf8") : "";
const removeSeriesRuleMigrationPath = "supabase/migrations/202606280002_remove_series_rule_sku_matches.sql";
const removeSeriesRuleMigration = existsSync(removeSeriesRuleMigrationPath) ? readFileSync(removeSeriesRuleMigrationPath, "utf8") : "";
const service = readFileSync("src/lib/competitor-series-mapping.ts", "utf8");
const apiRoute = readFileSync("src/app/api/competitor-series-matches/route.ts", "utf8");
const page = readFileSync("src/app/[locale]/competitor-mappings/page.tsx", "utf8");
const panel = readFileSync("src/components/competitor-series-rules-panel.tsx", "utf8");
const drawer = readFileSync("src/components/competitor-series-rule-drawer.tsx", "utf8");
const searchSelect = readFileSync("src/components/product-master-search-select.tsx", "utf8");
const types = readFileSync("src/lib/types.ts", "utf8");
const dataFile = readFileSync("src/lib/data.ts", "utf8");

test("competitor series mapping schema is added", () => {
  assert.match(migration, /create table if not exists public\.competitor_series_mappings/);
  assert.match(migration, /brand_id uuid not null references public\.brands/);
  assert.match(migration, /product_series text/);
  assert.match(migration, /target_makuku_series text not null/);
  assert.match(migration, /uniq_active_competitor_series_mappings/);
  assert.match(types, /CompetitorSeriesMapping/);
  assert.match(types, /target_material_group2s: string\[\]/);
  assert.match(methodMigration, /sku_matches_match_method_check/);
  assert.match(methodMigration, /series_rule/);
  assert.match(removeSeriesRuleMigration, /where match_method = 'series_rule'/);
  assert.match(removeSeriesRuleMigration, /check \(match_method in \('rule', 'ai', 'manual'\)\)/);
  assert.match(benchmarkMigration, /add column if not exists is_default_benchmark boolean not null default false/);
  assert.match(benchmarkMigration, /uniq_competitor_series_mappings_default_benchmark/);
  assert.match(types, /is_default_benchmark: boolean/);
  assert.doesNotMatch(types, /"series_rule"/);
  assert.doesNotMatch(types, /target_makuku_series/);
  assert.equal(existsSync("src/app/api/sku-matches/route.ts"), false);
});

test("competitor series mapping targets material_group2 arrays", () => {
  const group2MigrationPath = "supabase/migrations/202607300002_competitor_series_mapping_material_group2.sql";
  const group2Migration = existsSync(group2MigrationPath) ? readFileSync(group2MigrationPath, "utf8") : "";
  assert.match(group2Migration, /target_material_group2s text\[\]/);
  assert.match(group2Migration, /drop column if exists target_makuku_series/);
  assert.match(group2Migration, /drop index if exists public\.uniq_competitor_series_mappings_default_benchmark/);
  assert.match(group2Migration, /active = false/);
});

test("series mapping helpers do not persist sku-level series rule matches", () => {
  assert.match(service, /findMatchingMaterialForSeries/);
  assert.match(service, /targetMaterialGroup2s/);
  assert.match(service, /material_group2/);
  assert.match(service, /materialGroup2Options/);
  assert.match(service, /piece_count/);
  assert.match(service, /productPieceCountCandidates/);
  assert.match(service, /matchAll/);
  assert.match(service, /Math\.abs\(Number\(material\.pack_count\) - pieceCount\)/);
  assert.match(service, /Number\(right\.material\.pack_count\) - Number\(left\.material\.pack_count\)/);
  assert.match(service, /parsedCandidates\.size > 0/);
  assert.doesNotMatch(service, /applySeriesMappingRuleToGroup/);
  assert.doesNotMatch(service, /applySeriesMappingRuleForProduct/);
  assert.doesNotMatch(service, /clearSeriesRuleMatches/);
  assert.doesNotMatch(service, /sku_matches/);
  assert.doesNotMatch(service, /series_rule/);
});

test("series mapping API saves and deletes rules without writing sku matches", () => {
  assert.match(apiRoute, /competitor_series_mappings/);
  assert.match(apiRoute, /intent === "clear"/);
  assert.match(apiRoute, /intent === "delete_rule"/);
  assert.match(apiRoute, /intent === "set_benchmark"/);
  assert.match(apiRoute, /intent === "clear_benchmark"/);
  assert.match(apiRoute, /setDefaultBenchmarkRule/);
  assert.match(apiRoute, /clearDefaultBenchmarkRule/);
  assert.match(apiRoute, /is_default_benchmark/);
  assert.match(apiRoute, /target_material_group2s/);
  assert.match(apiRoute, /normalizeMaterialGroup2Targets/);
  assert.doesNotMatch(apiRoute, /applySeriesMappingRule/);
  assert.doesNotMatch(apiRoute, /clearSeriesRuleMatches/);
  assert.doesNotMatch(apiRoute, /sku_matches/);
  assert.doesNotMatch(apiRoute, /summary/);
  assert.equal(existsSync("src/app/api/sku-matches/route.ts"), false);
});

test("reports derive automatic series mapping at runtime instead of relying on sku matches", () => {
  assert.match(dataFile, /competitorSnapshotMaterialCode/);
  assert.match(dataFile, /findMatchingMaterialForSeries/);
  assert.match(dataFile, /mappings: CompetitorSeriesMapping\[\]/);
  assert.match(dataFile, /materialMaster: MaterialMaster\[\]/);
  assert.doesNotMatch(dataFile, /sku_matches/);
  assert.doesNotMatch(dataFile, /series_rule/);
  assert.match(dataFile, /seriesMaterialCodes\.has\(benchmarkMaterialCode\)/);
  assert.doesNotMatch(dataFile, /scopedMaterialCodes\.has\(benchmarkMaterialCode\)/);
  assert.match(dataFile, /competitorSnapshotMaterialCode\(snapshot, mappedSeries, input\.materialMaster\)/);
});

test("competitor mapping page exposes only automatic series mapping rules", () => {
  assert.match(page, /CompetitorSeriesRulesPanel/);
  assert.match(page, /getCompetitorSeriesMappings/);
  assert.match(panel, /Automatic Mapping Rules/);
  assert.match(panel, /Add rule/);
  assert.match(panel, /CompetitorSeriesRuleDrawer/);
  assert.match(drawer, /target_material_group2/);
  assert.match(drawer, /type="checkbox"/);
  assert.match(panel, /coveredSkus/);
  assert.match(panel, /buildCompetitorBrands\(competitorGroups\)/);
  assert.doesNotMatch(page, /brands=\{brandsResult\.data/);
  assert.match(page, /competitorBrandOptions\(competitorProducts\)/);
  assert.match(page, /name="series"/);
  assert.match(page, /params\.series/);
  assert.match(page, /filteredRules/);
  assert.match(page, /rules=\{filteredRules\}/);
  assert.doesNotMatch(page, /automaticRules/);
  assert.doesNotMatch(page, /filteredCompetitorSkus/);
  assert.doesNotMatch(page, /CompetitorMappingsTable/);
  assert.doesNotMatch(page, /mappingStatus/);
});

test("competitor mapping page is framed as automatic sku mapping configuration", () => {
  assert.match(page, /Competitor Benchmarking|竞品对标/);
  assert.match(page, /QueryForm/);
  assert.match(page, /QuerySubmitButton/);
  assert.match(page, /name="brand"/);
  assert.match(page, /name="series"/);
  assert.doesNotMatch(page, /automaticRules/);
  assert.doesNotMatch(page, /filteredCompetitorSkus/);
  assert.doesNotMatch(page, /manualExceptions/);
  assert.match(panel, /Automatic Mapping Rules/);
  assert.match(panel, /Default benchmark/);
  assert.match(panel, /Set benchmark/);
  assert.match(panel, /Delete rule/);
  assert.match(panel, /intent: "delete_rule"/);
  assert.match(panel, /intent: "set_benchmark"/);
  assert.match(panel, /intent: "clear_benchmark"/);
  assert.match(panel, /fetch\("\/api\/competitor-series-matches"/);
  assert.match(panel, /is_default_benchmark/);
  assert.match(panel, /ruleCoverageSummary/);
  assert.match(panel, /data-role="automatic-mapping-rules"/);
  assert.match(panel, /setActiveRule\("new"\)/);
  assert.match(drawer, /Add mapping rule|新增映射规则/);
  assert.doesNotMatch(panel, /manualOverrides/);
  assert.doesNotMatch(panel, /Manual override/);
  assert.doesNotMatch(panel, /Save and Apply/);
  assert.doesNotMatch(page, /ProductMasterSearchSelect/);
});

test("manual SKU picker displays existing sku even when material master option is missing", () => {
  assert.equal(existsSync("src/components/competitor-mappings-table.tsx"), false);
  assert.equal(existsSync("src/components/competitor-mapping-table.tsx"), false);
  assert.match(searchSelect, /selectedLabel/);
  assert.match(searchSelect, /initialSelectedCode/);
});
