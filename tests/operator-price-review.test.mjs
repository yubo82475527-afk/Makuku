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

test("operator detail loads only the exact candidate source image", () => {
  assert.match(domain, /source_image_id/);
  assert.match(domain, /offline_visit_images/);
  assert.match(domain, /createSignedUrl/);
  assert.doesNotMatch(domain, /offline_visit_images\(\*\)/);
  assert.match(drawer, /原始证据不可用|Source evidence unavailable/);
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

test("operator APIs require admin auth and return minimal review actions", () => {
  assert.match(listRoute, /requireAdminSession/);
  assert.match(detailRoute, /requireAdminSession/);
  assert.match(detailRoute, /action === "confirm"/);
  assert.match(detailRoute, /action === "correct"/);
  assert.match(detailRoute, /action === "reject"/);
  assert.match(detailRoute, /status:\s*409/);
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
