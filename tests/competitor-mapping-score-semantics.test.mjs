import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const legacyCompetitorsPage = readFileSync("src/app/[locale]/competitors/page.tsx", "utf8");
const competitorMappingsPage = readFileSync("src/app/[locale]/competitor-mappings/page.tsx", "utf8");
const competitorMappingTable = readFileSync("src/components/competitor-mappings-table.tsx", "utf8");
const competitorProductsPage = readFileSync("src/app/[locale]/competitor-products/page.tsx", "utf8");
const competitorProductsTable = readFileSync("src/components/competitor-products-table.tsx", "utf8");
const reviewWorkbench = readFileSync("src/components/ai-price-candidates-workbench.tsx", "utf8");

test("legacy competitors route redirects to competitor product master", () => {
  assert.match(legacyCompetitorsPage, /redirect\(`\/\$\{locale\}\/competitor-products`\)/);
});

test("competitor mapping uses photo-review style tabs for mapping status", () => {
  assert.match(competitorMappingsPage, /MappingStatusTabs/);
  assert.match(competitorMappingsPage, /mappingStatus === "pending" && product\.sku_matches\?\.\[0\]/);
  assert.match(competitorMappingsPage, /mappingStatus === "mapped" && !product\.sku_matches\?\.\[0\]/);
  assert.match(competitorMappingsPage, /inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1/);
  assert.match(competitorMappingsPage, /Pending/);
  assert.match(competitorMappingsPage, /Mapped/);
  assert.match(competitorMappingsPage, /All/);
});

test("competitor mapping filters by product name and keeps product fields read-only", () => {
  assert.match(competitorMappingsPage, /productNameMatches\(product, params\.product\)/);
  assert.match(competitorMappingsPage, /<TextInput name="product"/);
  assert.doesNotMatch(competitorMappingsPage, /name="channel"/);
  assert.doesNotMatch(competitorMappingsPage, /params\.channel/);
  assert.match(competitorMappingTable, /showMappingSummaryColumns = mappingStatus !== "pending"/);
  assert.match(competitorMappingTable, /ProductMasterSearchSelect/);
  assert.match(competitorMappingTable, /action="\/api\/sku-matches"/);
  assert.doesNotMatch(competitorMappingTable, /intent: "update_fields"/);
  assert.doesNotMatch(competitorMappingTable, /onBlur=\{\(\) => saveProductFields/);
});

test("competitor mapping uses status and method instead of match score as a visible column", () => {
  assert.match(competitorMappingsPage, /CompetitorMappingsTable/);
  assert.match(competitorMappingTable, /关联状态|Mapping Status/);
  assert.match(competitorMappingTable, /关联方式|Mapping Method/);
  assert.match(competitorMappingTable, /已关联|Mapped/);
  assert.match(competitorMappingTable, /未关联|Unmapped/);
  assert.match(competitorMappingTable, /人工确认|Manual confirmed/);
  assert.doesNotMatch(competitorMappingTable, /dict\.common\.score/);
  assert.doesNotMatch(competitorMappingTable, /Math\.round\(match\.match_score \* 100\)/);
});

test("competitor product master owns only 1.0 required product field maintenance", () => {
  assert.match(competitorProductsPage, /CompetitorProductsTable/);
  assert.match(competitorProductsTable, /intent: "update_fields"/);
  assert.match(competitorProductsTable, /package_type/);
  assert.match(competitorProductsTable, /piece_count/);
  assert.match(competitorProductsTable, /status/);
  assert.doesNotMatch(competitorProductsTable, /pack_type/);
  assert.doesNotMatch(competitorProductsTable, /segment/);
  assert.doesNotMatch(competitorProductsTable, /intent: "update_segment"/);
  assert.doesNotMatch(competitorProductsTable, /ProductMasterSearchSelect/);
});

test("photo price review labels match score as product hit confidence in Chinese copy", () => {
  assert.match(reviewWorkbench, /商品命中度|Product hit/);
  assert.match(reviewWorkbench, /\{copy\.matchScore\}/);
  assert.match(reviewWorkbench, /Match score/);
});
