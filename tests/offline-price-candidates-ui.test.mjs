import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const candidatesPage = readFileSync("src/app/[locale]/offline-price-candidates/page.tsx", "utf8");
const workbenchPath = "src/components/ai-price-candidates-workbench.tsx";
const workbench = readFileSync(workbenchPath, "utf8");
const storeVisitRoute = readFileSync("src/app/api/store-visit/[id]/route.ts", "utf8");
const storeVisitDetailH5 = readFileSync("src/components/store-visit-detail-h5.tsx", "utf8");
const candidateRoute = readFileSync("src/app/api/ai-price-candidates/[id]/route.ts", "utf8");
const aiPriceReview = readFileSync("src/lib/ai-price-review.ts", "utf8");
const dataFile = readFileSync("src/lib/data.ts", "utf8");
const materialMasterRoute = readFileSync("src/app/api/material-master/route.ts", "utf8");
const competitorsRoute = readFileSync("src/app/api/competitors/route.ts", "utf8");

test("photo price review keeps compact date filter and export action", () => {
  assert.doesNotMatch(candidatesPage, /SelectInput/);
  assert.doesNotMatch(candidatesPage, /name="status"/);
  assert.match(candidatesPage, /DateRangeFilter/);
  assert.match(candidatesPage, /aria-label=\{label\}/);
  assert.match(candidatesPage, /<Card className="mb-4">/);
  assert.match(candidatesPage, /<form className="grid gap-3/);
  assert.match(candidatesPage, /Export CSV/);
  assert.doesNotMatch(candidatesPage, /TextInput name="date_from"/);
  assert.doesNotMatch(candidatesPage, /TextInput name="date_to"/);
});

test("photo price review uses a paginated review table instead of evidence cards", () => {
  assert.match(candidatesPage, /AiPriceCandidatesWorkbench/);
  assert.match(candidatesPage, /pageParam/);
  assert.match(candidatesPage, /perPageParam/);
  assert.match(candidatesPage, /total/);
  assert.doesNotMatch(candidatesPage, /<article/);
  assert.doesNotMatch(candidatesPage, /space-y-3/);
});

test("photo price review uses status tabs instead of top status dropdown", () => {
  assert.match(workbench, /function StatusTabs/);
  assert.match(workbench, /pending.*approved.*rejected.*all/s);
  assert.match(workbench, /statusTabs/);
  assert.match(workbench, /URLSearchParams/);
  assert.doesNotMatch(candidatesPage, /statusHref/);
  assert.doesNotMatch(candidatesPage, /tabClass/);
});

test("photo price review moves rule settings and reject reason into modals", () => {
  assert.match(workbench, /ReviewRuleModal/);
  assert.match(workbench, /ruleModalOpen/);
  assert.match(workbench, /RejectReasonDialog/);
  assert.match(workbench, /rejectDialog/);
  assert.match(workbench, /onJobCreated/);
  assert.match(workbench, /await rejectSelected\(reason, \(\) => \{/);
  assert.match(workbench, /dialogClosed = true;\s*setRejectDialog\(null\);/);
  assert.doesNotMatch(workbench, /setRejectDialog\(null\);\s*try \{/);
  assert.match(workbench, /\/api\/ai-price-review-rules/);
  assert.doesNotMatch(workbench, /ReviewRulePanel/);
  assert.doesNotMatch(workbench, /placeholder=\{copy\.rejectReason\} className="h-9 min-w-64/);
});

test("photo price review keeps bulk toolbar hidden until pending rows are selected", () => {
  assert.match(workbench, /BulkReviewToolbar/);
  assert.match(workbench, /selectedCount > 0/);
  assert.match(workbench, /filters\.status === "pending"/);
  assert.match(workbench, /approveSelected/);
  assert.match(workbench, /rejectSelected/);
  assert.doesNotMatch(workbench, /onApproveFiltered/);
  assert.doesNotMatch(workbench, /Approve filtered/);
  assert.doesNotMatch(workbench, /approveFiltered/);
});

test("photo price review shows approved and rejected audit columns", () => {
  assert.match(workbench, /reviewed_at/);
  assert.match(workbench, /review_method/);
  assert.match(workbench, /created_at/);
  assert.match(workbench, /approvedAt/);
  assert.match(workbench, /reviewMethod/);
  assert.match(workbench, /rejection_reason/);
  assert.match(workbench, /rejectedAt/);
  assert.match(workbench, /rejectionReason/);
  assert.match(workbench, /createdAtLabel\(locale\)/);
  assert.match(workbench, /formatJakartaTimestamp\(candidate\.created_at\)/);
  assert.match(workbench, /second: "2-digit"/);
});

test("photo price review keeps Chinese copy keys for table headers and actions", () => {
  assert.match(workbench, /locale === "zh"/);
  assert.match(workbench, /approveSelected/);
  assert.match(workbench, /rejectSelected/);
  assert.match(workbench, /reviewRule/);
  assert.match(workbench, /approvedAt/);
  assert.match(workbench, /reviewMethod/);
  assert.match(workbench, /创建时间/);
});

test("pending photo price review rows allow package price and piece count correction", () => {
  assert.match(workbench, /reviewInputs/);
  assert.match(workbench, /savedReviewInputs/);
  assert.match(workbench, /updateReviewInput/);
  assert.match(workbench, /current\[candidate\.id\] \?\? defaultReviewInput\(candidate\)/);
  assert.match(workbench, /maybeSaveReviewInput/);
  assert.match(workbench, /onBlur=\{\(\) => maybeSaveReviewInput\(candidate\)\}/);
  assert.match(workbench, /action: "save_review_input"/);
  assert.match(workbench, /window\.confirm/);
  assert.match(workbench, /name="net_price_idr"/);
  assert.match(workbench, /name="piece_count"/);
  assert.match(workbench, /calculateReviewedPricePerPiece/);
  assert.match(workbench, /review_overrides/);
});

test("photo price review carries net price and activity type into price snapshots", () => {
  assert.match(workbench, /net_price_idr/);
  assert.match(workbench, /promo_type/);
  assert.match(workbench, /copy\.netPrice/);
  assert.match(workbench, /copy\.promoType/);
  assert.match(candidateRoute, /net_price_idr/);
  assert.match(candidateRoute, /promo_type/);
  assert.match(aiPriceReview, /candidateRow\.net_price_idr/);
  assert.match(aiPriceReview, /promo_type: normalizeCandidatePromoType/);
});

test("Chinese photo price review copy renders as readable UTF-8 text", () => {
  assert.match(candidatesPage, /照片价格复核/);
  assert.match(candidatesPage, /巡店日期范围/);
  assert.match(workbench, /通过选中/);
  assert.match(workbench, /驳回选中/);
  assert.match(workbench, /AI ≥/);
  assert.doesNotMatch(candidatesPage, /鏆|鐓|宸|寮|閫|椹|鈮/);
  assert.doesNotMatch(workbench, /鏆|鐓|宸|寮|閫|椹|鈮/);
});

test("photo price review exposes evidence drawer and readable warning details", () => {
  assert.match(workbench, /viewEvidence/);
  assert.match(workbench, /warningMessagesForCandidate/);
  assert.match(workbench, /candidate\.warnings/);
  assert.match(workbench, /setActiveCandidate\(candidate\)/);
  assert.match(workbench, /visitPhotos/);
  assert.match(workbench, /\/api\/store-visit\/\$\{candidate\.visit_id\}/);
});

test("photo price review shows and edits matched SKU on pending candidates", () => {
  assert.match(workbench, /matchedSkuLabel/);
  assert.match(workbench, /copy\.editMatch/);
  assert.match(workbench, /MatchEditorDialog/);
  assert.match(workbench, /candidate\.status === "pending"/);
  assert.match(workbench, /action: "update_match"/);
  assert.match(workbench, /action: "create_competitor_match"/);
  assert.match(workbench, /createCompetitorMatch/);
  assert.match(workbench, /createCompetitorProduct/);
  assert.match(workbench, /candidate\?\.matched_sku_label \?\? candidate\?\.matched_label \?\? ""/);
  assert.match(workbench, /fetch\("\/api\/material-master"\)/);
  assert.doesNotMatch(workbench, /\/api\/material-master\/export/);
  assert.match(workbench, /withSelectedMaterialOption/);
  assert.match(workbench, /withSelectedProductOption/);
  assert.match(dataFile, /materialMatchesByCode/);
  assert.match(dataFile, /competitorMatchesById/);
});

test("match editor option APIs return JSON data for current matched SKU selection", () => {
  assert.match(materialMasterRoute, /export async function GET\(request: Request\)/);
  assert.match(materialMasterRoute, /\.from\("material_master"\)/);
  assert.match(materialMasterRoute, /Response\.json\(\{ items: data \?\? \[\] \}\)/);
  assert.match(competitorsRoute, /export async function GET\(request: Request\)/);
  assert.match(competitorsRoute, /\.select\("\*, brands\(id,name\)"\)/);
  assert.match(competitorsRoute, /Response\.json\(\{ products: data \?\? \[\] \}\)/);
});

test("photo price candidate API updates pending match without touching snapshots or sku matches", () => {
  assert.match(candidateRoute, /action === "update_match"/);
  assert.match(candidateRoute, /action === "create_competitor_match"/);
  assert.match(candidateRoute, /ensureCompetitorProduct/);
  assert.match(candidateRoute, /matched_entity_type/);
  assert.match(candidateRoute, /match_score: matchType === "unmatched" \? 0 : 1/);
  assert.match(candidateRoute, /\.eq\("status", "pending"\)/);
  assert.doesNotMatch(candidateRoute, /\.from\("price_snapshots"\)[\s\S]*action === "update_match"/);
  assert.doesNotMatch(candidateRoute, /\.from\("sku_matches"\)[\s\S]*action === "update_match"/);
});

test("photo price candidates must be matched before approval", () => {
  assert.match(workbench, /candidateCanBeApproved/);
  assert.match(workbench, /copy\.matchRequiredBeforeApprove/);
  assert.doesNotMatch(workbench, /create_competitor_if_unmatched/);
  assert.doesNotMatch(workbench, /confirmCreateCompetitorBeforeApprove/);
  assert.doesNotMatch(candidateRoute, /createCompetitorIfUnmatched/);
  assert.match(aiPriceReview, /Please match a product before approving this candidate/);
});

test("photo price review uses row click drawer with compact risk indicators and image preview", () => {
  assert.match(workbench, /openCandidateDrawer/);
  assert.match(workbench, /onClick=\{\(\) => openCandidateDrawer\(candidate\)\}/);
  assert.match(workbench, /stopReviewRowClick/);
  assert.match(workbench, /riskIndicatorLabel/);
  assert.match(workbench, /!<\/span>/);
  assert.doesNotMatch(workbench, /warningMessages\.join\("；"\)/);
  assert.match(workbench, /onBackdropClick/);
  assert.match(workbench, /activeImage/);
  assert.match(workbench, /setActiveImage/);
});

test("store visit detail route returns signed photos from new image table and legacy arrays", () => {
  assert.match(storeVisitRoute, /offline_visit_images\(\*\)/);
  assert.match(storeVisitRoute, /offline-visit-images/);
  assert.match(storeVisitRoute, /store-visits/);
  assert.match(storeVisitRoute, /signed_images/);
  assert.match(storeVisitRoute, /own_shelf[\s\S]+makuku_shelf/);
  assert.match(storeVisitRoute, /toStoreVisitImageCategory/);
});

test("mobile store visit detail can preview photos from the thumbnail grid", () => {
  assert.match(storeVisitDetailH5, /activeImage/);
  assert.match(storeVisitDetailH5, /setActiveImage/);
  assert.match(storeVisitDetailH5, /aria-label=\{locale === "zh" \? "放大照片" : "Preview photo"\}/);
  assert.match(storeVisitDetailH5, /role="dialog"/);
  assert.match(storeVisitDetailH5, /max-h-\[82vh\]/);
});
