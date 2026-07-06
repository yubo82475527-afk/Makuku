import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const storeVisitH5 = readFileSync("src/components/store-visit-h5.tsx", "utf8");
const storeVisitsListH5 = readFileSync("src/components/store-visits-list-h5.tsx", "utf8");
const analyzeRoute = readFileSync("src/app/api/store-visit/analyze/route.ts", "utf8");
const storeVisitImagesRoute = readFileSync("src/app/api/store-visit/[id]/images/route.ts", "utf8");
const storeVisitDetailH5 = readFileSync("src/components/store-visit-detail-h5.tsx", "utf8");
const storeVisitRefreshRoute = readFileSync("src/app/api/store-visit/[id]/refresh/route.ts", "utf8");
const storeVisitAi = readFileSync("src/lib/store-visit-ai.ts", "utf8");
const storeVisitAiDebug = readFileSync("src/lib/store-visit-ai-debug.ts", "utf8");
const storeVisitAnalysis = readFileSync("src/lib/store-visit-analysis.ts", "utf8");
const storeVisitImageMaintenance = readFileSync("src/lib/store-visit-image-maintenance.ts", "utf8");
const appShell = readFileSync("src/components/app-shell.tsx", "utf8");
const storeVisitMonitorPage = readFileSync("src/app/[locale]/store-visit-monitor/page.tsx", "utf8");
const dataFile = readFileSync("src/lib/data.ts", "utf8");

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

test("H5 list does not expose manual whole-visit reanalysis after initial analysis", () => {
  assert.doesNotMatch(storeVisitsListH5, /function reanalyzeVisit/);
  assert.doesNotMatch(storeVisitsListH5, /reanalyzingVisitId/);
  assert.doesNotMatch(storeVisitsListH5, /onClick=\{\(\) => reanalyzeVisit\(visit\.id\)\}/);
  assert.match(storeVisitsListH5, /openVisitToHandlePhotos/);
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
  assert.match(storeVisitImagesRoute, /vision_result:\s*\{[\s\S]*upload_category: category/);
});

test("image upload API does not block non-replacement uploads because new visit photos upload concurrently", () => {
  assert.doesNotMatch(storeVisitImagesRoute, /Adding new photos to an existing visit is no longer supported/);
  assert.doesNotMatch(storeVisitImagesRoute, /if \(!replacesImageId/);
  assert.match(storeVisitImagesRoute, /if \(replacesImageId\)/);
});

test("store visit analysis auto-approves AI price candidates that match the active rule", () => {
  assert.match(analyzeRoute, /runStoreVisitAnalysis/);
  assert.match(storeVisitAnalysis, /generateAiPriceCandidates/);
  assert.match(storeVisitAnalysis, /autoApproveAiPriceCandidatesForVisit/);
  assert.match(analyzeRoute, /autoReviewedCount/);
  assert.match(storeVisitAnalysis, /auto_reviewed_count/);
  assert.match(storeVisitAnalysis, /review_method.*auto_rule|auto_rule.*review_method/s);
});

test("store visit analysis preserves the source image on generated price candidates", () => {
  assert.match(storeVisitAnalysis, /sourceItems/);
  assert.match(storeVisitAnalysis, /sourceImageId: imageResult\.imageId/);
  assert.match(storeVisitAnalysis, /generateAiPriceCandidates\(\{[\s\S]*visitId: input\.visitId[\s\S]*sourceItems/);
});

test("store visit analysis only generates candidates that are bound to a source image", () => {
  assert.match(readFileSync("src/lib/ai-price-candidates.ts", "utf8"), /const scopedItems = items\.filter\(\(item\) => item\.sourceImageId\)/);
  assert.doesNotMatch(readFileSync("src/lib/ai-price-candidates.ts", "utf8"), /delete legacyRow\.source_image_id/);
  assert.match(readFileSync("src/lib/ai-price-review.ts", "utf8"), /if \(!sourceImageId\) \{\s*throw new Error\("AI price candidate is missing source_image_id and cannot create a price snapshot"\);/s);
});

test("store visit analysis keeps all visible H5 image rows as candidates even when confidence is low or brand is missing", () => {
  const candidateService = readFileSync("src/lib/ai-price-candidates.ts", "utf8");
  assert.match(candidateService, /function isH5VisiblePriceCandidate/);
  assert.match(candidateService, /const scopedItems = items\.filter\(\(item\) => item\.sourceImageId\)/);
  assert.match(candidateService, /const items = \(input\.sourceItems\?\.map\([\s\S]*\)\.filter\(isH5VisiblePriceCandidate\)\)/);
  assert.doesNotMatch(candidateService, /if \(item\.confidence !== null && item\.confidence < 0\.4\) return false/);
  assert.doesNotMatch(candidateService, /if \(!item\.brand \|\| !item\.product\) return false/);
});

test("store visit analysis repair script can backfill missing row candidates for a visit code", () => {
  const repairScript = readFileSync("scripts/backfill-store-visit-row-candidates.mjs", "utf8");
  assert.match(repairScript, /ST202607030004/);
  assert.match(repairScript, /generateAiPriceCandidates/);
  assert.match(repairScript, /sourceRowIndex/);
  assert.match(repairScript, /rowIndexUpdates/);
  assert.match(repairScript, /\.update\(\{\s*source_row_index:/);
  assert.match(repairScript, /updatedCount/);
  assert.match(repairScript, /candidateCountBefore/);
  assert.match(repairScript, /candidateCountAfter/);
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
  assert.match(analyzeRoute, /visit_status: "analyzed"/);
  assert.match(analyzeRoute, /analysis_error: message/);
});

test("store visit analyze route only allows first whole-visit analysis", () => {
  assert.match(analyzeRoute, /const isInitialWholeVisitAnalysis = typedVisit\.visit_status === "uploaded"[\s\S]*\(!typedVisit\.analysis_status \|\| typedVisit\.analysis_status === "pending"\)/);
  assert.match(analyzeRoute, /single-photo/i);
  assert.match(analyzeRoute, /status: 400/);
});

test("single-photo refresh failure keeps analyzed workflow state while marking failed result", () => {
  assert.match(storeVisitRefreshRoute, /analysisStatusOverride: "failed"/);
  assert.match(storeVisitRefreshRoute, /visitStatusOverride: "analyzed"/);
  assert.doesNotMatch(storeVisitRefreshRoute, /visitStatusOverride: "uploaded"/);
});

test("store visit refresh route runs analysis in-request instead of after background callback", () => {
  assert.doesNotMatch(storeVisitRefreshRoute, /after\s*\(/);
  assert.match(storeVisitRefreshRoute, /await runStoreVisitAnalysis\(/);
});

test("store visit refresh route marks affected images analyzing without clearing old vision before rerun", () => {
  assert.match(storeVisitRefreshRoute, /from\("offline_visit_images"\)\s*[\s\S]*analysis_status: "analyzing"/);
  assert.doesNotMatch(storeVisitRefreshRoute, /vision_result: null/);
  assert.match(storeVisitRefreshRoute, /refreshStoreVisitStoredPriceState\(\{[\s\S]*analysisStatusOverride: "analyzing"/);
});

test("single-photo refresh rejects concurrent visit analysis with a 409 business error", () => {
  assert.match(storeVisitRefreshRoute, /select\("analysis_status"\)/);
  assert.match(storeVisitRefreshRoute, /typedVisit\?\.analysis_status === "analyzing"/);
  assert.match(storeVisitRefreshRoute, /Another photo in this visit is still analyzing\. Please wait for it to finish before updating the next photo\./);
  assert.match(storeVisitRefreshRoute, /status: 409/);
});

test("H5 detail only shows whole-visit analysis before the first run and keeps single-photo actions", () => {
  assert.match(storeVisitDetailH5, /const canRunWholeVisitAnalysis = status === "pending" && visit\?\.visit_status === "uploaded"/);
  assert.doesNotMatch(storeVisitDetailH5, /retryable && systemFailedImages\.length === 0/);
  assert.match(storeVisitDetailH5, /retryExistingImageAnalysis/);
  assert.match(storeVisitDetailH5, /replaces_image_id/);
});

test("H5 detail turns refresh 409 conflicts into a friendly operator message", () => {
  assert.match(storeVisitDetailH5, /analysisBusy: "Another photo is still analyzing\. Please wait before updating the next photo\."|analysisBusy: "当前有图片正在分析，请等待完成后再操作下一张图片"/);
  assert.match(storeVisitDetailH5, /if \(res\.status === 409\)/);
  assert.match(storeVisitDetailH5, /if \(analyzeRes\.status === 409\)/);
});

test("H5 detail analysis status card exposes a manual detail refresh button", () => {
  assert.match(storeVisitDetailH5, /const \[refreshingVisit, setRefreshingVisit\] = useState\(false\)/);
  assert.match(storeVisitDetailH5, /async function refreshVisitDetail\(\)/);
  assert.match(storeVisitDetailH5, /await loadVisit\(\{ preserveLoading: true \}\)/);
  assert.match(storeVisitDetailH5, /aria-label=\{text\.refreshVisit\}/);
  assert.match(storeVisitDetailH5, /title=\{text\.refreshVisit\}/);
  assert.match(storeVisitDetailH5, /className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50\/70 text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-white hover:text-slate-700 disabled:opacity-60"/);
  assert.match(storeVisitDetailH5, /\{refreshingVisit \? <Loader2 className="h-3\.5 w-3\.5 animate-spin" \/> : <RefreshCw className="h-3\.5 w-3\.5" \/>\}/);
  assert.doesNotMatch(storeVisitDetailH5, /<span>\{text\.refreshVisit\}<\/span>/);
});

test("store visit analysis supports partial success and image-level failure records", () => {
  assert.match(storeVisitAiDebug, /priceImageFailures/);
  assert.match(storeVisitAiDebug, /analysis_status: "failed"/);
  assert.match(storeVisitAiDebug, /analysis_error: systemErrorMessage/);
  assert.match(storeVisitAnalysis, /finalizeStoreVisitImageAnalysisStatuses/);
  assert.match(storeVisitAnalysis, /await finalizeStoreVisitImageAnalysisStatuses\(/);
  assert.match(storeVisitAnalysis, /analysisStatus = hasRetakeRequiredImages[\s\S]*"action_required"[\s\S]*aiAnalysis\.partialFailure[\s\S]*"partial"[\s\S]*"completed"/);
  assert.match(storeVisitAnalysis, /visit_status: "analyzed"/);
  assert.match(storeVisitAnalysis, /analysis_partial_failures/);
});

test("retake-required visit analysis is separated from system failure", () => {
  assert.match(storeVisitAnalysis, /price_photo_retake_required/);
  assert.doesNotMatch(storeVisitAnalysis, /analysisStatus = allFailuresAreRetakeRequired \? "failed"/);
  assert.doesNotMatch(storeVisitAnalysis, /visit_status: allFailuresAreRetakeRequired \? "uploaded"/);
});

test("any retake-required price photo escalates the visit to action_required even when other photos succeeded", () => {
  assert.match(storeVisitAnalysis, /const analysisStatus = hasRetakeRequiredImages[\s\S]*\? "action_required"/);
  assert.match(storeVisitImageMaintenance, /} else if \(retakeRequiredImages\.length > 0\) \{\s*analysisStatus = "action_required";/s);
});

test("partial status is displayed as partial failed for operators", () => {
  const mobileI18n = readFileSync("src/lib/mobile-i18n.ts", "utf8");
  assert.match(mobileI18n, /statusPartial: "Partial failed"/);
});

test("derived visit analysis state does not mark zero price photos as completed", () => {
  assert.doesNotMatch(storeVisitImageMaintenance, /if \(priceImages\.length === 0\) \{\s*analysisStatus = "completed";/s);
});

test("derived visit analysis state keeps in-flight image analysis as analyzing", () => {
  assert.match(storeVisitImageMaintenance, /const anyPending = priceImages\.some\(\(image\) => image\.analysis_status === "pending" \|\| image\.analysis_status === "analyzing"\)/);
  assert.match(storeVisitImageMaintenance, /} else if \(anyPending\) \{\s*analysisStatus = "analyzing";/s);
});

test("H5 list derives retake-required from structured status instead of error text", () => {
  assert.doesNotMatch(storeVisitsListH5, /price_photo_retake_required/);
  assert.doesNotMatch(storeVisitsListH5, /function hasPricePhotoRetakeRequired/);
  assert.match(storeVisitsListH5, /if \(status === "partial" \|\| status === "action_required" \|\| status === "failed" \|\| status === "analyzing"\) return status;/);
});

test("store visit analysis keeps display failures separate without running display AI in the price-only flow", () => {
  assert.doesNotMatch(storeVisitAiDebug, /analyzeStoreVisitDisplayImages/);
  assert.match(storeVisitAiDebug, /display_image_failures/);
  assert.match(storeVisitAiDebug, /display_analysis: null/);
  assert.match(storeVisitAiDebug, /displayAnalysisError: string \| null = null/);
  assert.match(storeVisitAnalysis, /display_analysis: null/);
});

test("store visit price image analysis uses fixed parallelism of 5 inside a visit", () => {
  assert.match(storeVisitAiDebug, /const priceImageConcurrency = 5/);
  assert.match(storeVisitAiDebug, /Array\.from\(\{ length: workerCount \}, \(\) => worker\(\)\)/);
  assert.match(storeVisitAiDebug, /await Promise\.all\(/);
  assert.doesNotMatch(storeVisitAiDebug, /for \(const item of priceImageInputs\)/);
});

test("store visit analysis persists visit-level timing metrics into summary_result", () => {
  assert.match(analyzeRoute, /const analysisStartedAt = new Date\(\)/);
  assert.match(storeVisitAnalysis, /visitAnalysisStartedAt/);
  assert.match(storeVisitAnalysis, /visit_analysis_duration_ms/);
  assert.match(storeVisitAnalysis, /price_image_parallelism:\s*5/);
  assert.match(storeVisitAnalysis, /visit_analysis_completed_at/);
});

test("store visit price analysis persists prompt metadata for image and summary debugging", () => {
  assert.match(storeVisitAi, /PRICE_IMAGE_PROMPT_VERSION/);
  assert.match(storeVisitAi, /prompt_hash/);
  assert.match(storeVisitAi, /analysis_metadata/);
  assert.match(storeVisitAiDebug, /prompt_version/);
  assert.match(storeVisitAiDebug, /prompt_hash/);
  assert.match(storeVisitAiDebug, /metadata/);
  assert.match(storeVisitAiDebug, /price_image_results/);
});

test("single-photo refresh preserves the first whole-visit analysis timing metrics", () => {
  assert.doesNotMatch(storeVisitRefreshRoute, /visitAnalysisStartedAt:/);
  assert.match(storeVisitAnalysis, /firstVisitAnalysisStartedAt/);
  assert.match(storeVisitAnalysis, /firstVisitAnalysisCompletedAt/);
  assert.match(storeVisitAnalysis, /firstVisitAnalysisDurationMs/);
  assert.match(storeVisitAnalysis, /visit_analysis_started_at: firstVisitAnalysisStartedAt/);
  assert.match(storeVisitAnalysis, /visit_analysis_completed_at: firstVisitAnalysisCompletedAt/);
  assert.match(storeVisitAnalysis, /visit_analysis_duration_ms: firstVisitAnalysisDurationMs/);
});

test("store visit refresh forces target price images to bypass cached vision results", () => {
  assert.match(storeVisitRefreshRoute, /forceAnalyzeImageIds:\s*refreshImageIds/);
  assert.match(storeVisitAnalysis, /forceAnalyzeImageIds\?: string\[\]/);
  assert.match(storeVisitAnalysis, /forceAnalyzeImageIds:\s*input\.forceAnalyzeImageIds/);
  assert.match(storeVisitAiDebug, /forceAnalyzeImageIds\?: string\[\]/);
  assert.match(storeVisitAiDebug, /const forceAnalyzeImageIdSet = new Set/);
  assert.match(storeVisitAiDebug, /const forceAnalyze = forceAnalyzeImageIdSet\.has\(tableImage\.id\)/);
  assert.match(storeVisitAiDebug, /!forceAnalyze && tableImage\.analysis_status === "analyzed"/);
});

test("store visit refresh replaces old price impact only after forced AI success", () => {
  const invalidateIndex = storeVisitAnalysis.indexOf("await invalidateStoreVisitImagePriceImpact");
  const runAiIndex = storeVisitAnalysis.indexOf("await runStoreVisitAiAnalysisForVisit");
  const successIdsIndex = storeVisitAnalysis.indexOf("successfulForcedImageIds");
  assert.ok(runAiIndex >= 0, "analysis should invoke the AI layer");
  assert.ok(successIdsIndex > runAiIndex, "successful forced image ids should be derived after AI returns");
  assert.ok(invalidateIndex > successIdsIndex, "old candidates and snapshots should be invalidated after AI succeeds");
  assert.equal(
    storeVisitAnalysis.slice(0, runAiIndex).includes("await invalidateStoreVisitImagePriceImpact"),
    false,
    "old candidates and snapshots must not be invalidated before AI returns",
  );
});

test("store visit refresh persists AI usage metadata for forced image reruns", () => {
  assert.match(storeVisitAiDebug, /usage:\s*result\.metadata\.usage/);
  assert.match(storeVisitRefreshRoute, /forced_image_results/);
  assert.match(storeVisitRefreshRoute, /usage_present/);
});

test("store visit analysis failure path also persists visit-level timing metrics", () => {
  assert.match(analyzeRoute, /summary_result:\s*\{[\s\S]*analysis_metrics:/);
  assert.match(analyzeRoute, /visit_analysis_duration_ms/);
  assert.match(analyzeRoute, /visit_analysis_completed_at/);
});

test("store visit detail route can reconcile stale analyzing visits after completed analysis metrics exist", () => {
  assert.match(readFileSync("src/app/api/store-visit/[id]/route.ts", "utf8"), /visit_analysis_completed_at/);
  assert.match(readFileSync("src/app/api/store-visit/[id]/route.ts", "utf8"), /refreshStoreVisitStoredPriceState/);
});

test("stored price state recovery can finalize stale analyzing images from persisted evidence", () => {
  assert.match(storeVisitImageMaintenance, /visit_analysis_completed_at/);
  assert.match(storeVisitImageMaintenance, /image\.analysis_status === "pending" \|\| image\.analysis_status === "analyzing"/);
  assert.match(storeVisitImageMaintenance, /asPriceImageAnalysis\(image\.vision_result\)/);
  assert.match(storeVisitImageMaintenance, /analysis_status: "analyzed"/);
  assert.match(storeVisitImageMaintenance, /analysis_status: "failed"/);
});

test("store visit monitor has a dedicated backend navigation entry", () => {
  assert.match(appShell, /href: "\/store-visit-monitor"/);
  assert.match(appShell, /Store Visit Monitor/);
});

test("store visit monitor page shows summary cards, visit latency metrics, and a default recent-24-hour filter", () => {
  assert.match(storeVisitMonitorPage, /PageShellState/);
  assert.match(storeVisitMonitorPage, /Recent 24 hours|最近24小时/);
  assert.match(storeVisitMonitorPage, /P50 visit analysis time/);
  assert.match(storeVisitMonitorPage, /P95 visit analysis time/);
  assert.match(storeVisitMonitorPage, /Full analysis time/);
  assert.match(storeVisitMonitorPage, /Started at/);
  assert.match(storeVisitMonitorPage, /Completed at/);
});

test("store visit monitor data path reads analysis metrics and computes visit latency percentiles", () => {
  assert.match(dataFile, /export async function getStoreVisitMonitor/);
  assert.match(dataFile, /visit_analysis_duration_ms/);
  assert.match(dataFile, /P50|p50/);
  assert.match(dataFile, /P95|p95/);
  assert.match(dataFile, /last 24 hours|24 \* 60 \* 60 \* 1000/);
});

test("store visit monitor page adds a compact price parsing quality section with three boss metrics", () => {
  assert.match(storeVisitMonitorPage, /Price parsing quality/);
  assert.match(storeVisitMonitorPage, /Accuracy/);
  assert.match(storeVisitMonitorPage, /Auto-approval rate/);
  assert.match(storeVisitMonitorPage, /Average price deviation/);
});

test("store visit monitor data path exposes price parsing quality metrics from the quality view", () => {
  assert.match(dataFile, /quality:\s*\{/);
  assert.match(dataFile, /accuracy/);
  assert.match(dataFile, /autoApprovalRate/);
  assert.match(dataFile, /avgPriceDeviationRate/);
  assert.match(dataFile, /ai_price_candidate_quality_metrics_v1/);
});

test("store visit monitor list places row-level price parsing quality columns after Retake", () => {
  assert.match(storeVisitMonitorPage, /<th className="py-2 pr-3">Retake<\/th>/);
  assert.match(storeVisitMonitorPage, /<th className="py-2 pr-3">Accuracy<\/th>/);
  assert.match(storeVisitMonitorPage, /<th className="py-2 pr-3">Auto-approval rate<\/th>/);
  assert.match(storeVisitMonitorPage, /<th className="py-2 pr-3">Average price deviation<\/th>/);
  assert.match(
    storeVisitMonitorPage,
    /Retake<\/th>[\s\S]*Accuracy<\/th>[\s\S]*Auto-approval rate<\/th>[\s\S]*Average price deviation<\/th>[\s\S]*Started at<\/th>/,
  );
});

test("store visit monitor data path includes per-visit price parsing quality metrics", () => {
  assert.match(dataFile, /type StoreVisitMonitorItem = \{[\s\S]*accuracy: number \| null;/);
  assert.match(dataFile, /type StoreVisitMonitorItem = \{[\s\S]*autoApprovalRate: number \| null;/);
  assert.match(dataFile, /type StoreVisitMonitorItem = \{[\s\S]*avgPriceDeviationRate: number \| null;/);
  assert.match(dataFile, /visitQualityById/);
});

test("new H5 store visit requires at least one price-tag image, not only Makuku photos", () => {
  assert.match(storeVisitH5, /images\.makuku_shelf\.length === 0 && images\.competitor_shelf\.length === 0/);
  assert.doesNotMatch(storeVisitH5, /setError\(copy\.uploadMakukuShelfRequired\)/);
});

test("store visit AI uses image-level price parsing and separate display analysis", () => {
  assert.match(storeVisitAi, /export async function analyzeStoreVisitPriceImage/);
  assert.match(storeVisitAi, /export async function analyzeStoreVisitDisplayImages/);
  assert.match(storeVisitAiDebug, /analyzeStoreVisitPriceImage/);
  assert.doesNotMatch(storeVisitAiDebug, /analyzeStoreVisitDisplayImages/);
  assert.doesNotMatch(storeVisitAiDebug, /analyzeStoreVisitImages/);
  assert.match(storeVisitAiDebug, /composeStoreVisitAiResult/);
  assert.doesNotMatch(storeVisitAi, /Treat all images as ONE store-level observation/);
});
