import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

function readMaybe(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const storeVisitH5 = readFileSync("src/components/store-visit-h5.tsx", "utf8");
const storeVisitsListH5 = readFileSync("src/components/store-visits-list-h5.tsx", "utf8");
const analyzeRoute = readFileSync("src/app/api/store-visit/analyze/route.ts", "utf8");
const storeVisitImagesRoute = readFileSync("src/app/api/store-visit/[id]/images/route.ts", "utf8");
const storeVisitDetailRoute = readFileSync("src/app/api/store-visit/[id]/route.ts", "utf8");
const storeVisitDetailH5 = readFileSync("src/components/store-visit-detail-h5.tsx", "utf8");
const storeVisitRefreshRoute = readFileSync("src/app/api/store-visit/[id]/refresh/route.ts", "utf8");
const storeVisitAiCore = readFileSync("src/lib/store-visit-ai.ts", "utf8");
const storeVisitAiDebug = readFileSync("src/lib/store-visit-ai-debug.ts", "utf8");
const storeVisitAnalysis = readFileSync("src/lib/store-visit-analysis.ts", "utf8");
const storeVisitImageMaintenance = readFileSync("src/lib/store-visit-image-maintenance.ts", "utf8");
const appShell = readFileSync("src/components/app-shell.tsx", "utf8");
const storeVisitMonitorServerPage = readFileSync("src/app/[locale]/store-visit-monitor/page.tsx", "utf8");
const storeVisitMonitorClient = readFileSync("src/components/store-visit-monitor-client.tsx", "utf8");
const storeVisitMonitorPage = `${storeVisitMonitorServerPage}\n${storeVisitMonitorClient}`;
const storeVisitMonitorRoute = readMaybe("src/app/api/store-visit-monitor/route.ts");
const storeVisitMonitorExportRoute = readMaybe("src/app/api/store-visit-monitor/export/route.ts");
const storeVisitMonitorExportJobsRoute = readMaybe("src/app/api/store-visit-monitor/export-jobs/route.ts");
const storeVisitMonitorExportJobRoute = readMaybe("src/app/api/store-visit-monitor/export-jobs/[jobId]/route.ts");
const storeVisitMonitorExportDownloadRoute = readMaybe("src/app/api/store-visit-monitor/export-jobs/[jobId]/download/route.ts");
const storeVisitMonitorExportRunnerRoute = readMaybe("src/app/api/internal/store-visit-monitor/export-jobs/run/route.ts");
const storeVisitMonitorLoading = readMaybe("src/app/[locale]/store-visit-monitor/loading.tsx");
const storeVisitMonitorExportButton = readMaybe("src/components/store-visit-monitor-export-button.tsx");
const storeVisitMonitorExportMenu = readMaybe("src/components/store-visit-monitor-export-menu.tsx");
const storeVisitMonitorExportJobs = readMaybe("src/lib/store-visit-monitor-export-jobs.ts");
const storeVisitMonitorExportMigration = readMaybe("supabase/migrations/202607070001_store_visit_monitor_export_jobs.sql");
const dataFile = readFileSync("src/lib/data.ts", "utf8");
const storeVisitAiJobs = readMaybe("src/lib/store-visit-ai-jobs.ts");
const storeVisitAiJobRoute = readMaybe("src/app/api/store-visit/ai-jobs/[jobId]/route.ts");
const storeVisitAiRunnerRoute = readMaybe("src/app/api/internal/store-visit-ai/run/route.ts");
const storeVisitAiFinalizeMigration = readMaybe(
  "supabase/migrations/202607110001_store_visit_ai_job_atomic_finalization.sql",
);
const candidateSnapshotFkIndexMigration = readMaybe(
  "supabase/migrations/202607140003_ai_price_candidate_snapshot_fk_index.sql",
);
const vercelConfig = readFileSync("vercel.json", "utf8");

test("new H5 store visit returns to the list after uploads without waiting for AI analysis", () => {
  const analyzeIndex = storeVisitH5.indexOf('fetch("/api/store-visit/analyze"');
  const listRedirectIndex = storeVisitH5.indexOf('router.replace(`/${locale}/mobile/offline-capture`)');

  assert.ok(listRedirectIndex >= 0, "submit flow should keep returning to the visit list");
  assert.ok(analyzeIndex >= 0, "submit flow should enqueue backend AI analysis");
  assert.ok(analyzeIndex < listRedirectIndex, "submit flow should enqueue quickly before returning to the list");
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

test("store visit AI jobs reconcile persisted price rows into candidates after item success", () => {
  assert.match(storeVisitAiJobs, /syncStoreVisitPriceCandidatesFromImages/);
  assert.match(storeVisitAiJobs, /imageIds: \[item\.source_image_id\]/);
  assert.match(storeVisitAiJobs, /synced_candidate_count/);
  assert.match(storeVisitAiJobs, /eligible_candidate_row_count/);
});

test("store visit AI runner shares one product match context across image workers", () => {
  assert.match(storeVisitAiJobs, /let matchContextPromise: Promise<ProductMatchContext> \| null = null/);
  assert.match(storeVisitAiJobs, /const getMatchContext = \(\) => matchContextPromise \?\?= loadProductMatchContext\(supabase\)/);
  assert.match(storeVisitAiJobs, /getMatchContext: \(\) => Promise<ProductMatchContext>/);
  assert.match(storeVisitAiJobs, /const matchContext = await input\.getMatchContext\(\)/);
  assert.match(storeVisitAiJobs, /matchContext,\s*supabase,/);
});

test("store visit AI items persist monotonic pipeline stage timings", () => {
  assert.match(storeVisitAiJobs, /const processStartedAt = performance\.now\(\)/);
  assert.match(storeVisitAiJobs, /const performanceMs = \{[\s\S]*vision:[\s\S]*match_context:[\s\S]*candidate_sync:[\s\S]*priority_quality:[\s\S]*priority_auto_approval:[\s\S]*total:/);
  assert.match(storeVisitAiJobs, /performance_ms: performanceMs/);
  assert.match(storeVisitAiJobs, /Math\.round\(performance\.now\(\) - processStartedAt\)/);
});

test("store visit AI runs priority quality only for candidates inserted from the current image", () => {
  assert.match(storeVisitAiJobs, /syncResult\.inserted_candidate_ids\.length > 0/);
  assert.match(storeVisitAiJobs, /runPriorityPriceQualityGate\(\{[\s\S]*candidateIds: syncResult\.inserted_candidate_ids/);
  assert.match(storeVisitAiJobs, /priority_claimed/);
  assert.match(storeVisitAiJobs, /priority_auto_approved/);
});

test("store visit AI runner processes one claimed image through the full candidate pipeline", () => {
  assert.match(storeVisitAiJobs, /analyzeStoreVisitPriceImage/);
  assert.match(storeVisitAiJobs, /invalidateStoreVisitImagePriceImpact/);
  assert.match(storeVisitAiJobs, /syncStoreVisitPriceCandidatesFromImages\(\{[\s\S]*imageIds: \[item\.source_image_id\]/);
  assert.match(storeVisitAiJobs, /refreshStoreVisitStoredPriceState/);
  assert.doesNotMatch(storeVisitAiJobs, /runStoreVisitAnalysis/);
});

test("store visit AI runner uses a worker pool that refills slots after each image", () => {
  assert.match(storeVisitAiJobs, /function workersPerRun/);
  assert.match(storeVisitAiJobs, /const worker = async \(\) => \{[\s\S]*while \(Date\.now\(\) - startedAt < maxRunDurationMs\(\)\)/);
  assert.match(storeVisitAiJobs, /await Promise\.all\(Array\.from\(\{ length: workerCount \}, \(\) => worker\(\)\)\)/);
  assert.doesNotMatch(storeVisitAiJobs, /while \(processed < maxItemsPerRun\(\)/);
});

test("store visit AI claim RPC is FIFO and does not block same-visit image concurrency", () => {
  const queueMigration = readMaybe("supabase/migrations/202607160001_store_visit_ai_image_item_queue.sql");
  assert.match(queueMigration, /next_attempt_at timestamptz/i);
  assert.match(queueMigration, /job\.created_at asc,\s*item\.position asc,\s*item\.created_at asc/i);
  assert.match(queueMigration, /item\.next_attempt_at is null or item\.next_attempt_at <= now\(\)/i);
  assert.doesNotMatch(queueMigration, /processing_job\.visit_id = job\.visit_id/);
});

test("store visit AI watchdog waits for stable uploads before creating initial jobs", () => {
  assert.match(storeVisitAiJobs, /minimumInitialAnalysisImageAgeMs/);
  assert.match(storeVisitAiJobs, /latestImageCreatedAt/);
});

test("internal store visit candidate sync endpoint and script exist", () => {
  const endpoint = readMaybe("src/app/api/internal/store-visit/price-candidates/sync/route.ts");
  const script = readMaybe("scripts/sync-store-visit-price-candidates.mjs");
  assert.match(endpoint, /syncStoreVisitPriceCandidatesFromImages/);
  assert.match(endpoint, /INTERNAL_JOB_SECRET/);
  assert.match(script, /sync-store-visit-price-candidates/);
  assert.match(script, /visit_code/);
});

test("H5 list does not expose manual whole-visit Ai after initial analysis", () => {
  assert.doesNotMatch(storeVisitsListH5, /function reanalyzeVisit/);
  assert.doesNotMatch(storeVisitsListH5, /reanalyzingVisitId/);
  assert.doesNotMatch(storeVisitsListH5, /onClick=\{\(\) => reanalyzeVisit\(visit\.id\)\}/);
  assert.match(storeVisitsListH5, /openVisitToHandleWork/);
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
  assert.match(storeVisitAiRunnerRoute, /triggerPriceQualityGateRunner/);
  assert.match(storeVisitAnalysis, /generateAiPriceCandidates/);
  assert.match(storeVisitAnalysis, /autoApproveAiPriceCandidatesForVisit/);
  assert.match(storeVisitAnalysis, /autoReview/);
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
  assert.match(
    readFileSync("supabase/migrations/202607130001_price_quality_gate_phase1.sql", "utf8"),
    /if v_candidate\.source_image_id is null then\s*raise exception 'AI price candidate is missing source_image_id and cannot create a price snapshot';/s,
  );
});

test("store visit analysis keeps all visible H5 image rows as candidates even when confidence is low or brand is missing", () => {
  const candidateService = readFileSync("src/lib/ai-price-candidates.ts", "utf8");
  assert.match(candidateService, /export function isH5VisiblePriceCandidate/);
  assert.match(candidateService, /export async function buildAiPriceCandidateRows/);
  assert.match(candidateService, /const scopedItems = items\.filter\(\(item\) => item\.sourceImageId\)/);
  assert.match(candidateService, /const items = input\.sourceItems[\s\S]*\.filter\(isH5VisiblePriceCandidate\)/);
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

test("store visit analysis accepts active price image rows for initial analysis", () => {
  assert.match(analyzeRoute, /offline_visit_images\(id,image_type,deleted_at,replaced_by_image_id\)/);
  assert.match(analyzeRoute, /activePriceImageIds/);
  assert.match(analyzeRoute, /No price-tag photos found for this visit/);
  assert.doesNotMatch(analyzeRoute, /legacyImageCount/);
});

test("store visit analysis failures keep retryable status and error details", () => {
  assert.match(storeVisitAiFinalizeMigration, /analysis_status = case when p_outcome = 'failed' then 'failed' else 'analyzed' end/);
  assert.match(storeVisitAiJobs, /visitStatusOverride: "analyzed"/);
  assert.match(storeVisitAiJobs, /analysisErrorOverride: analysisFailure/);
});

test("store visit analyze route only allows first whole-visit analysis", () => {
  assert.match(analyzeRoute, /const isInitialWholeVisitAnalysis = typedVisit\.visit_status === "uploaded"[\s\S]*\(!typedVisit\.analysis_status \|\| typedVisit\.analysis_status === "pending"\)/);
  assert.match(analyzeRoute, /This visit is not waiting for initial AI analysis/);
  assert.match(analyzeRoute, /status: 400/);
});

test("store visit analyze route checks visit ownership before creating a job", () => {
  assert.match(analyzeRoute, /isAllowedAdminRole/);
  assert.match(analyzeRoute, /typedVisit\.user_id === auth\.session\.id/);
  assert.match(analyzeRoute, /typedVisit\.uploader_user_id === auth\.session\.id/);
});

test("single-photo refresh failure keeps analyzed workflow state while marking failed result", () => {
  assert.match(storeVisitAiJobs, /analysisStatusOverride: "failed"/);
  assert.match(storeVisitAiJobs, /visitStatusOverride: "analyzed"/);
  assert.doesNotMatch(storeVisitAiJobs, /visitStatusOverride: "uploaded"/);
});

test("store visit refresh route creates a durable background job instead of running AI in-request", () => {
  assert.match(storeVisitRefreshRoute, /createStoreVisitAiJob/);
  assert.match(storeVisitRefreshRoute, /after\s*\(/);
  assert.match(storeVisitRefreshRoute, /queued:\s*true/);
  assert.match(storeVisitRefreshRoute, /active_ai_job/);
  assert.doesNotMatch(storeVisitRefreshRoute, /await runStoreVisitAnalysis\(/);
});

test("store visit refresh route checks visit ownership before creating a reanalysis job", () => {
  assert.match(storeVisitRefreshRoute, /isAllowedAdminRole/);
  assert.match(storeVisitRefreshRoute, /visitRow\.user_id === auth\.session\.id/);
  assert.match(storeVisitRefreshRoute, /visitRow\.uploader_user_id === auth\.session\.id/);
});

test("store visit refresh route does not mark images analyzing before the runner claims a job item", () => {
  assert.doesNotMatch(storeVisitRefreshRoute, /from\("offline_visit_images"\)\s*[\s\S]*analysis_status: "analyzing"/);
  assert.doesNotMatch(storeVisitRefreshRoute, /vision_result: null/);
  assert.doesNotMatch(storeVisitRefreshRoute, /refreshStoreVisitStoredPriceState\(\{[\s\S]*analysisStatusOverride: "analyzing"/);
});

test("single-photo refresh rejects concurrent visit analysis with a 409 business error", () => {
  assert.match(storeVisitAiJobs, /activeJobStatuses/);
  assert.match(storeVisitRefreshRoute, /409/);
  assert.match(storeVisitRefreshRoute, /active_ai_job/);
  assert.match(storeVisitRefreshRoute, /status: 409/);
});

test("H5 detail only shows whole-visit analysis before the first run and keeps single-photo actions", () => {
  assert.match(storeVisitDetailH5, /const hasPendingOrAnalyzingImage = \(visit\?\.offline_visit_images \?\? \[\]\)\.some\(\(image\) => image\.analysis_status === "pending" \|\| image\.analysis_status === "analyzing"\)/);
  assert.match(storeVisitDetailH5, /const hasPendingOrAnalyzingPriceImage = \(visit\?\.offline_visit_images \?\? \[\]\)\.some\(\(image\) => isPriceImageType\(image\.image_type\) && \(image\.analysis_status === "pending" \|\| image\.analysis_status === "analyzing"\)\)/);
  assert.match(storeVisitDetailH5, /const visitAnalysisInProgress = analyzing \|\| fullVisitReanalyzing \|\| fullVisitAiActive \|\| hasPendingOrAnalyzingPriceImage \|\| status === "analyzing"/);
  assert.match(storeVisitDetailH5, /const canRunWholeVisitAnalysis = status === "pending" && visit\?\.visit_status === "uploaded" && !hasPendingOrAnalyzingImage && !activeAiJob/);
  assert.match(storeVisitDetailH5, /const canShowFullVisitReanalysis = canRunFullVisitAi && status !== "pending" && !hasPendingOrAnalyzingImage/);
  assert.match(storeVisitDetailH5, /function PriceSectionGroup\(\{[\s\S]*onPreview,\s*onPreviewStored,\s*onStoredPreviewError,\s*onOpenActions,/);
  assert.doesNotMatch(storeVisitDetailH5, /retryable && systemFailedImages\.length === 0/);
  assert.match(storeVisitDetailH5, /retryExistingImageAnalysis/);
  assert.match(storeVisitDetailH5, /replaces_image_id/);
});

test("H5 detail fetches fresh visit thumbnails and retries broken stored thumbnails without switching the page to originals", () => {
  assert.match(storeVisitDetailH5, /withMinimumDelay\(fetch\(`\/api\/store-visit\/\$\{id\}`, \{ cache: "no-store" \}\), 300\)/);
  assert.match(storeVisitDetailH5, /const \[storedPreviewRefreshAttempts, setStoredPreviewRefreshAttempts\] = useState<Record<string, boolean>>\(\{\}\)/);
  assert.match(storeVisitDetailH5, /async function handleStoredThumbnailError\(input: \{ imageId: string \}\)/);
  assert.match(storeVisitDetailH5, /onStoredPreviewError: \(image: \{ imageId: string \}\) => void;/);
  assert.match(storeVisitDetailH5, /onError=\{\(event\) => \{[\s\S]*const failedSrc = normalizeBrowserImageSrc\(event\.currentTarget\.currentSrc \|\| event\.currentTarget\.src\);[\s\S]*if \(failedSrc !== expectedThumbnailSrc\) return;[\s\S]*void onStoredPreviewError\(\{/);
  assert.doesNotMatch(storeVisitDetailH5, /setStoredPreviewOverrides/);
});

test("H5 detail turns refresh 409 conflicts into a friendly operator message", () => {
  assert.match(storeVisitDetailH5, /analysisBusy: "Another photo is still analyzing\. Please wait before updating the next photo\."|analysisBusy: "褰撳墠鏈夊浘鐗囨鍦ㄥ垎鏋愶紝璇风瓑寰呭畬鎴愬悗鍐嶆搷浣滀笅涓€寮犲浘鐗?/);
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
  assert.match(storeVisitsListH5, /visit\.price_handling\?\.action_counts\.retake_required/);
  assert.match(storeVisitsListH5, /const priceRetakeRequired = \(visit\.price_handling\?\.action_counts\.retake_required \?\? 0\) > 0;/);
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
  assert.match(storeVisitAiJobs, /refreshStoreVisitStoredPriceState/);
  assert.match(storeVisitAnalysis, /visitAnalysisStartedAt/);
  assert.match(storeVisitAnalysis, /visit_analysis_duration_ms/);
  assert.match(storeVisitAnalysis, /price_image_parallelism:\s*5/);
  assert.match(storeVisitAnalysis, /visit_analysis_completed_at/);
});

test("store visit price analysis persists prompt metadata for image and summary debugging", () => {
  assert.match(storeVisitAiCore, /PRICE_IMAGE_PROMPT_VERSION/);
  assert.match(storeVisitAiCore, /prompt_hash/);
  assert.match(storeVisitAiCore, /analysis_metadata/);
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

test("store visit refresh reruns target images through the image-level AI pipeline", () => {
  assert.match(storeVisitAiJobs, /analyzeStoreVisitPriceImage\(\{/);
  assert.match(storeVisitAiJobs, /imageId: item\.source_image_id/);
  assert.match(storeVisitAiJobs, /vision_result: visionResult/);
  assert.match(storeVisitAiJobs, /syncStoreVisitPriceCandidatesFromImages\(\{[\s\S]*imageIds: \[item\.source_image_id\]/);
  assert.doesNotMatch(storeVisitAiJobs, /runStoreVisitAnalysis/);
  assert.doesNotMatch(storeVisitRefreshRoute, /candidate_sync/);
});

test("store visit refresh replaces old price impact only after image AI success", () => {
  const invalidateIndex = storeVisitAiJobs.indexOf("await invalidateStoreVisitImagePriceImpact");
  const runAiIndex = storeVisitAiJobs.indexOf("await analyzeStoreVisitPriceImage");
  const imageUpdateIndex = storeVisitAiJobs.indexOf("vision_result: visionResult");
  assert.ok(runAiIndex >= 0, "runner should invoke the image-level AI layer");
  assert.ok(imageUpdateIndex > runAiIndex, "vision result should be persisted after AI returns");
  assert.ok(invalidateIndex > imageUpdateIndex, "old candidates and snapshots should be invalidated after AI succeeds");
  assert.equal(
    storeVisitAiJobs.slice(0, runAiIndex).includes("await invalidateStoreVisitImagePriceImpact"),
    false,
    "old candidates and snapshots must not be invalidated before AI returns",
  );
});

test("store visit refresh clears old candidates when a forced photo now requires retake", () => {
  assert.match(storeVisitAnalysis, /retakeRequiredForcedImageIds/);
  assert.match(storeVisitAnalysis, /retakeRequiredImageIdSet\.has\(imageId\)/);
  assert.match(storeVisitAnalysis, /imageIds:\s*\[\.\.\.successfulForcedImageIds,\s*\.\.\.retakeRequiredForcedImageIds\]/);
  assert.match(storeVisitAnalysis, /H5 re-analyze replaced or cleared the previous price result\./);
});

test("store visit AI job clears old price impact when a reanalyzed photo now requires retake", () => {
  assert.match(storeVisitAiJobs, /if \(retakeRequired\) \{[\s\S]*invalidateStoreVisitImagePriceImpact\(/);
  assert.match(storeVisitAiJobs, /rejectionReason: "AI image analysis cleared the previous price result because the photo now requires retake\."/);
  assert.match(storeVisitAiJobs, /candidateDisposition: "delete"/);
  assert.match(storeVisitAiJobs, /if \(!retakeRequired\) \{[\s\S]*syncStoreVisitPriceCandidatesFromImages\(/);
});

test("store visit reanalysis can clear snapshot links without scanning every price candidate", () => {
  assert.match(
    candidateSnapshotFkIndexMigration,
    /create index if not exists idx_ai_price_candidates_price_snapshot_id\s+on public\.ai_price_candidates\s*\(price_snapshot_id\)/i,
  );
});

test("store visit Ai persists AI usage metadata into job item summaries", () => {
  assert.match(storeVisitAiDebug, /usage:\s*result\.metadata\.usage/);
  assert.match(storeVisitAiJobs, /usage_present/);
  assert.match(storeVisitAiJobs, /response_id/);
  assert.match(storeVisitAiJobs, /result_summary/);
});

test("store visit AI adds durable job routes, atomic RPC claim, and cron sweep", () => {
  const migration = readMaybe("supabase/migrations/202607060001_store_visit_ai_jobs.sql");
  const queueMigration = readMaybe("supabase/migrations/202607160001_store_visit_ai_image_item_queue.sql");
  assert.match(storeVisitAiJobs, /store_visit_ai_jobs/);
  assert.match(storeVisitAiJobs, /store_visit_ai_job_items/);
  assert.match(storeVisitAiJobs, /claim_store_visit_ai_job_item/);
  assert.match(storeVisitAiJobs, /enqueuePendingStoreVisitInitialAnalysisJobs/);
  assert.match(storeVisitAiJobs, /defaultWorkersPerRun = 5/);
  assert.match(storeVisitAiJobs, /defaultMaxConcurrency = 20/);
  assert.match(storeVisitAiJobs, /defaultPendingEnqueueLimit = 20/);
  assert.match(storeVisitAiJobs, /pendingEnqueueLimit/);
  assert.match(storeVisitAiJobs, /runner completed/);
  assert.match(queueMigration || migration, /for update(?: of item)? skip locked/i);
  assert.match(migration, /create_store_visit_ai_job/);
  assert.match(queueMigration || migration, /claim_store_visit_ai_job_item/);
  assert.match(storeVisitAiJobRoute, /loadStoreVisitAiJob/);
  assert.match(storeVisitAiJobRoute, /summarizeStoreVisitAiJob/);
  assert.match(storeVisitAiRunnerRoute, /runStoreVisitAiJob/);
  assert.match(storeVisitAiRunnerRoute, /CRON_SECRET|requireCronSecret/);
  assert.match(vercelConfig, /store-visit-ai\/run/);
  assert.match(migration, /create table if not exists public\.store_visit_ai_jobs/);
  assert.match(migration, /create table if not exists public\.store_visit_ai_job_items/);
  assert.match(migration, /where status in \('queued','running'\)/);
  assert.doesNotMatch(migration, /for all to authenticated using \(true\)/);
  assert.match(migration, /revoke all on function public\.create_store_visit_ai_job/);
  assert.match(migration, /grant execute on function public\.claim_store_visit_ai_job_item/);
});

test("store visit AI hotfix migration removes ambiguous job_id output collisions in RPCs", () => {
  const hotfixMigration = readMaybe("supabase/migrations/202607060002_store_visit_ai_job_rpc_disambiguation.sql");
  assert.match(hotfixMigration, /drop function if exists public\.create_store_visit_ai_job\(uuid,text,uuid\[],text,jsonb\);/);
  assert.match(hotfixMigration, /create function public\.create_store_visit_ai_job/);
  assert.match(hotfixMigration, /returns table\(created_job_id uuid, reused boolean, conflict boolean\)/);
  assert.match(hotfixMigration, /where public\.store_visit_ai_job_items\.job_id = v_active_job\.id/);
  assert.match(hotfixMigration, /select v_active_job\.id, true, coalesce\(v_existing_ids, '\{\}'::uuid\[\]\) <> v_requested_ids/);
  assert.match(hotfixMigration, /drop function if exists public\.claim_store_visit_ai_job_item\(uuid,text,integer,integer\);/);
  assert.match(hotfixMigration, /create function public\.claim_store_visit_ai_job_item/);
  assert.match(hotfixMigration, /returns table\(claimed_job_id uuid, claimed_item_id uuid\)/);
  assert.match(hotfixMigration, /select updated_item\.job_id as claimed_job_id, updated_item\.id as claimed_item_id/);
});

test("store visit AI finalization is fenced, atomic, idempotent, and service-role only", () => {
  assert.match(storeVisitAiFinalizeMigration, /finalize_store_visit_ai_job_item/);
  assert.match(storeVisitAiFinalizeMigration, /for update/i);
  assert.match(storeVisitAiFinalizeMigration, /v_item\.worker_id is distinct from p_worker_id/i);
  assert.match(storeVisitAiFinalizeMigration, /already_finalized/);
  assert.match(storeVisitAiFinalizeMigration, /ownership_lost/);
  assert.match(storeVisitAiFinalizeMigration, /update public\.offline_visit_images/);
  assert.match(storeVisitAiFinalizeMigration, /count\(\*\) filter \(where status = 'succeeded'\)/i);
  assert.match(storeVisitAiFinalizeMigration, /revoke all on function public\.finalize_store_visit_ai_job_item/);
  assert.match(storeVisitAiFinalizeMigration, /grant execute on function public\.finalize_store_visit_ai_job_item[\s\S]*to service_role/);
});

test("store visit AI worker uses fenced finalization without converting control conflicts into image failures", () => {
  assert.match(storeVisitAiJobs, /rpc\("finalize_store_visit_ai_job_item"/);
  assert.match(storeVisitAiJobs, /p_worker_id: input\.item\.worker_id/);
  assert.match(storeVisitAiJobs, /finalizeResult === "ownership_lost"/);
  assert.match(storeVisitAiJobs, /item ownership lost/);
  assert.doesNotMatch(storeVisitAiJobs, /Unable to finalize store visit AI job item/);
  assert.doesNotMatch(storeVisitAiJobs, /async function markImageFailed/);
});

test("store visit detail only reconciles queued AI items and never steals processing work", () => {
  assert.match(storeVisitAiJobs, /const reconcilableItems = input\.items\.filter\(\(item\) => item\.status === "queued"\)/);
  assert.match(storeVisitAiJobs, /reconcileStoreVisitAiJobFromImages/);
  assert.match(storeVisitAiJobs, /image\.analysis_status === "analyzed"/);
  assert.match(storeVisitDetailRoute, /reconcileActiveStoreVisitAiJob/);
  assert.doesNotMatch(storeVisitDetailRoute, /loadActiveStoreVisitAiJob/);
});

test("reanalysis jobs never reconcile from pre-existing image status", () => {
  assert.match(
    storeVisitAiJobs,
    /if \(input\.job\.job_type !== "initial_analysis"\) \{\s*return \{ job: input\.job, items: input\.items \};\s*\}/,
  );
});

test("store visit AI trigger never runs the long runner inline without a cron secret", () => {
  assert.match(storeVisitAiJobs, /CRON_SECRET/);
  assert.match(storeVisitAiJobs, /missing CRON_SECRET/);
  assert.doesNotMatch(
    storeVisitAiJobs,
    /if \(!secret\) \{\s*const result = await runStoreVisitAiJob\(\{ jobId: input\.jobId \}\)/,
  );
  assert.doesNotMatch(
    storeVisitAiJobs,
    /triggerPriceQualityGateRunner\(\{ requestUrl: input\.requestUrl \}\)/,
  );
});

test("store visit analysis failure path also persists visit-level timing metrics", () => {
  assert.match(storeVisitAnalysis, /summary_result:\s*\{[\s\S]*analysis_metrics:/);
  assert.match(storeVisitAnalysis, /visit_analysis_duration_ms/);
  assert.match(storeVisitAnalysis, /visit_analysis_completed_at/);
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
  assert.match(storeVisitMonitorPage, /Recent 24 hours|鏈€杩?4灏忔椂/);
  assert.match(storeVisitMonitorPage, /P50 visit analysis time/);
  assert.match(storeVisitMonitorPage, /P95 visit analysis time/);
  assert.match(storeVisitMonitorPage, /Full analysis time/);
  assert.match(storeVisitMonitorPage, /Started at/);
  assert.match(storeVisitMonitorPage, /Completed at/);
});

test("store visit monitor list shows started and completed timestamps with second-level datetime formatting", () => {
  assert.match(storeVisitMonitorClient, /formatJakartaDateTimeSeconds/);
  assert.match(storeVisitMonitorClient, /visit\.startedAt \? formatJakartaDateTimeSeconds\(visit\.startedAt\) : "-"/);
  assert.match(storeVisitMonitorClient, /visit\.completedAt \? formatJakartaDateTimeSeconds\(visit\.completedAt\) : "-"/);
});

test("store visit monitor data path reads analysis metrics and computes visit latency percentiles", () => {
  assert.match(dataFile, /export async function getStoreVisitMonitor/);
  assert.match(dataFile, /visit_analysis_duration_ms/);
  assert.match(dataFile, /P50|p50/);
  assert.match(dataFile, /P95|p95/);
  assert.match(dataFile, /last 24 hours|24 \* 60 \* 60 \* 1000/);
});

test("store visit monitor excludes draft zero-image visits from backend analysis monitoring", () => {
  assert.match(dataFile, /\.neq\("visit_status", "draft"\)/);
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

test("store visit monitor list exposes server-side pagination controls", () => {
  assert.match(storeVisitMonitorPage, /page_size/);
  assert.match(storeVisitMonitorPage, /Showing .* of .* visits/);
  assert.match(storeVisitMonitorPage, /Previous/);
  assert.match(storeVisitMonitorPage, /Next/);
});

test("store visit monitor filter bar uses the compact labeled input pattern from photo price review", () => {
  assert.match(storeVisitMonitorPage, /className="grid gap-3 md:grid-cols-\[minmax\(180px,1fr\)_minmax\(220px,1\.1fr\)_minmax\(180px,1fr\)_minmax\(180px,220px\)\]"/);
  assert.match(storeVisitMonitorPage, /className="flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200"/);
  assert.doesNotMatch(storeVisitMonitorPage, /<SelectInput name="page_size"/);
});

test("store visit monitor pagination row contains page size and page counter together", () => {
  assert.match(storeVisitMonitorPage, /<form method="get" className="flex items-center gap-2">[\s\S]*name="page_size"/);
  assert.match(storeVisitMonitorPage, /copy hidden filters into the page-size form|Page \{monitor\.pagination\.page\} of \{monitor\.pagination\.totalPages\}/);
  assert.match(
    storeVisitMonitorPage,
    /<div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-sm">[\s\S]*name="page_size"[\s\S]*Previous[\s\S]*Page \{monitor\.pagination\.page\} of \{monitor\.pagination\.totalPages\}[\s\S]*Next/s,
  );
});

test("store visit monitor list can export the displayed analysis columns to Excel", () => {
  assert.match(storeVisitMonitorPage, /StoreVisitMonitorExportButton/);
  assert.match(storeVisitMonitorExportRoute, /import \* as XLSX from "xlsx"/);
  assert.match(storeVisitMonitorExportRoute, /Visit Code/);
  assert.match(storeVisitMonitorExportRoute, /Average price deviation/);
  assert.match(storeVisitMonitorExportRoute, /Create time/);
  assert.match(storeVisitMonitorExportRoute, /Update time/);
  assert.match(storeVisitMonitorExportRoute, /Content-Disposition/);
  assert.match(storeVisitMonitorExportRoute, /store-visit-monitor/);
});

test("store visit monitor export jobs persist filter state and progress in a dedicated table", () => {
  assert.match(storeVisitMonitorExportMigration, /create table if not exists public\.store_visit_monitor_export_jobs/i);
  assert.match(storeVisitMonitorExportMigration, /status text not null/i);
  assert.match(storeVisitMonitorExportMigration, /filters jsonb not null/i);
  assert.match(storeVisitMonitorExportMigration, /total_rows integer not null default 0/i);
  assert.match(storeVisitMonitorExportMigration, /exported_rows integer not null default 0/i);
  assert.match(storeVisitMonitorExportMigration, /file_path text null/i);
});

test("store visit monitor export job APIs include create, poll, download, and internal runner routes", () => {
  assert.match(storeVisitMonitorExportJobsRoute, /export async function GET/);
  assert.match(storeVisitMonitorExportJobsRoute, /export async function POST/);
  assert.match(storeVisitMonitorExportJobRoute, /export async function GET/);
  assert.match(storeVisitMonitorExportDownloadRoute, /export async function GET/);
  assert.match(storeVisitMonitorExportRunnerRoute, /runStoreVisitMonitorExportJob/);
  assert.match(storeVisitMonitorExportRunnerRoute, /triggerStoreVisitMonitorExportJobRunner/);
});

test("store visit monitor export backend strips pagination and runs a storage-backed background job", () => {
  assert.match(storeVisitMonitorExportJobs, /store_visit_monitor_export_jobs/);
  assert.match(storeVisitMonitorExportJobs, /page_size/);
  assert.match(storeVisitMonitorExportJobs, /delete filters\.page_size|page_size: undefined/);
  assert.match(storeVisitMonitorExportJobs, /delete filters\.page|page: undefined/);
  assert.match(storeVisitMonitorExportJobs, /storage/i);
  assert.match(storeVisitMonitorExportJobs, /exported_rows/);
  assert.match(storeVisitMonitorExportJobs, /file_path/);
  assert.match(storeVisitMonitorExportJobs, /storeVisitMonitorExportBatchSize = 100/);
  assert.match(dataFile, /getStoreVisitMonitorExportBatch/);
});

test("store visit monitor export uses a dedicated paged row loader instead of the summary query path", () => {
  assert.match(dataFile, /export async function getStoreVisitMonitorExportBatch/);
  assert.match(dataFile, /export async function getStoreVisitMonitorExport[\s\S]*getStoreVisitMonitorExportBatch/);
});

test("store visit monitor export skips row quality metrics to keep background exports fast", () => {
  assert.doesNotMatch(storeVisitMonitorExportJobs, /Accuracy:/);
  assert.doesNotMatch(storeVisitMonitorExportJobs, /Auto-approval rate/);
  assert.doesNotMatch(storeVisitMonitorExportJobs, /Average price deviation/);
  assert.match(dataFile, /export async function getStoreVisitMonitorExportBatch[\s\S]*options: \{ includeQuality\?: boolean \} = \{\}/);
  assert.match(dataFile, /if \(options\.includeQuality === false\) \{/);
  assert.match(storeVisitMonitorExportJobs, /includeQuality: false/);
});

test("store visit monitor detail links open in a new window", () => {
  assert.match(storeVisitMonitorPage, /Open details/);
  assert.match(storeVisitMonitorPage, /target="_blank"/);
  assert.match(storeVisitMonitorPage, /rel="noopener noreferrer"/);
});

test("store visit monitor page uses a client export button that only creates the job and shows a success hint", () => {
  assert.match(storeVisitMonitorPage, /StoreVisitMonitorExportButton/);
  assert.match(storeVisitMonitorExportButton, /fetch\("\/api\/store-visit-monitor\/export-jobs"/);
  assert.doesNotMatch(storeVisitMonitorExportButton, /setInterval|setTimeout/);
  assert.match(storeVisitMonitorExportButton, /Export task created|Task created/);
  assert.match(storeVisitMonitorExportButton, /<button/);
});

test("app shell exposes a top-header export history entry near the language switcher", () => {
  assert.match(appShell, /StoreVisitMonitorExportMenu/);
  assert.match(appShell, /replacePathLocale/);
  assert.match(appShell, /<StoreVisitMonitorExportMenu locale=\{locale\} \/>/);
});

test("store visit monitor export menu loads current-user jobs and exposes completed downloads", () => {
  assert.match(storeVisitMonitorExportJobsRoute, /requested_by/);
  assert.match(storeVisitMonitorExportJobsRoute, /download_url/);
  assert.match(storeVisitMonitorExportJobs, /listStoreVisitMonitorExportJobs/);
  assert.match(storeVisitMonitorExportJobs, /downloadName/);
  assert.match(storeVisitMonitorExportDownloadRoute, /Response\.redirect/);
  assert.match(storeVisitMonitorExportJobs, /createSignedUrl/);
});

test("store visit monitor export menu does not poll jobs until the menu is opened", () => {
  assert.match(storeVisitMonitorExportMenu, /onToggle=\{handleToggle\}/);
  assert.match(storeVisitMonitorExportMenu, /if \(!open\) return;/);
  assert.match(storeVisitMonitorExportMenu, /const shouldPoll = open && jobs\.some/);
  assert.doesNotMatch(storeVisitMonitorExportMenu, /void loadJobs\(\);\s*const timer = window\.setInterval/);
});

test("store visit monitor route has an immediate loading shell for slow RSC navigation", () => {
  assert.match(storeVisitMonitorLoading, /Store Visit Monitor/);
  assert.match(storeVisitMonitorLoading, /animate-pulse/);
  assert.match(storeVisitMonitorServerPage, /StoreVisitMonitorClient/);
  assert.doesNotMatch(storeVisitMonitorServerPage, /getStoreVisitMonitor/);
  assert.match(storeVisitMonitorServerPage, /queryString=\{queryString\.slice\(1\)\}/);
  assert.match(storeVisitMonitorClient, /const monitorUrl = `\/api\/store-visit-monitor/);
  assert.match(storeVisitMonitorClient, /fetch\(monitorUrl/);
  assert.match(storeVisitMonitorClient, /include_quality=1/);
  assert.doesNotMatch(storeVisitMonitorClient, /useSearchParams/);
  assert.match(storeVisitMonitorRoute, /getStoreVisitMonitor/);
  assert.match(storeVisitMonitorRoute, /includeQuality: url\.searchParams\.get\("include_quality"\) === "1"/);
  assert.match(storeVisitMonitorRoute, /process\.env\.NODE_ENV !== "production"/);
  assert.match(storeVisitMonitorRoute, /isAllowedAdminRole\(localSession\.role\)/);
});

test("store visit monitor data path includes per-visit price parsing quality metrics", () => {
  assert.match(dataFile, /type StoreVisitMonitorItem = \{[\s\S]*accuracy: number \| null;/);
  assert.match(dataFile, /type StoreVisitMonitorItem = \{[\s\S]*autoApprovalRate: number \| null;/);
  assert.match(dataFile, /type StoreVisitMonitorItem = \{[\s\S]*avgPriceDeviationRate: number \| null;/);
  assert.match(dataFile, /type StoreVisitMonitorItem = \{[\s\S]*updatedAt: string \| null;/);
  assert.match(dataFile, /visitQualityById/);
});

test("store visit monitor page derives aggregate and row quality from one quality query", () => {
  assert.match(dataFile, /getStoreVisitMonitorQualityBundle/);
  assert.match(dataFile, /filters\.includeQuality === false/);
  assert.match(dataFile, /: await getStoreVisitMonitorQualityBundle\(visitIds\)/);
  assert.doesNotMatch(dataFile, /Promise\.all\(\[\s*getStoreVisitMonitorQuality\(visitIds\),\s*getStoreVisitMonitorVisitQuality\(visitIds\),\s*\]\)/);
});

test("store visit monitor falls back when production lacks offline_store_visits.updated_at", () => {
  assert.match(dataFile, /legacyStoreVisitMonitorSelect/);
  assert.match(dataFile, /isMissingStoreVisitUpdatedAtError/);
  assert.match(dataFile, /runQuery\(legacyStoreVisitMonitorSelect\)/);
});

test("store visit monitor data path paginates the analysis list before row quality lookup", () => {
  assert.match(dataFile, /pagination:\s*\{/);
  assert.match(dataFile, /normalizeStoreVisitMonitorPagination/);
  assert.match(dataFile, /storeVisitMonitorDefaultPageSize\s*=\s*50/);
  assert.match(dataFile, /\.range\(from, to\)/);
  assert.match(dataFile, /const visitIds = visits\.map/);
});

test("store visit monitor list path avoids loading a 5000-row summary query on every page view", () => {
  assert.doesNotMatch(dataFile, /summaryQuery/);
  assert.doesNotMatch(dataFile, /\.range\(0, storeVisitMonitorSummaryLimit - 1\)/);
  assert.match(dataFile, /const summaryVisits = visits;/);
});

test("new H5 store visit requires at least one price-tag image, not only Makuku photos", () => {
  assert.match(storeVisitH5, /images\.makuku_shelf\.length === 0 && images\.competitor_shelf\.length === 0/);
  assert.doesNotMatch(storeVisitH5, /setError\(copy\.uploadMakukuShelfRequired\)/);
});

test("store visit AI uses image-level price parsing and separate display analysis", () => {
  assert.match(storeVisitAiCore, /export async function analyzeStoreVisitPriceImage/);
  assert.match(storeVisitAiCore, /export async function analyzeStoreVisitDisplayImages/);
  assert.match(storeVisitAiDebug, /analyzeStoreVisitPriceImage/);
  assert.doesNotMatch(storeVisitAiDebug, /analyzeStoreVisitDisplayImages/);
  assert.doesNotMatch(storeVisitAiDebug, /analyzeStoreVisitImages/);
  assert.match(storeVisitAiDebug, /composeStoreVisitAiResult/);
  assert.doesNotMatch(storeVisitAiCore, /Treat all images as ONE store-level observation/);
});
