import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const migrationPath = "supabase/migrations/202606150002_competitor_series_mappings.sql";
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const methodMigration = readFileSync("supabase/migrations/202606150003_sku_matches_series_rule_method.sql", "utf8");
const service = readFileSync("src/lib/competitor-series-mapping.ts", "utf8");
const apiRoute = readFileSync("src/app/api/competitor-series-matches/route.ts", "utf8");
const skuMatchesRoute = readFileSync("src/app/api/sku-matches/route.ts", "utf8");
const page = readFileSync("src/app/[locale]/competitor-mappings/page.tsx", "utf8");
const panel = readFileSync("src/components/competitor-series-rules-panel.tsx", "utf8");
const mappingTable = readFileSync("src/components/competitor-mappings-table.tsx", "utf8");
const searchSelect = readFileSync("src/components/product-master-search-select.tsx", "utf8");
const types = readFileSync("src/lib/types.ts", "utf8");

test("competitor series mapping schema is added", () => {
  assert.match(migration, /create table if not exists public\.competitor_series_mappings/);
  assert.match(migration, /brand_id uuid not null references public\.brands/);
  assert.match(migration, /product_series text/);
  assert.match(migration, /target_makuku_series text not null/);
  assert.match(migration, /uniq_active_competitor_series_mappings/);
  assert.match(types, /CompetitorSeriesMapping/);
  assert.match(methodMigration, /sku_matches_match_method_check/);
  assert.match(methodMigration, /series_rule/);
});

test("series mapping service applies rules without overwriting manual matches", () => {
  assert.match(service, /applySeriesMappingRuleToGroup/);
  assert.match(service, /match_method === "manual"/);
  assert.match(service, /match_method: "series_rule"/);
  assert.match(service, /findMatchingMaterialForSeries/);
  assert.match(service, /targetMakukuSeries/);
  assert.match(service, /piece_count/);
  assert.match(service, /productPieceCountCandidates/);
  assert.match(service, /matchAll/);
  assert.match(service, /Math\.abs\(Number\(material\.pack_count\) - pieceCount\)/);
  assert.match(service, /Number\(right\.material\.pack_count\) - Number\(left\.material\.pack_count\)/);
  assert.match(service, /parsedCandidates\.size > 0/);
  assert.match(service, /clearSeriesRuleMatches/);
  assert.match(service, /\.eq\("match_method", "series_rule"\)/);
});

test("series mapping API saves rules, applies them, and clears only rule matches", () => {
  assert.match(apiRoute, /competitor_series_mappings/);
  assert.match(apiRoute, /applySeriesMappingRuleToGroup/);
  assert.match(apiRoute, /clearSeriesRuleMatches/);
  assert.match(apiRoute, /intent === "clear"/);
  assert.match(skuMatchesRoute, /match_method: "manual"/);
});

test("competitor mapping page exposes series rule panel and keeps sku exception table", () => {
  assert.match(page, /CompetitorSeriesRulesPanel/);
  assert.match(page, /getCompetitorSeriesMappings/);
  assert.match(panel, /系列映射规则|Series Mapping Rules/);
  assert.match(panel, /target_makuku_series/);
  assert.match(panel, /manualOverrides/);
  assert.match(panel, /buildCompetitorBrands\(competitorGroups\)/);
  assert.doesNotMatch(page, /brands=\{brandsResult\.data/);
  assert.match(page, /competitorBrandOptions\(competitorProducts\)/);
  assert.match(page, /name="series"/);
  assert.match(page, /params\.series/);
  assert.match(page, /CompetitorMappingsTable/);
});

test("manual SKU picker displays existing sku even when material master option is missing", () => {
  assert.match(mappingTable, /selectedLabel=\{formatSelectedSkuLabel\(match\?\.sku_master\)\}/);
  assert.match(searchSelect, /selectedLabel/);
  assert.match(searchSelect, /initialSelectedCode/);
});
