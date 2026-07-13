import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const migrationPath = "supabase/migrations/202606100001_ai_price_candidate_bulk_review.sql";
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const typesFile = readFileSync("src/lib/types.ts", "utf8");
const dataFile = readFileSync("src/lib/data.ts", "utf8");
const reviewServicePath = "src/lib/ai-price-review.ts";
const reviewService = existsSync(reviewServicePath) ? readFileSync(reviewServicePath, "utf8") : "";
const listRoutePath = "src/app/api/ai-price-candidates/route.ts";
const listRoute = existsSync(listRoutePath) ? readFileSync(listRoutePath, "utf8") : "";
const rulesRoutePath = "src/app/api/ai-price-review-rules/route.ts";
const rulesRoute = existsSync(rulesRoutePath) ? readFileSync(rulesRoutePath, "utf8") : "";
const bulkRoutePath = "src/app/api/ai-price-candidates/bulk-review/route.ts";
const bulkRoute = existsSync(bulkRoutePath) ? readFileSync(bulkRoutePath, "utf8") : "";
const jobRoutePath = "src/app/api/ai-price-candidates/bulk-review/[jobId]/route.ts";
const jobRoute = existsSync(jobRoutePath) ? readFileSync(jobRoutePath, "utf8") : "";
const runRoutePath = "src/app/api/ai-price-candidates/bulk-review/[jobId]/run/route.ts";
const runRoute = existsSync(runRoutePath) ? readFileSync(runRoutePath, "utf8") : "";
const singleRoute = readFileSync("src/app/api/ai-price-candidates/[id]/route.ts", "utf8");
const evidenceReviewMigrationPath = "supabase/migrations/202607050001_price_evidence_review_decision.sql";
const evidenceReviewMigration = existsSync(evidenceReviewMigrationPath) ? readFileSync(evidenceReviewMigrationPath, "utf8") : "";
const qualityMigrationPath = "supabase/migrations/202607050002_ai_price_candidate_quality_metrics.sql";
const qualityMigration = existsSync(qualityMigrationPath) ? readFileSync(qualityMigrationPath, "utf8") : "";

test("bulk review migration adds rules jobs items and reject audit fields", () => {
  assert.equal(existsSync(migrationPath), true);
  assert.match(migration, /create table if not exists public\.ai_price_review_rules/);
  assert.match(migration, /create table if not exists public\.ai_price_review_jobs/);
  assert.match(migration, /create table if not exists public\.ai_price_review_job_items/);
  assert.match(migration, /rejection_reason/);
  assert.match(migration, /review_job_id/);
  assert.match(migration, /review_method/);
  assert.match(migration, /min_ai_confidence numeric not null default 0\.95/);
  assert.match(migration, /min_match_score numeric not null default 0\.9/);
});

test("types and data layer support paginated candidates and active rules", () => {
  assert.match(typesFile, /AiPriceReviewRule/);
  assert.match(typesFile, /AiPriceReviewJob/);
  assert.match(typesFile, /AiPriceReviewJobItem/);
  assert.match(typesFile, /rejection_reason/);
  assert.match(typesFile, /review_method/);
  assert.match(typesFile, /auto_rule/);
  assert.match(typesFile, /bulk_manual/);
  assert.match(dataFile, /getAiPriceReviewRule/);
  assert.match(dataFile, /getAiPriceCandidatesPage/);
  assert.match(dataFile, /count:\s*"exact"/);
  assert.match(dataFile, /\.range\(/);
});

test("candidate review service centralizes approve reject and rule eligibility", () => {
  assert.equal(existsSync(reviewServicePath), true);
  assert.match(reviewService, /approveAiPriceCandidate/);
  assert.match(reviewService, /rejectAiPriceCandidate/);
  assert.match(reviewService, /candidateMatchesReviewRule/);
  assert.match(reviewService, /autoApproveAiPriceCandidatesForVisit/);
  assert.match(reviewService, /reviewMethod/);
  assert.match(reviewService, /normalizePriceSnapshot/);
  assert.match(reviewService, /price_snapshots/);
  assert.doesNotMatch(singleRoute, /\.delete\(\)/);
  assert.match(singleRoute, /rejectAiPriceCandidate/);
  assert.match(singleRoute, /approveAiPriceCandidate/);
});

test("candidate review trusts resolver auto-approve decision and does not hard-block lower visual confidence", () => {
  assert.match(reviewService, /const MIN_MATCH_SCORE\s*=\s*0\.9/);
  assert.match(reviewService, /const REQUIRE_MATCHED_ENTITY\s*=\s*true/);
  assert.match(reviewService, /candidate\.review_decision !== "AUTO_APPROVE"/);
  assert.doesNotMatch(reviewService, /MIN_RECOGNITION_CONFIDENCE/);
  assert.doesNotMatch(reviewService, /candidate\.ai_confidence == null/);
  assert.doesNotMatch(reviewService, /legacy_confidence_fallback/);
  assert.doesNotMatch(reviewService, /candidate\.ai_confidence < MIN_RECOGNITION_CONFIDENCE/);
  assert.match(reviewService, /candidate\.match_score < MIN_MATCH_SCORE/);
  assert.doesNotMatch(reviewService, /candidate\.ai_confidence < rule\.min_ai_confidence/);
  assert.doesNotMatch(reviewService, /candidate\.match_score < rule\.min_match_score/);
});

test("price evidence review migration adds nullable confidence and review decision fields", () => {
  assert.equal(existsSync(evidenceReviewMigrationPath), true);
  assert.match(evidenceReviewMigration, /alter column ai_confidence drop not null/i);
  assert.match(evidenceReviewMigration, /legacy_confidence_fallback boolean not null default false/i);
  assert.match(evidenceReviewMigration, /price_evidence_status text/i);
  assert.match(evidenceReviewMigration, /price_evidence_confidence numeric/i);
  assert.match(evidenceReviewMigration, /price_evidence_detail jsonb/i);
  assert.match(evidenceReviewMigration, /conflicts jsonb not null default '\[\]'::jsonb/i);
  assert.match(evidenceReviewMigration, /review_decision text not null default 'NEED_REVIEW'/i);
});

test("quality metrics migration preserves immutable ai raw fields and creates a quality view", () => {
  assert.equal(existsSync(qualityMigrationPath), true);
  assert.match(qualityMigration, /add column if not exists ai_matched_entity_type text/i);
  assert.match(qualityMigration, /add column if not exists ai_matched_entity_id text/i);
  assert.match(qualityMigration, /add column if not exists ai_list_price_idr numeric/i);
  assert.match(qualityMigration, /add column if not exists ai_package_price_idr numeric/i);
  assert.match(qualityMigration, /add column if not exists ai_net_price_idr numeric/i);
  assert.match(qualityMigration, /add column if not exists ai_piece_count integer/i);
  assert.match(qualityMigration, /create or replace view public\.ai_price_candidate_quality_metrics_v1/i);
  assert.match(qualityMigration, /price_delta_pct/i);
  assert.match(qualityMigration, /row_correct_flag/i);
  assert.match(qualityMigration, /auto_approved_flag/i);
});

test("auto review processes eligible candidates with bounded concurrency", () => {
  assert.match(reviewService, /const AUTO_REVIEW_CONCURRENCY\s*=\s*10/);
  assert.match(reviewService, /eligibleCandidates/);
  assert.match(reviewService, /autoReviewCursor/);
  assert.match(reviewService, /Promise\.all\(Array\.from\(\{ length: workerCount \}, \(\) => autoReviewWorker\(\)\)\)/);
  assert.match(reviewService, /candidateMatchesReviewRule/);
  assert.match(reviewService, /approveAiPriceCandidate/);
  const autoApproveIndex = reviewService.indexOf("export async function autoApproveAiPriceCandidatesForVisit");
  const eligibilityLoopIndex = reviewService.indexOf("for (const candidate of candidateRows)", autoApproveIndex);
  const workerIndex = reviewService.indexOf("const autoReviewWorker", autoApproveIndex);
  assert.notEqual(autoApproveIndex, -1);
  assert.notEqual(eligibilityLoopIndex, -1);
  assert.notEqual(workerIndex, -1);
  assert.doesNotMatch(reviewService.slice(eligibilityLoopIndex, workerIndex), /await approveAiPriceCandidate/);
});

test("single candidate API can save pending review input without approving", () => {
  assert.match(singleRoute, /save_review_input/);
  assert.match(singleRoute, /parsed_price_idr/);
  assert.match(singleRoute, /piece_count/);
  assert.match(singleRoute, /price_per_piece/);
  assert.match(singleRoute, /status.*pending|pending.*status/s);
  assert.doesNotMatch(singleRoute, /ai_net_price_idr:\s*Math\.round\(price\)/);
  assert.doesNotMatch(singleRoute, /ai_piece_count:\s*Math\.floor\(pieceCount\)/);
});

test("bulk review API creates jobs and processes them in chunks", () => {
  assert.equal(existsSync(listRoutePath), true);
  assert.equal(existsSync(rulesRoutePath), true);
  assert.equal(existsSync(bulkRoutePath), true);
  assert.equal(existsSync(jobRoutePath), true);
  assert.equal(existsSync(runRoutePath), true);
  assert.match(listRoute, /getAiPriceCandidatesPage/);
  assert.match(listRoute, /items/);
  assert.match(listRoute, /total/);
  assert.match(rulesRoute, /getAiPriceReviewRule/);
  assert.match(rulesRoute, /upsertAiPriceReviewRule/);
  assert.match(bulkRoute, /ai_price_review_jobs/);
  assert.match(bulkRoute, /ai_price_review_job_items/);
  assert.match(jobRoute, /ai_price_review_jobs/);
  assert.match(runRoute, /BATCH_REVIEW_CHUNK_SIZE\s*=\s*10/);
  assert.match(runRoute, /limit\(BATCH_REVIEW_CHUNK_SIZE\)/);
  assert.match(runRoute, /candidateMatchesReviewRule/);
  assert.match(runRoute, /approveAiPriceCandidate/);
  assert.match(runRoute, /bulk_manual/);
  assert.match(runRoute, /skipped/);
});

test("bulk review API carries row correction overrides into approve processing", () => {
  assert.match(bulkRoute, /review_overrides/);
  assert.match(bulkRoute, /cleanReviewOverrides/);
  assert.match(bulkRoute, /price_idr/);
  assert.match(bulkRoute, /net_price_idr/);
  assert.match(bulkRoute, /promo_type/);
  assert.match(bulkRoute, /piece_count/);
  assert.match(runRoute, /reviewOverrides/);
  assert.match(runRoute, /overrideForCandidate/);
  assert.match(runRoute, /priceIdr:\s*overrideForCandidate\?\.net_price_idr\s*\?\?/);
  assert.match(runRoute, /pieceCount:\s*overrideForCandidate\?\.piece_count\s*\?\?/);
  assert.match(runRoute, /promoType:\s*overrideForCandidate\?\.promo_type\s*\?\?/);
});

test("bulk approval cannot bypass the historical quality gate", () => {
  assert.match(runRoute, /candidate\.quality_gate_status !== "PASSED"/);
  assert.match(runRoute, /Historical price quality gate requires individual review/);
  assert.match(runRoute, /status:\s*"skipped"/);
});
