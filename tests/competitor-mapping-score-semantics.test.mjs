import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const competitorsPage = readFileSync("src/app/[locale]/competitors/page.tsx", "utf8");
const competitorMappingTable = readFileSync("src/components/competitor-mapping-table.tsx", "utf8");
const reviewWorkbench = readFileSync("src/components/ai-price-candidates-workbench.tsx", "utf8");

test("competitor mapping uses status and method instead of match score as a visible column", () => {
  assert.match(competitorsPage, /CompetitorMappingTable/);
  assert.match(competitorMappingTable, /关联状态|Mapping status/);
  assert.match(competitorMappingTable, /关联方式|Mapping method/);
  assert.match(competitorMappingTable, /已关联|Mapped/);
  assert.match(competitorMappingTable, /未关联|Unmapped/);
  assert.match(competitorMappingTable, /人工确认|Manual confirmed/);
  assert.doesNotMatch(competitorMappingTable, /dict\.common\.score/);
  assert.doesNotMatch(competitorMappingTable, /Math\.round\(match\.match_score \* 100\)/);
});

test("photo price review labels match score as product hit confidence in Chinese copy", () => {
  assert.match(reviewWorkbench, /商品命中度/);
  assert.match(reviewWorkbench, /\{copy\.matchScore\} ≥/);
  assert.doesNotMatch(reviewWorkbench, /匹配分/);
  assert.match(reviewWorkbench, /Match score/);
});
