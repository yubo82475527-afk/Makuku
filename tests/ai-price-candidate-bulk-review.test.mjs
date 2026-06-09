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

test("single candidate API can save pending review input without approving", () => {
  assert.match(singleRoute, /save_review_input/);
  assert.match(singleRoute, /parsed_price_idr/);
  assert.match(singleRoute, /piece_count/);
  assert.match(singleRoute, /price_per_piece/);
  assert.match(singleRoute, /status.*pending|pending.*status/s);
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
  assert.match(runRoute, /limit\(50\)/);
  assert.match(runRoute, /candidateMatchesReviewRule/);
  assert.match(runRoute, /approveAiPriceCandidate/);
  assert.match(runRoute, /bulk_manual/);
  assert.match(runRoute, /skipped/);
});

test("bulk review API carries row correction overrides into approve processing", () => {
  assert.match(bulkRoute, /review_overrides/);
  assert.match(bulkRoute, /cleanReviewOverrides/);
  assert.match(bulkRoute, /price_idr/);
  assert.match(bulkRoute, /piece_count/);
  assert.match(runRoute, /reviewOverrides/);
  assert.match(runRoute, /overrideForCandidate/);
  assert.match(runRoute, /priceIdr:\s*overrideForCandidate\?\.price_idr\s*\?\?/);
  assert.match(runRoute, /pieceCount:\s*overrideForCandidate\?\.piece_count\s*\?\?/);
});
