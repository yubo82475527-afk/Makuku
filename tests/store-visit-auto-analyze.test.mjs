import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const storeVisitH5 = readFileSync("src/components/store-visit-h5.tsx", "utf8");
const storeVisitsListH5 = readFileSync("src/components/store-visits-list-h5.tsx", "utf8");
const analyzeRoute = readFileSync("src/app/api/store-visit/analyze/route.ts", "utf8");
const storeVisitImagesRoute = readFileSync("src/app/api/store-visit/[id]/images/route.ts", "utf8");
const storeVisitAi = readFileSync("src/lib/store-visit-ai.ts", "utf8");
const storeVisitAiDebug = readFileSync("src/lib/store-visit-ai-debug.ts", "utf8");

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

test("store visit analysis sends signed URLs to AI before falling back to inline images", () => {
  assert.match(storeVisitAiDebug, /signedImageUrls/);
  assert.match(storeVisitAiDebug, /image_input_mode: "signed_url"/);
  assert.match(storeVisitAiDebug, /fallbackImageUrlToDataUrl/);
  assert.doesNotMatch(storeVisitAiDebug, /const inlineImageUrls = await Promise\.all\(signedEntries\.map\(\(entry\) => imageUrlToDataUrl\(entry\.url\)\)\)/);
});

test("image upload API only stores photos and never waits for AI analysis", () => {
  assert.doesNotMatch(storeVisitImagesRoute, /analyzeStoreVisitPriceImage/);
  assert.doesNotMatch(storeVisitImagesRoute, /createSignedUrl\(path, 60 \* 10\)/);
  assert.doesNotMatch(storeVisitImagesRoute, /analysis_error: analysisError/);
  assert.match(storeVisitImagesRoute, /analysis_status: "pending"/);
  assert.match(storeVisitImagesRoute, /vision_result: \{ upload_category: category \}/);
});

test("store visit analysis auto-approves AI price candidates that match the active rule", () => {
  assert.match(analyzeRoute, /generateAiPriceCandidates/);
  assert.match(analyzeRoute, /autoApproveAiPriceCandidatesForVisit/);
  assert.match(analyzeRoute, /autoReviewedCount/);
  assert.match(analyzeRoute, /auto_reviewed_count/);
  assert.match(analyzeRoute, /review_method.*auto_rule|auto_rule.*review_method/s);
});

test("store visit analysis preserves the source image on generated price candidates", () => {
  assert.match(analyzeRoute, /sourceItems/);
  assert.match(analyzeRoute, /sourceImageId: imageResult\.imageId/);
  assert.match(analyzeRoute, /generateAiPriceCandidates\(\{ visitId, aiResult, sourceItems \}\)/);
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

test("store visit analysis supports partial success and image-level failure records", () => {
  assert.match(storeVisitAiDebug, /priceImageFailures/);
  assert.match(storeVisitAiDebug, /analysis_status: "failed"/);
  assert.match(storeVisitAiDebug, /analysis_error: systemErrorMessage/);
  assert.match(analyzeRoute, /analysisStatus = aiAnalysis\.partialFailure \? "partial" : "completed"/);
  assert.match(analyzeRoute, /visit_status: "analyzed"/);
  assert.match(analyzeRoute, /analysis_partial_failures/);
});

test("store visit analysis also resolves storefront image status after display AI returns", () => {
  assert.match(storeVisitAiDebug, /displayImageEntries/);
  assert.match(storeVisitAiDebug, /display_image_failures/);
  assert.match(storeVisitAiDebug, /analysis_status: "analyzed"/);
  assert.match(storeVisitAiDebug, /displayAnalysisError = errorMessage\(error\)/);
});

test("new H5 store visit requires at least one price-tag image, not only Makuku photos", () => {
  assert.match(storeVisitH5, /images\.makuku_shelf\.length === 0 && images\.competitor_shelf\.length === 0/);
  assert.doesNotMatch(storeVisitH5, /setError\(copy\.uploadMakukuShelfRequired\)/);
});

test("store visit AI uses image-level price parsing and separate display analysis", () => {
  assert.match(storeVisitAi, /export async function analyzeStoreVisitPriceImage/);
  assert.match(storeVisitAi, /export async function analyzeStoreVisitDisplayImages/);
  assert.match(storeVisitAiDebug, /analyzeStoreVisitPriceImage/);
  assert.match(storeVisitAiDebug, /analyzeStoreVisitDisplayImages/);
  assert.doesNotMatch(storeVisitAi, /Treat all images as ONE store-level observation/);
});
