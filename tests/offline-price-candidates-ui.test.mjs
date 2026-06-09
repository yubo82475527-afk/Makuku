import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const candidatesPage = readFileSync("src/app/[locale]/offline-price-candidates/page.tsx", "utf8");
const workbenchPath = "src/components/ai-price-candidates-workbench.tsx";
const workbench = readFileSync(workbenchPath, "utf8");
const storeVisitRoute = readFileSync("src/app/api/store-visit/[id]/route.ts", "utf8");
const storeVisitDetailH5 = readFileSync("src/components/store-visit-detail-h5.tsx", "utf8");

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
  assert.match(workbench, /approvedAt/);
  assert.match(workbench, /reviewMethod/);
  assert.match(workbench, /rejection_reason/);
  assert.match(workbench, /rejectedAt/);
  assert.match(workbench, /rejectionReason/);
});

test("photo price review keeps Chinese copy keys for table headers and actions", () => {
  assert.match(workbench, /locale === "zh"/);
  assert.match(workbench, /approveSelected/);
  assert.match(workbench, /rejectSelected/);
  assert.match(workbench, /reviewRule/);
  assert.match(workbench, /approvedAt/);
  assert.match(workbench, /reviewMethod/);
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
  assert.match(workbench, /name="parsed_price_idr"/);
  assert.match(workbench, /name="piece_count"/);
  assert.match(workbench, /calculateReviewedPricePerPiece/);
  assert.match(workbench, /review_overrides/);
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
});

test("mobile store visit detail can preview photos from the thumbnail grid", () => {
  assert.match(storeVisitDetailH5, /activeImage/);
  assert.match(storeVisitDetailH5, /setActiveImage/);
  assert.match(storeVisitDetailH5, /aria-label=\{locale === "zh" \? "放大照片" : "Preview photo"\}/);
  assert.match(storeVisitDetailH5, /role="dialog"/);
  assert.match(storeVisitDetailH5, /max-h-\[82vh\]/);
});
