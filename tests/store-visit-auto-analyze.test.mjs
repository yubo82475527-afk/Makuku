import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const storeVisitH5 = readFileSync("src/components/store-visit-h5.tsx", "utf8");
const analyzeRoute = readFileSync("src/app/api/store-visit/analyze/route.ts", "utf8");

test("new H5 store visit starts analysis automatically after uploads before returning to the list", () => {
  const analyzeIndex = storeVisitH5.indexOf('fetch("/api/store-visit/analyze"');
  const listRedirectIndex = storeVisitH5.indexOf('router.push(`/${locale}/mobile/offline-capture`)');

  assert.ok(analyzeIndex >= 0, "submit flow should call the store visit analysis endpoint");
  assert.ok(listRedirectIndex >= 0, "submit flow should keep returning to the visit list");
  assert.ok(analyzeIndex < listRedirectIndex, "analysis should start before returning to the visit list");
  assert.match(storeVisitH5, /body:\s*JSON\.stringify\(\{\s*visit_id:\s*visitId\s*\}\)/s);
});

test("store visit analysis auto-approves AI price candidates that match the active rule", () => {
  assert.match(analyzeRoute, /generateAiPriceCandidates/);
  assert.match(analyzeRoute, /autoApproveAiPriceCandidatesForVisit/);
  assert.match(analyzeRoute, /autoReviewedCount/);
  assert.match(analyzeRoute, /auto_reviewed_count/);
  assert.match(analyzeRoute, /review_method.*auto_rule|auto_rule.*review_method/s);
});
