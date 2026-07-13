import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path) => existsSync(path) ? readFileSync(path, "utf8") : "";

const domain = read("src/lib/operator-price-review.ts");
const listRoute = read("src/app/api/operator-price-reviews/route.ts");
const detailRoute = read("src/app/api/operator-price-reviews/[id]/route.ts");
const page = read("src/app/[locale]/offline-price-candidates/page.tsx");
const appShell = read("src/components/app-shell.tsx");
const workbench = read("src/components/operator-price-review-workbench.tsx");
const drawer = read("src/components/operator-price-review-drawer.tsx");
const reviewService = read("src/lib/ai-price-review.ts");
const legacyCandidateRoute = read("src/app/api/ai-price-candidates/[id]/route.ts");
const h5CandidateRoute = read("src/app/api/store-visit/price-candidates/[id]/route.ts");
const migration = read("supabase/migrations/202607130002_operator_price_review_phase2.sql");

test("operator queue includes only terminal human-review candidates", () => {
  assert.match(domain, /MAX_QUALITY_GATE_ATTEMPTS\s*=\s*3/);
  assert.match(domain, /REVIEW_REQUIRED/);
  assert.match(domain, /INSUFFICIENT_BENCHMARK/);
  assert.match(domain, /quality_gate_attempt_count/);
  assert.match(domain, /auto_rule/);
  assert.match(domain, /h5_lifecycle_status/);
  assert.match(domain, /candidate_type/);
});

test("operator reason mapping is server-owned and follows business priority", () => {
  assert.match(domain, /buildOperatorReason/);
  assert.match(domain, /SKU_MATCH_UNCERTAIN[\s\S]*EVIDENCE_REVIEW_REQUIRED[\s\S]*AMOUNT_SCALE_SUSPECTED[\s\S]*PRICE_DEVIATION_CRITICAL[\s\S]*PRICE_DEVIATION_HIGH/);
  assert.match(domain, /INSUFFICIENT_BENCHMARK/);
  assert.match(domain, /PROMOTION_EVIDENCE/);
  assert.match(domain, /Intl\.NumberFormat/);
});

test("operator view models expose an explicit minimal contract", () => {
  assert.match(domain, /OperatorPriceReviewListItem/);
  assert.match(domain, /OperatorPriceReviewDetail/);
  assert.match(domain, /operator_reason/);
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
  assert.match(h5CandidateRoute, /requireTerminalQuality:\s*false/);
});

test("confident product ownership cannot be changed by a crafted review request", () => {
  assert.match(detailRoute, /detail\.requires_product_correction/);
  assert.match(reviewService, /candidateAllowsProductCorrection/);
  assert.match(migration, /v_product_correction_allowed/i);
  assert.match(migration, /SKU_MATCH_UNCERTAIN/i);
  assert.match(migration, /Product match is already confident/i);
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
  assert.match(h5CandidateRoute, /reviewToken:\s*candidateRow\.approval_input_fingerprint/);
  assert.match(h5CandidateRoute, /reviewToken:\s*sourceCandidate\.approval_input_fingerprint/);
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
  assert.match(appShell, /价格异常审核/);
  assert.match(appShell, /Price Anomaly Review/);
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
  assert.match(drawer, /这个价格需要确认/);
  assert.match(drawer, /确认价格正确/);
  assert.match(drawer, /修正后通过/);
  assert.match(drawer, /判定为错误/);
  assert.match(drawer, /查看完整 Visit 详情/);
  assert.match(drawer, /requires_product_correction/);
  assert.match(drawer, /\/api\/store-visit\/match-options/);
  assert.doesNotMatch(drawer, /benchmark_sample_count|benchmark_store_count|ai_confidence|match_score|quality_gate_version/i);
});
