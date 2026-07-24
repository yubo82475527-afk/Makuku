import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path) => existsSync(path) ? readFileSync(path, "utf8") : "";

const domain = read("src/lib/operator-price-review.ts");
const listRoute = read("src/app/api/operator-price-reviews/route.ts");
const exportRoute = read("src/app/api/operator-price-reviews/export/route.ts");
const detailRoute = read("src/app/api/operator-price-reviews/[id]/route.ts");
const page = read("src/app/[locale]/offline-price-candidates/page.tsx");
const appShell = read("src/components/app-shell.tsx");
const workbench = read("src/components/operator-price-review-workbench.tsx");
const drawer = read("src/components/operator-price-review-drawer.tsx");
const reviewService = read("src/lib/ai-price-review.ts");
const legacyCandidateRoute = read("src/app/api/ai-price-candidates/[id]/route.ts");
const h5CandidateRoute = read("src/app/api/store-visit/price-candidates/[id]/route.ts");
const migration = read("supabase/migrations/202607130002_operator_price_review_phase2.sql");
const reasonFilters = read("src/lib/operator-price-review-reasons.ts");
const reasonCatalogPath = new URL("../src/lib/operator-price-review-reasons.ts", import.meta.url);

async function loadReasonCatalog() {
  return import(reasonCatalogPath.href);
}

test("operator reason filters use one complete shared catalog", () => {
  assert.match(reasonFilters, /OPERATOR_PRICE_REVIEW_REASON_FILTERS/);
  for (const key of [
    "SKU_MATCH_UNCERTAIN",
    "DUPLICATE_MASTER_SKU",
    "PRODUCT_PRICE_BINDING_UNCLEAR",
    "PRICE_TAG_UNCLEAR",
    "PIECE_COUNT_UNCLEAR",
    "PRICE_MATH_CONFLICT",
    "PRICE_DERIVED",
    "LEGACY_EVIDENCE_UNAVAILABLE",
    "OTHER_EVIDENCE_REVIEW_REQUIRED",
    "AMOUNT_SCALE_SUSPECTED",
    "PRICE_DEVIATION_CRITICAL",
    "PRICE_DEVIATION_HIGH",
    "PROMOTION_EVIDENCE",
    "INSUFFICIENT_BENCHMARK",
    "QUALITY_CHECK_FAILED",
    "OTHER_REVIEW_REQUIRED",
  ]) assert.match(reasonFilters, new RegExp(key));
  assert.match(reasonFilters, /normalizeOperatorPriceReviewReason/);
});

test("operator queue includes only terminal human-review candidates", () => {
  assert.match(domain, /MAX_QUALITY_GATE_ATTEMPTS\s*=\s*3/);
  assert.match(domain, /REVIEW_REQUIRED/);
  assert.match(domain, /INSUFFICIENT_BENCHMARK/);
  assert.match(domain, /quality_gate_attempt_count/);
  assert.match(domain, /auto_rule/);
  assert.match(domain, /h5_lifecycle_status/);
  assert.match(domain, /candidate_type/);
});

test("operator review filters use the shared query form to preserve filter parameters", () => {
  assert.match(page, /import \{ QueryForm, QuerySubmitButton \} from "@\/components\/query-form"/);
  assert.match(page, /<QueryForm[\s\S]*?<\/QueryForm>/);
  assert.match(page, /<QuerySubmitButton[\s\S]*?\/>/);
  assert.doesNotMatch(page, /<form className=/);
});

test("operator reason filtering happens in the database before pagination", () => {
  assert.match(domain, /reason\?: OperatorPriceReviewReasonFilter/);
  assert.match(domain, /PRICE_DEVIATION_HIGH[\s\S]*filter\("quality_gate_reason_codes", "cs"/);
  assert.match(domain, /PRICE_DEVIATION_CRITICAL[\s\S]*filter\("quality_gate_reason_codes", "cs"/);
  assert.match(domain, /PRICE_TAG_UNCLEAR[\s\S]*eq\("price_evidence_reason_code"/);
  assert.match(domain, /DUPLICATE_MASTER_SKU[\s\S]*eq\("ai_match_method", "MASTER_DATA_DUPLICATE"\)/);
  assert.match(domain, /QUALITY_CHECK_FAILED[\s\S]*eq\("quality_gate_status", "FAILED"\)/);
  assert.ok(domain.indexOf("switch (filters.reason)") < domain.indexOf("return query;"));
});

test("operator JSONB reason filters send valid JSON instead of Postgres array syntax", () => {
  assert.doesNotMatch(domain, /\.contains\("quality_gate_reason_codes"/);
  assert.doesNotMatch(domain, /\.eq\("quality_gate_reason_codes", \[\]\)/);
  assert.match(domain, /filter\("quality_gate_reason_codes", "cs", JSON\.stringify\(\[filters\.reason\]\)\)/);
  assert.match(domain, /filter\("quality_gate_reason_codes", "eq", JSON\.stringify\(\[\]\)\)/);
});

test("operator review API normalizes and forwards the reason filter", () => {
  assert.match(listRoute, /normalizeOperatorPriceReviewReason/);
  assert.match(listRoute, /reason:\s*normalizeOperatorPriceReviewReason/);
});

test("operator review export is queued with its current filters and preserves the XLSX audit columns", () => {
  assert.doesNotMatch(page, /导出审核数据/);
  assert.match(workbench, /OperatorPriceReviewExportButton/);
  assert.match(workbench, /<Download/);
  assert.match(workbench, /Export Unmatched/);
  assert.match(workbench, /\$\{from\}-\$\{to\} \/ \$\{total\}/);
  assert.match(page, /date_from/);
  assert.match(page, /date_to/);
  assert.match(page, /visit_code/);
  assert.match(page, /reason/);
  assert.match(page, /state/);
  assert.match(exportRoute, /requireAdminSession/);
  assert.match(exportRoute, /createOperatorPriceReviewExportJob/);
  assert.match(exportRoute, /triggerOperatorPriceReviewExportJobRunner/);
  assert.match(exportRoute, /status: 202/);
  const exportDomain = read("src/lib/operator-price-review-export.ts");
  assert.match(exportDomain, /import \* as XLSX from "xlsx"/);
  assert.match(exportDomain, /getOperatorPriceReviewsExport/);
  for (const header of [
    "Visit ID",
    "Visit Code",
    "Image ID",
    "Created Time",
    "Created By",
    "Product",
    "SKU",
    "AI Package Price",
    "Pieces",
    "Per-piece Price",
    "Reason",
    "Status",
  ]) assert.match(exportDomain, new RegExp(header));
  assert.match(exportDomain, /aoa_to_sheet/);
  assert.match(exportDomain, /operator-price-reviews/);
  assert.match(domain, /export async function getOperatorPriceReviewsExport/);
  assert.match(domain, /uploader_name/);
});

test("operator review page renders the shared anomaly reason filter", () => {
  assert.match(page, /OPERATOR_PRICE_REVIEW_REASON_FILTERS/);
  assert.match(page, /name="reason"/);
  assert.match(page, /异常原因/);
  assert.match(page, /全部原因/);
  assert.match(page, /reason:\s*reason/);
});

test("operator navigation preserves the anomaly reason filter", () => {
  assert.match(workbench, /reason\?: OperatorPriceReviewReasonFilter/);
  assert.match(workbench, /if \(filters\.reason\) params\.set\("reason", filters\.reason\)/);
});

test("operator reason mapping uses shared short labels", () => {
  assert.match(domain, /buildOperatorReason/);
  assert.match(domain, /buildOperatorPriceReviewReasonLabels/);
  assert.match(reasonFilters, /resolveOperatorPriceReviewReasonKeys/);
  assert.match(reasonFilters, /图片证据需确认/);
  assert.match(reasonFilters, /Image evidence needs review/);
});

test("operator and H5 share catalog short labels for deviation and evidence", async () => {
  assert.match(domain, /operator_reason_labels/);
  assert.match(workbench, /operator_reason_labels/);
  assert.match(drawer, /operator_reason_labels/);

  const catalog = await loadReasonCatalog();
  const keys = catalog.resolveOperatorPriceReviewReasonKeys({
    quality_gate_reason_codes: ["PRICE_DEVIATION_CRITICAL", "EVIDENCE_REVIEW_REQUIRED"],
    price_evidence_reason_code: "PRICE_TAG_UNCLEAR",
    price_evidence_status: "REVIEW_REQUIRED",
    matched_entity_type: "material_master",
    matched_entity_id: "SKU-1",
    match_score: 0.95,
  });
  assert.deepEqual(keys, ["PRICE_TAG_UNCLEAR", "PRICE_DEVIATION_CRITICAL"]);
  const labels = catalog.formatOperatorPriceReviewReasonLabels(keys, "zh");
  assert.equal(labels[0], catalog.operatorPriceReviewReasonLabel("PRICE_TAG_UNCLEAR", "zh"));
  assert.equal(labels[1], catalog.operatorPriceReviewReasonLabel("PRICE_DEVIATION_CRITICAL", "zh"));
});

test("operator and H5 share short labels for package-piece conflict", async () => {
  const catalog = await loadReasonCatalog();
  const keys = catalog.resolveOperatorPriceReviewReasonKeys({
    quality_gate_reason_codes: ["EVIDENCE_REVIEW_REQUIRED"],
    price_evidence_reason_code: "PRICE_MATH_CONFLICT",
    price_evidence_status: "CONFLICT",
    matched_entity_type: "material_master",
    matched_entity_id: "14013012502",
    match_score: 1,
  });
  assert.deepEqual(keys, ["PRICE_MATH_CONFLICT"]);
  assert.equal(
    catalog.operatorPriceReviewReasonLabel("PRICE_MATH_CONFLICT", "en"),
    "Pack price, pcs, and unit price conflict",
  );
});

test("other evidence review uses the shared short label fallback", async () => {
  const catalog = await loadReasonCatalog();
  const keys = catalog.resolveOperatorPriceReviewReasonKeys({
    quality_gate_reason_codes: ["EVIDENCE_REVIEW_REQUIRED"],
    price_evidence_reason_code: null,
    price_evidence_status: "REVIEW_REQUIRED",
    matched_entity_type: "material_master",
    matched_entity_id: "SKU-1",
  });
  assert.deepEqual(keys, ["OTHER_EVIDENCE_REVIEW_REQUIRED"]);
  assert.equal(catalog.operatorPriceReviewReasonLabel("OTHER_EVIDENCE_REVIEW_REQUIRED", "zh"), "图片证据需确认");
  assert.equal(catalog.operatorPriceReviewReasonLabel("OTHER_EVIDENCE_REVIEW_REQUIRED", "en"), "Image evidence needs review");
});

test("operator view models expose an explicit minimal contract", () => {
  assert.match(domain, /OperatorPriceReviewListItem/);
  assert.match(domain, /OperatorPriceReviewDetail/);
  assert.match(domain, /operator_reason/);
  assert.match(domain, /operator_reason_labels/);
  assert.match(domain, /review_token/);
  assert.match(domain, /visit_detail_href/);
  assert.doesNotMatch(domain, /\.\.\.candidate/);
});

test("operator candidate queries select only persisted columns and enrich SKU labels in batches", () => {
  const candidateSelect = domain.match(/const CANDIDATE_SELECT = \[([\s\S]*?)\]\.join/)?.[1] ?? "";
  assert.doesNotMatch(candidateSelect, /matched_sku_label/);
  assert.match(domain, /loadMatchedLabelMap/);
  assert.match(domain, /from\("material_master"\)[\s\S]*tenant_sku_code,tenant_sku_name/);
  assert.match(domain, /from\("competitor_products"\)[\s\S]*brands\(name\)/);
  assert.match(domain, /candidate\.matched_label/);
});

test("operator detail loads only the exact candidate source image", () => {
  assert.match(domain, /source_image_id/);
  assert.match(domain, /offline_visit_images/);
  assert.match(domain, /createSignedUrl/);
  assert.doesNotMatch(domain, /offline_visit_images\(\*\)/);
  assert.match(drawer, /原始证据不可用|Source evidence unavailable/);
});

test("a missing source image id never falls back to another path and signing failure is unavailable", () => {
  assert.match(domain, /filter\(\(candidate\) => !candidate\.source_image_id\)/);
  assert.match(domain, /if \(candidate\.source_image_id\) \{[\s\S]*return byId\?\.visit_id === candidate\.visit_id \? byId : null;[\s\S]*\}/);
  assert.match(domain, /source_image_available: Boolean\(sourceImageUrl\)/);
});

test("manual review mutations are token fenced and atomic", () => {
  assert.match(migration, /p_review_token text/i);
  assert.match(migration, /for update of candidate/i);
  assert.match(migration, /approval_input_fingerprint is distinct from p_review_token/i);
  assert.match(migration, /p_review_method = 'manual'/i);
  assert.match(migration, /insert into public\.price_snapshots/i);
  assert.match(migration, /p_matched_entity_type text/i);
  assert.match(reviewService, /reviewToken/);
});

test("manual approval permits final values while automated approval remains strict", () => {
  assert.match(migration, /p_review_method in \('auto_rule', 'bulk_manual'\)[\s\S]*p_price_idr is distinct from v_net_price/i);
  assert.match(migration, /p_review_method = 'manual'[\s\S]*v_net_price := p_price_idr/i);
  assert.match(migration, /v_piece_count := p_piece_count/i);
  assert.match(migration, /v_price_per_piece := round\(v_net_price \/ v_piece_count/i);
});

test("price snapshots persist the reviewed piece-count fact without trigger overwrite", () => {
  assert.match(migration, /alter table public\.price_snapshots[\s\S]*add column if not exists piece_count integer/i);
  assert.match(migration, /price_snapshots_piece_count_check/i);
  assert.match(migration, /create or replace function public\.normalize_price_snapshot/i);
  assert.match(migration, /new\.piece_count := coalesce\(new\.piece_count, product_piece_count\)/i);
  assert.match(migration, /if new\.price_per_piece is null[\s\S]*new\.net_price_idr \/ new\.piece_count/i);
  assert.doesNotMatch(migration, /new\.price_per_piece := round\(new\.net_price_idr \/ product_piece_count/i);
  assert.match(migration, /insert into public\.price_snapshots \([\s\S]*piece_count[\s\S]*price_per_piece/i);
});

test("automatic approvals preserve the evaluated per-piece fact while corrections recompute it", () => {
  assert.match(migration, /p_review_method in \('auto_rule', 'bulk_manual'\)[\s\S]*visible_price_per_piece_idr[\s\S]*reviewed_price_per_piece[\s\S]*price_per_piece[\s\S]*round\(v_net_price \/ v_piece_count/i);
  assert.match(migration, /p_review_method = 'manual'[\s\S]*v_price_per_piece := round\(v_net_price \/ v_piece_count/i);
});

test("manual decisions require an active SKU candidate and a terminal result for current inputs", () => {
  assert.match(migration, /v_candidate\.candidate_type <> 'SKU'/i);
  assert.match(migration, /h5_lifecycle_status[\s\S]*deleted[\s\S]*replaced[\s\S]*reanalyzed/i);
  assert.match(migration, /quality_gate_input_fingerprint is distinct from v_candidate\.approval_input_fingerprint/i);
  assert.match(migration, /p_require_terminal_quality boolean/i);
  assert.match(migration, /if p_require_terminal_quality[\s\S]*REVIEW_REQUIRED[\s\S]*INSUFFICIENT_BENCHMARK[\s\S]*FAILED/i);
  assert.match(detailRoute, /requireTerminalQuality:\s*true/);
  assert.match(h5CandidateRoute, /reviewMethod:\s*"manual"/);
  assert.match(h5CandidateRoute, /candidateMutationErrorResponse/);
  assert.match(h5CandidateRoute, /candidate is not ready for operator review/i);
});

test("H5 row deletion physically removes the current pending candidate", () => {
  const deleteBranch = h5CandidateRoute.slice(h5CandidateRoute.indexOf('if (action === "delete_h5_row")'), h5CandidateRoute.indexOf('return Response.json({ error: "Unsupported action"'));
  assert.match(deleteBranch, /\.from\("ai_price_candidates"\)[\s\S]*\.delete\(\)/);
  assert.match(deleteBranch, /\.eq\("id", id\)[\s\S]*\.eq\("status", "pending"\)/);
  assert.doesNotMatch(deleteBranch, /rejectAiPriceCandidate|h5LifecycleStatus|reanalyzed/);
});

test("confident product ownership cannot be changed by a crafted review request", () => {
  assert.match(detailRoute, /detail\.requires_product_correction/);
  assert.match(reviewService, /candidateAllowsProductCorrection/);
  assert.match(migration, /v_product_correction_allowed/i);
  assert.match(migration, /SKU_MATCH_UNCERTAIN/i);
  assert.match(migration, /Product match is already confident/i);
});

test("operator API maps stale state and invalid ownership conflicts without returning 500", () => {
  assert.match(detailRoute, /quality result is stale[\s\S]*return 409/i);
  assert.match(detailRoute, /Inactive candidates[\s\S]*return 409/i);
  assert.match(detailRoute, /Only SKU candidates[\s\S]*return 400/i);
  assert.match(detailRoute, /Product match is already confident[\s\S]*return 400/i);
});

test("snapshot reuse never overwrites an already confirmed price fact", () => {
  assert.match(migration, /select[\s\S]*snapshot\.piece_count[\s\S]*snapshot\.price_per_piece[\s\S]*into[\s\S]*v_snapshot_piece_count[\s\S]*v_snapshot_price_per_piece/i);
  assert.match(migration, /where snapshot\.id = v_snapshot_id\s+for update of snapshot;/i);
  assert.match(migration, /Existing price snapshot facts differ from this review/i);
  assert.doesNotMatch(migration, /update public\.price_snapshots snapshot\s+set[\s\S]{0,200}piece_count = v_piece_count/i);
});

test("manual SKU correction validates one legal product owner", () => {
  assert.match(migration, /material_master/i);
  assert.match(migration, /competitor_products/i);
  assert.match(migration, /Please match a product before approving/i);
  assert.match(migration, /v_competitor_product_id[\s\S]*v_sku_master_id/i);
  assert.match(migration, /Exactly one product owner is required/i);
});

test("rejection is protected by the same review token", () => {
  assert.match(migration, /reject_ai_price_candidate_with_quality_gate\([\s\S]*p_review_token text/i);
  assert.match(migration, /approval_input_fingerprint is distinct from p_review_token/i);
});

test("legacy and H5 manual review callers carry the candidate fingerprint", () => {
  assert.match(legacyCandidateRoute, /reviewToken:\s*cleanOptionalText\(body\.review_token\)/);
  assert.match(h5CandidateRoute, /reviewToken:\s*cleanOptionalText\(body\.review_token\)/);
});

test("operator APIs require admin auth and return minimal review actions", () => {
  assert.match(listRoute, /requireAdminSession/);
  assert.match(detailRoute, /requireAdminSession/);
  assert.match(detailRoute, /action === "confirm"/);
  assert.match(detailRoute, /action === "correct"/);
  assert.match(detailRoute, /action === "reject"/);
  assert.match(detailRoute, /return 409/);
});

test("rejecting an invalid candidate does not require a valid product match", () => {
  const rejectIndex = detailRoute.indexOf('if (action === "reject")');
  const normalizeMatchIndex = detailRoute.indexOf("const match = normalizeMatch");
  assert.notEqual(rejectIndex, -1);
  assert.notEqual(normalizeMatchIndex, -1);
  assert.ok(rejectIndex < normalizeMatchIndex);
});

test("the existing photo-review route renders the operator workbench", () => {
  assert.match(page, /OperatorPriceReviewWorkbench/);
  assert.match(page, /getOperatorPriceReviewsPage/);
  assert.doesNotMatch(page, /AiPriceCandidatesWorkbench/);
  assert.doesNotMatch(page, /getAiPriceReviewRule/);
  assert.match(page, /价格审核/);
  assert.match(page, /Price Review/);
  assert.match(appShell, /价格审核/);
  assert.match(appShell, /Price Review/);
});

test("operator list exposes only two states and no technical bulk workflow", () => {
  assert.match(workbench, /待处理/);
  assert.match(workbench, /已处理/);
  assert.match(workbench, /查看并处理/);
  assert.doesNotMatch(workbench, /benchmark_sample_count|benchmark_store_count|ai_confidence|match_score|quality_gate_version|raw JSON/i);
  assert.doesNotMatch(workbench, /bulk|批量批准/i);
});

test("operator navigation derives rows from fresh props and preserves filter state", () => {
  assert.match(workbench, /removedPendingIds/);
  assert.match(workbench, /useMemo\([\s\S]*items\.filter/);
  assert.doesNotMatch(workbench, /useState\(items\)/);
  assert.match(page, /type="hidden" name="state"/);
  assert.match(page, /type="hidden" name="per_page"/);
});

test("drawer exposes evidence, three final actions, conditional SKU correction and Visit link", () => {
  assert.match(drawer, /价格异常审核/);
  assert.match(drawer, /左侧看原图，右侧确认价格、片数和商品匹配/);
  assert.match(drawer, /确认商品和价格|确认/);
  assert.match(drawer, /修改价格/);
  assert.match(drawer, /提交修改/);
  assert.match(drawer, /判定为错误/);
  assert.match(drawer, /查看完整 Visit 详情/);
  assert.match(drawer, /requires_product_correction/);
  assert.match(drawer, /\/api\/store-visit\/match-options/);
  assert.doesNotMatch(drawer, /benchmark_sample_count|benchmark_store_count|ai_confidence|match_score|quality_gate_version/i);
});

test("operators can confirm an existing AI product suggestion without selecting it again", () => {
  assert.match(drawer, /const currentMatch: MatchOption \| null/);
  assert.match(drawer, /const finalMatch = selectedMatch \?\? currentMatch/);
  assert.match(drawer, /确认商品和价格/);
  assert.match(drawer, /匹配到的商品名称/);
  assert.match(workbench, /return isZh \? "待确认" : "Needs confirmation"/);
  assert.match(workbench, /item\.requires_product_correction/);
});

test("operator list keeps matched SKU label even when product correction is allowed", () => {
  assert.match(
    workbench,
    /function productAssociationLabel[\s\S]*if \(item\.sku_label\) return item\.sku_label;[\s\S]*item\.requires_product_correction/,
  );
});

test("operator list displays full matched SKU labels and opens the unified review drawer from source image", () => {
  assert.match(workbench, /min-w-\[280px\]/);
  assert.match(workbench, /whitespace-normal break-words/);
  assert.doesNotMatch(workbench, /mt-1 truncate text-xs text-slate-500/);
  assert.match(workbench, /function SourceThumbnail/);
  assert.match(workbench, /onOpenReview\(item\.id\)/);
  assert.match(workbench, /<OperatorPriceReviewDrawer/);
  assert.doesNotMatch(workbench, /previewCandidateId/);
  assert.doesNotMatch(workbench, /<OperatorPriceSourceImageDialog/);
});
