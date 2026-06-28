import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const legacyCompetitorsPage = readFileSync("src/app/[locale]/competitors/page.tsx", "utf8");
const competitorMappingsPage = readFileSync("src/app/[locale]/competitor-mappings/page.tsx", "utf8");
const competitorMappingTable = readFileSync("src/components/competitor-mappings-table.tsx", "utf8");
const competitorSeriesRulesPanel = readFileSync("src/components/competitor-series-rules-panel.tsx", "utf8");
const competitorProductsPage = readFileSync("src/app/[locale]/competitor-products/page.tsx", "utf8");
const competitorProductsTable = readFileSync("src/components/competitor-products-table.tsx", "utf8");
const reviewWorkbench = readFileSync("src/components/ai-price-candidates-workbench.tsx", "utf8");

test("legacy competitors route redirects to competitor product master", () => {
  assert.match(legacyCompetitorsPage, /redirect\(`\/\$\{locale\}\/competitor-products`\)/);
});

test("competitor mapping is an automatic series rule configuration page", () => {
  assert.match(competitorMappingsPage, /CompetitorSeriesRulesPanel/);
  assert.match(competitorMappingsPage, /getCompetitorSeriesMappings/);
  assert.doesNotMatch(competitorMappingsPage, /automaticRules/);
  assert.doesNotMatch(competitorMappingsPage, /filteredCompetitorSkus/);
  assert.match(competitorSeriesRulesPanel, /data-role="automatic-mapping-rules"/);
  assert.match(competitorSeriesRulesPanel, /target_makuku_series/);
  assert.match(competitorSeriesRulesPanel, /coveredSkus/);
  assert.doesNotMatch(competitorMappingsPage, /MappingStatusTabs/);
  assert.doesNotMatch(competitorMappingsPage, /mappingStatus/);
  assert.doesNotMatch(competitorMappingsPage, /CompetitorMappingsTable/);
});

test("competitor mapping filters by competitor brand and series only", () => {
  assert.match(competitorMappingsPage, /competitorBrandOptions\(competitorProducts\)/);
  assert.match(competitorMappingsPage, /competitorSeriesOptions\(competitorProducts, params\.brand\)/);
  assert.match(competitorMappingsPage, /<SelectInput name="brand"/);
  assert.match(competitorMappingsPage, /<SelectInput name="series"/);
  assert.match(competitorMappingsPage, /params\.series/);
  assert.doesNotMatch(competitorMappingsPage, /productNameMatches/);
  assert.doesNotMatch(competitorMappingsPage, /<TextInput name="product"/);
  assert.doesNotMatch(competitorMappingsPage, /name="channel"/);
  assert.doesNotMatch(competitorMappingsPage, /params\.channel/);
  assert.doesNotMatch(competitorMappingsPage, /ProductMasterSearchSelect/);
  assert.doesNotMatch(competitorMappingsPage, /action="\/api\/sku-matches"/);
});

test("competitor mapping page does not expose sku-level score or manual exception columns", () => {
  assert.match(competitorSeriesRulesPanel, /Default benchmark/);
  assert.match(competitorSeriesRulesPanel, /Set benchmark/);
  assert.match(competitorSeriesRulesPanel, /clear_benchmark/);
  assert.doesNotMatch(competitorMappingsPage, /dict\.common\.score/);
  assert.doesNotMatch(competitorMappingsPage, /Math\.round\(match\.match_score \* 100\)/);
  assert.doesNotMatch(competitorMappingsPage, /Manual override/);
  assert.doesNotMatch(competitorSeriesRulesPanel, /manualOverrides/);
  assert.match(competitorMappingTable, /ProductMasterSearchSelect/);
});

test("competitor product master owns only 1.0 required product field maintenance", () => {
  assert.match(competitorProductsPage, /CompetitorProductsTable/);
  assert.match(competitorProductsTable, /openProduct/);
  assert.match(competitorProductsTable, /drawerTitle/);
  assert.match(competitorProductsTable, /competitorCode/);
  assert.match(competitorProductsTable, /method: "PATCH"/);
  assert.match(competitorProductsTable, /brand_id/);
  assert.match(competitorProductsTable, /package_type/);
  assert.match(competitorProductsTable, /pack_type/);
  assert.match(competitorProductsTable, /piece_count/);
  assert.match(competitorProductsTable, /segment/);
  assert.match(competitorProductsTable, /status/);
  assert.doesNotMatch(competitorProductsTable, /intent: "update_segment"/);
  assert.doesNotMatch(competitorProductsTable, /ProductMasterSearchSelect/);
});

test("photo price review labels match score as product hit confidence in Chinese copy", () => {
  assert.match(reviewWorkbench, /商品命中度|Product hit/);
  assert.match(reviewWorkbench, /\{copy\.matchScore\}/);
  assert.match(reviewWorkbench, /Match score/);
});
