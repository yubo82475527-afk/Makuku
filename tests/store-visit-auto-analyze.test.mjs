import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const storeVisitH5 = readFileSync("src/components/store-visit-h5.tsx", "utf8");
const storeVisitsListH5 = readFileSync("src/components/store-visits-list-h5.tsx", "utf8");
const analyzeRoute = readFileSync("src/app/api/store-visit/analyze/route.ts", "utf8");

test("new H5 store visit returns to the list after uploads without waiting for AI analysis", () => {
  const analyzeIndex = storeVisitH5.indexOf('fetch("/api/store-visit/analyze"');
  const listRedirectIndex = storeVisitH5.indexOf('router.replace(`/${locale}/mobile/offline-capture`)');

  assert.ok(listRedirectIndex >= 0, "submit flow should keep returning to the visit list");
  assert.equal(analyzeIndex, -1, "submit flow should not wait for AI analysis");
  assert.doesNotMatch(storeVisitH5, /setSubmitStatus\(labels\.analyzingPrices\)/);
  assert.doesNotMatch(storeVisitH5, /void fetch\("\/api\/store-visit\/analyze"/);
});

test("mobile visit list auto-starts uploaded pending visits once per page session", () => {
  assert.match(storeVisitsListH5, /autoAnalyzeVisit/);
  assert.match(storeVisitsListH5, /visit\.visit_status === "uploaded"/);
  assert.match(storeVisitsListH5, /visit\.analysis_status === "pending"/);
  assert.match(storeVisitsListH5, /autoAnalysisAttemptedIds/);
  assert.match(storeVisitsListH5, /fetch\("\/api\/store-visit\/analyze"/);
});

test("store visit analysis auto-approves AI price candidates that match the active rule", () => {
  assert.match(analyzeRoute, /generateAiPriceCandidates/);
  assert.match(analyzeRoute, /autoApproveAiPriceCandidatesForVisit/);
  assert.match(analyzeRoute, /autoReviewedCount/);
  assert.match(analyzeRoute, /auto_reviewed_count/);
  assert.match(analyzeRoute, /review_method.*auto_rule|auto_rule.*review_method/s);
});

test("store visit analysis accepts new image rows as well as legacy image arrays", () => {
  assert.match(analyzeRoute, /offline_visit_images\(id\)/);
  assert.match(analyzeRoute, /legacyImageCount/);
  assert.match(analyzeRoute, /tableImageCount/);
  assert.match(analyzeRoute, /legacyImageCount \+ tableImageCount/);
  assert.doesNotMatch(analyzeRoute, /const imagePaths = Array\.isArray\(typedVisit\.image_urls\) \? typedVisit\.image_urls : \[\];\s*if \(imagePaths\.length === 0\)/s);
});

test("store visit analysis failures keep retryable status and error details", () => {
  assert.match(analyzeRoute, /analysis_status: "failed"/);
  assert.match(analyzeRoute, /visit_status: "uploaded"/);
  assert.match(analyzeRoute, /analysis_error: message/);
});
