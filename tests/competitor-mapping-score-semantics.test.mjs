import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const competitorsPage = readFileSync("src/app/[locale]/competitors/page.tsx", "utf8");
const reviewWorkbench = readFileSync("src/components/ai-price-candidates-workbench.tsx", "utf8");

test("competitor mapping uses status and method instead of match score as a visible column", () => {
  assert.match(competitorsPage, /关联状态|Mapping status/);
  assert.match(competitorsPage, /关联方式|Mapping method/);
  assert.match(competitorsPage, /已关联|Mapped/);
  assert.match(competitorsPage, /未关联|Unmapped/);
  assert.match(competitorsPage, /人工确认|Manual confirmed/);
  assert.doesNotMatch(competitorsPage, /dict\.common\.score/);
  assert.doesNotMatch(competitorsPage, /Math\.round\(match\.match_score \* 100\)/);
});

test("photo price review labels match score as product hit confidence in Chinese copy", () => {
  assert.match(reviewWorkbench, /商品命中度/);
  assert.match(reviewWorkbench, /\{copy\.matchScore\} ≥/);
  assert.doesNotMatch(reviewWorkbench, /匹配分/);
  assert.match(reviewWorkbench, /Match score/);
});
