import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const route = readFileSync("src/app/api/store-visit/[id]/route.ts", "utf8");

test("store visit detail falls back when v2 match metadata columns are not deployed", () => {
  assert.match(route, /aiPriceCandidatePreV2Select/);
  assert.match(route, /ai_match_rule_version/);
  assert.match(route, /ai_match_method/);
  assert.match(route, /isMissingCandidateColumnError/);
  assert.match(route, /visitPreV2CandidateSelect/);
});

test("store visit detail slims H5 payload fields that are unused in the mobile UI", () => {
  assert.match(route, /slimVisionResultForH5/);
  assert.match(route, /slimCandidateForH5/);
  assert.match(route, /h5_hidden_price_row_indexes/);
  assert.doesNotMatch(route, /ai_match_evidence,/);
  assert.doesNotMatch(route, /price_evidence_detail,/);
});
