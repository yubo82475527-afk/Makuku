import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const migrationPath = "supabase/migrations/202607130001_price_quality_gate_phase1.sql";
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const types = readFileSync("src/lib/types.ts", "utf8");
const benchmarkServicePath = "src/lib/price-quality-benchmarks.ts";
const benchmarkService = existsSync(benchmarkServicePath) ? readFileSync(benchmarkServicePath, "utf8") : "";
const jobsPath = "src/lib/price-quality-gate-jobs.ts";
const jobs = existsSync(jobsPath) ? readFileSync(jobsPath, "utf8") : "";
const runRoutePath = "src/app/api/internal/price-quality/run/route.ts";
const refreshRoutePath = "src/app/api/internal/price-quality/refresh-benchmarks/route.ts";
const vercelConfig = readFileSync("vercel.json", "utf8");
const candidateService = readFileSync("src/lib/ai-price-candidates.ts", "utf8");
const visitRunnerRoute = readFileSync("src/app/api/internal/store-visit-ai/run/route.ts", "utf8");
const visitJobs = readFileSync("src/lib/store-visit-ai-jobs.ts", "utf8");
const reviewService = readFileSync("src/lib/ai-price-review.ts", "utf8");
const bulkReviewRunRoute = readFileSync("src/app/api/ai-price-candidates/bulk-review/[jobId]/run/route.ts", "utf8");
const candidateReviewRoute = readFileSync("src/app/api/ai-price-candidates/[id]/route.ts", "utf8");
const visitCandidateReviewRoute = readFileSync("src/app/api/store-visit/price-candidates/[id]/route.ts", "utf8");

function loadQualityEvaluator() {
  const path = "src/lib/price-quality-gate.ts";
  if (!existsSync(path)) return null;
  const source = readFileSync(path, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(transpiled, {
    module: testModule,
    exports: testModule.exports,
    require(id) {
      if (id === "@/lib/types") return {};
      throw new Error(`Unexpected require: ${id}`);
    },
  });
  return testModule.exports;
}

test("price quality migration defines a dedicated daily L2 benchmark", () => {
  assert.equal(existsSync(migrationPath), true);
  assert.match(migration, /create table if not exists public\.price_quality_benchmark_daily/i);
  assert.match(migration, /unique\s*\(benchmark_date, matched_entity_type, matched_entity_id, channel\)/i);
  assert.match(migration, /median_price_per_piece/i);
  assert.match(migration, /sample_count/i);
  assert.match(migration, /store_count/i);
  assert.match(migration, /window_start_date/i);
  assert.match(migration, /window_end_date/i);
  assert.doesNotMatch(migration, /city_id|city_name|district/i);
});

test("candidate schema keeps evidence review separate from historical quality", () => {
  assert.match(migration, /evidence_review_decision/i);
  assert.match(migration, /quality_gate_status/i);
  assert.match(migration, /quality_gate_reason_codes/i);
  assert.match(migration, /benchmark_deviation_pct/i);
  assert.match(migration, /quality_gate_worker_id/i);
  assert.match(migration, /quality_gate_attempt_count/i);
  assert.match(types, /AiPriceQualityGateStatus/);
  assert.match(types, /PriceQualityReasonCode/);
  assert.match(types, /evidence_review_decision/);
});

test("editing a pending candidate invalidates stale quality results", () => {
  assert.match(migration, /reset_ai_price_candidate_quality_gate_on_input_change/i);
  assert.match(migration, /new\.matched_entity_id is distinct from old\.matched_entity_id/i);
  assert.match(migration, /new\.price_per_piece is distinct from old\.price_per_piece/i);
  assert.match(migration, /new\.quality_gate_status := 'PENDING'/i);
  assert.match(migration, /new\.review_decision := 'NEED_REVIEW'/i);
});

test("daily benchmark refresh is Jakarta T+1, deduplicated, and idempotent", () => {
  assert.match(migration, /create or replace function public\.refresh_price_quality_benchmark_daily/i);
  assert.match(migration, /timezone\('Asia\/Jakarta'/i);
  assert.match(migration, /v_benchmark_date - 30/i);
  assert.match(migration, /row_number\(\)[\s\S]*offline_store_id[\s\S]*captured_at/i);
  assert.match(migration, /percentile_cont\(0\.5\)/i);
  assert.match(migration, /delete from public\.price_quality_benchmark_daily/i);
  assert.match(migration, /grouped\.sample_count >= 5 and grouped\.store_count >= 3/i);
  assert.match(migration, /snapshot\.captured_at >= v_window_start_at/);
  assert.match(migration, /snapshot\.captured_at < v_window_end_exclusive_at/);
  assert.doesNotMatch(migration, /timezone\('Asia\/Jakarta', snapshot\.captured_at\)::date\s+between/);
  assert.doesNotMatch(migration, /market_benchmark_period_prices/i);
});

test("quality claims wait for a completed daily refresh marker", () => {
  assert.match(migration, /create table if not exists public\.price_quality_benchmark_refresh_runs/);
  assert.match(migration, /insert into public\.price_quality_benchmark_refresh_runs/);
  assert.match(migration, /benchmark\.benchmark_date = v_benchmark_date/);
  assert.match(migration, /exists \([\s\S]*price_quality_benchmark_refresh_runs[\s\S]*refresh\.status = 'COMPLETED'/);
});

test("benchmark service calls the refresh RPC instead of reading snapshots", () => {
  assert.equal(existsSync(benchmarkServicePath), true);
  assert.match(benchmarkService, /refresh_price_quality_benchmark_daily/);
  assert.doesNotMatch(benchmarkService, /from\("price_snapshots"\)/);
});

test("quality evaluator passes a clear candidate within 30 percent", () => {
  const evaluator = loadQualityEvaluator();
  assert.ok(evaluator);
  const result = evaluator.evaluatePriceQualityGate({
    candidatePricePerPiece: 2400,
    evidenceReviewDecision: "AUTO_APPROVE",
    matchedEntityType: "material_master",
    matchedEntityId: "SKU-1",
    promoType: null,
    benchmark: {
      benchmarkDate: "2026-07-13",
      medianPricePerPiece: 2200,
      sampleCount: 8,
      storeCount: 5,
      status: "READY",
    },
  });
  assert.equal(result.status, "PASSED");
  assert.equal(result.reviewDecision, "AUTO_APPROVE");
  assert.equal(result.reasonCodes.length, 0);
});

test("quality evaluator uses strict 30 and 50 percent boundaries", () => {
  const evaluator = loadQualityEvaluator();
  assert.ok(evaluator);
  const baseline = {
    evidenceReviewDecision: "AUTO_APPROVE",
    matchedEntityType: "material_master",
    matchedEntityId: "SKU-1",
    promoType: null,
    benchmark: {
      benchmarkDate: "2026-07-13",
      medianPricePerPiece: 2000,
      sampleCount: 8,
      storeCount: 5,
      status: "READY",
    },
  };
  assert.equal(evaluator.evaluatePriceQualityGate({ ...baseline, candidatePricePerPiece: 2600 }).status, "PASSED");
  const barelyHigh = evaluator.evaluatePriceQualityGate({ ...baseline, candidatePricePerPiece: 2600.000002 });
  assert.ok(barelyHigh.reasonCodes.includes("PRICE_DEVIATION_HIGH"));
  const high = evaluator.evaluatePriceQualityGate({ ...baseline, candidatePricePerPiece: 2601 });
  assert.equal(high.status, "REVIEW_REQUIRED");
  assert.ok(high.reasonCodes.includes("PRICE_DEVIATION_HIGH"));
  const critical = evaluator.evaluatePriceQualityGate({ ...baseline, candidatePricePerPiece: 3001 });
  assert.ok(critical.reasonCodes.includes("PRICE_DEVIATION_CRITICAL"));
  assert.ok(!critical.reasonCodes.includes("PRICE_DEVIATION_HIGH"));
  const barelyCritical = evaluator.evaluatePriceQualityGate({ ...baseline, candidatePricePerPiece: 3000.000002 });
  assert.ok(barelyCritical.reasonCodes.includes("PRICE_DEVIATION_CRITICAL"));
});

test("quality evaluator detects scale errors after per-piece conversion", () => {
  const evaluator = loadQualityEvaluator();
  assert.ok(evaluator);
  for (const candidatePricePerPiece of [10, 100, 1000, 100000, 1000000, 10000000]) {
    const result = evaluator.evaluatePriceQualityGate({
      candidatePricePerPiece,
      evidenceReviewDecision: "AUTO_APPROVE",
      matchedEntityType: "competitor_product",
      matchedEntityId: "product-1",
      promoType: null,
      benchmark: {
        benchmarkDate: "2026-07-13",
        medianPricePerPiece: 10000,
        sampleCount: 10,
        storeCount: 6,
        status: "READY",
      },
    });
    assert.ok(result.reasonCodes.includes("AMOUNT_SCALE_SUSPECTED"));
  }
});

test("quality evaluator keeps insufficient, unmatched, evidence, and promo cases in review", () => {
  const evaluator = loadQualityEvaluator();
  assert.ok(evaluator);
  const insufficient = evaluator.evaluatePriceQualityGate({
    candidatePricePerPiece: 2200,
    evidenceReviewDecision: "AUTO_APPROVE",
    matchedEntityType: "material_master",
    matchedEntityId: "SKU-1",
    promoType: null,
    benchmark: null,
  });
  assert.equal(insufficient.status, "INSUFFICIENT_BENCHMARK");
  assert.ok(insufficient.reasonCodes.includes("INSUFFICIENT_BENCHMARK"));

  const evidence = evaluator.evaluatePriceQualityGate({
    candidatePricePerPiece: 2200,
    evidenceReviewDecision: "NEED_REVIEW",
    matchedEntityType: "unmatched",
    matchedEntityId: null,
    promoType: null,
    benchmark: null,
  });
  assert.equal(evidence.reviewDecision, "NEED_REVIEW");
  assert.ok(evidence.reasonCodes.includes("EVIDENCE_REVIEW_REQUIRED"));
  assert.ok(evidence.reasonCodes.includes("SKU_MATCH_UNCERTAIN"));

  const promotion = evaluator.evaluatePriceQualityGate({
    candidatePricePerPiece: 1300,
    evidenceReviewDecision: "AUTO_APPROVE",
    matchedEntityType: "material_master",
    matchedEntityId: "SKU-1",
    promoType: "Discount",
    benchmark: {
      benchmarkDate: "2026-07-13",
      medianPricePerPiece: 2200,
      sampleCount: 8,
      storeCount: 5,
      status: "READY",
    },
  });
  assert.equal(promotion.status, "REVIEW_REQUIRED");
  assert.ok(promotion.reasonCodes.includes("PROMOTION_EVIDENCE"));
});

test("quality work uses fenced claim and finalize RPCs", () => {
  assert.match(migration, /claim_ai_price_candidates_for_quality_gate/i);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /quality_gate_status = 'PROCESSING'/i);
  assert.match(migration, /quality_gate_attempt_count \+ 1/i);
  assert.match(migration, /quality_gate_claimed_at < now\(\) - interval '10 minutes'/i);
  assert.match(migration, /finalize_ai_price_candidate_quality_gate/i);
  assert.match(migration, /quality_gate_worker_id = p_worker_id/i);
  assert.match(migration, /quality_gate_status = 'PROCESSING'/i);
  assert.match(migration, /grant execute on function public\.claim_ai_price_candidates_for_quality_gate/i);
  assert.match(migration, /grant execute on function public\.finalize_ai_price_candidate_quality_gate/i);
});

test("an exhausted stale third lease is terminalized instead of remaining processing forever", () => {
  assert.match(migration, /quality_gate_status = 'FAILED'[\s\S]*lease expired after maximum attempts/i);
  assert.match(migration, /quality_gate_attempt_count >= 3/);
  assert.match(migration, /quality_gate_claimed_at < now\(\) - interval '10 minutes'/);
});

test("price quality runs in a bounded asynchronous worker", () => {
  assert.equal(existsSync(jobsPath), true);
  assert.match(jobs, /claim_ai_price_candidates_for_quality_gate/);
  assert.match(jobs, /evaluatePriceQualityGate/);
  assert.match(jobs, /finalize_ai_price_candidate_quality_gate/);
  assert.match(jobs, /PRICE_QUALITY_GATE_BATCH_SIZE\s*=\s*50/);
  assert.match(jobs, /maxBatches/);
  assert.equal(existsSync(runRoutePath), true);
  assert.equal(existsSync(refreshRoutePath), true);
});

test("price quality internal routes require cron secret or admin", () => {
  const runRoute = existsSync(runRoutePath) ? readFileSync(runRoutePath, "utf8") : "";
  const refreshRoute = existsSync(refreshRoutePath) ? readFileSync(refreshRoutePath, "utf8") : "";
  for (const source of [runRoute, refreshRoute]) {
    assert.match(source, /CRON_SECRET/);
    assert.match(source, /requireAdminSession/);
    assert.match(source, /Authorization|authorization/);
  }
});

test("manual benchmark refresh rejects impossible calendar dates", () => {
  const refreshRoute = readFileSync(refreshRoutePath, "utf8");
  assert.match(refreshRoute, /function isValidBenchmarkDate/);
  assert.match(refreshRoute, /toISOString\(\)\.slice\(0, 10\) === value/);
  assert.match(refreshRoute, /!isValidBenchmarkDate\(benchmarkDate\)/);
});

test("cron refreshes T+1 daily and repairs candidate work every minute", () => {
  assert.match(vercelConfig, /\/api\/internal\/price-quality\/refresh-benchmarks/);
  assert.match(vercelConfig, /"30 17 \* \* \*"/);
  assert.match(vercelConfig, /\/api\/internal\/price-quality\/run/);
  assert.match(vercelConfig, /"\* \* \* \* \*"/);
});

test("new candidates preserve evidence decision and wait for historical quality", () => {
  assert.match(candidateService, /evidence_review_decision/);
  assert.match(candidateService, /item\.type === "SKU"\s*\?\s*"PENDING"\s*:\s*"NOT_REQUIRED"/);
  assert.match(candidateService, /quality_gate_reason_codes:\s*\[\]/);
  assert.match(candidateService, /review_decision:\s*"NEED_REVIEW"/);
});

test("non-SKU candidates are not stranded in a quality queue that only claims SKUs", () => {
  assert.match(migration, /candidate\.candidate_type = 'SKU'/);
  assert.match(migration, /new\.candidate_type = 'SKU'/);
  assert.match(candidateService, /quality_gate_status:\s*item\.type === "SKU"\s*\?\s*"PENDING"\s*:\s*"NOT_REQUIRED"/);
});

test("Visit runner triggers quality work after analysis without putting history in the job path", () => {
  assert.match(visitRunnerRoute, /triggerPriceQualityGateRunner/);
  assert.match(visitRunnerRoute, /after\(\(\) => triggerPriceQualityGateRunner/);
  assert.doesNotMatch(visitJobs, /refresh_price_quality_benchmark_daily|price_quality_benchmark_daily/);
});

test("automatic and bulk approval require a passed quality gate", () => {
  assert.match(reviewService, /candidate\.quality_gate_status !== "PASSED"/);
  assert.match(reviewService, /Historical price quality gate has not passed/);
});

test("approval is atomically bound to the exact inputs evaluated by the gate", () => {
  assert.match(migration, /approval_input_fingerprint/);
  assert.match(migration, /quality_gate_input_fingerprint/);
  assert.match(migration, /create or replace function public\.approve_ai_price_candidate_with_quality_gate/);
  assert.match(migration, /for update of candidate/);
  assert.match(migration, /quality_gate_input_fingerprint[^;]+approval_input_fingerprint/s);
  assert.match(reviewService, /approve_ai_price_candidate_with_quality_gate/);
  assert.doesNotMatch(reviewService, /\.from\("price_snapshots"\)\s*\n\s*\.insert\(/);
});

test("authenticated clients cannot mutate governed price facts or quality state directly", () => {
  assert.match(migration, /drop policy if exists "authenticated insert ai_price_candidates"/i);
  assert.match(migration, /drop policy if exists "authenticated update ai_price_candidates"/i);
  assert.match(migration, /drop policy if exists "authenticated insert price_snapshots"/i);
  assert.match(migration, /drop policy if exists "authenticated update price_snapshots"/i);
  assert.match(migration, /revoke insert, update, delete on table public\.ai_price_candidates\s+from anon, authenticated/i);
  assert.match(migration, /revoke insert, update, delete on table public\.price_snapshots\s+from anon, authenticated/i);
});

test("candidate rejection is atomic with approval and clears queue ownership", () => {
  assert.match(migration, /create or replace function public\.reject_ai_price_candidate_with_quality_gate/i);
  assert.match(migration, /for update of candidate/i);
  assert.match(migration, /v_candidate\.status <> 'pending'/i);
  assert.match(migration, /auto_approval_status = 'NOT_REQUIRED'/i);
  assert.match(migration, /auto_approval_worker_id = null/i);
  assert.match(migration, /quality_gate_worker_id = null/i);
  assert.match(reviewService, /reject_ai_price_candidate_with_quality_gate/);
  assert.doesNotMatch(reviewService, /select\("id,status"\)[\s\S]*updateAiPriceCandidateWithReviewMethodFallback/);
});

test("quality finalization is fenced to the exact inputs returned by claim", () => {
  assert.match(migration, /claim_input_fingerprint text/i);
  assert.match(migration, /candidate\.approval_input_fingerprint[\s\S]*from claimed candidate/i);
  assert.match(migration, /p_expected_input_fingerprint text/i);
  assert.match(migration, /candidate\.approval_input_fingerprint = p_expected_input_fingerprint/i);
  assert.match(migration, /quality_gate_input_fingerprint = p_expected_input_fingerprint/i);
  assert.match(jobs, /claim_input_fingerprint/);
  assert.match(jobs, /p_expected_input_fingerprint:\s*input\.expectedInputFingerprint/);
});

test("quality decisions keep append-only evaluation audit records", () => {
  assert.match(migration, /create table if not exists public\.price_quality_gate_evaluations/i);
  assert.match(migration, /candidate_id uuid not null references public\.ai_price_candidates/i);
  assert.match(migration, /claim_input_fingerprint text not null/i);
  assert.match(migration, /quality_gate_attempt_count integer not null/i);
  assert.match(migration, /insert into public\.price_quality_gate_evaluations[\s\S]*p_expected_input_fingerprint/i);
  assert.match(migration, /lease expired after maximum attempts[\s\S]*price_quality_gate_evaluations/i);
  assert.match(migration, /revoke insert, update, delete on table public\.price_quality_gate_evaluations/i);
});

test("daily benchmark refresh serializes by benchmark date", () => {
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /v_benchmark_date - date '2000-01-01'/i);
});

test("every evaluated or snapshotted candidate input invalidates stale quality", () => {
  assert.match(migration, /p_evidence_review_decision text/i);
  assert.match(migration, /p_visible_price_per_piece numeric/i);
  for (const field of [
    "evidence_review_decision",
    "visible_price_per_piece_idr",
    "ai_price_per_piece",
    "ai_promo_type",
  ]) {
    assert.match(migration, new RegExp(`new\\.${field} is distinct from old\\.${field}`, "i"));
    assert.match(migration, new RegExp(`before update of[\\s\\S]*${field}`, "i"));
  }
});

test("H5 corrections cannot overwrite an approved price fact", () => {
  assert.match(visitCandidateReviewRoute, /candidateStatuses\s*=\s*\["pending"\];/);
  assert.match(visitCandidateReviewRoute, /\.eq\("status", "pending"\)/);
  assert.doesNotMatch(visitCandidateReviewRoute, /syncCandidateReviewInputToPriceSnapshot/);
  assert.doesNotMatch(visitCandidateReviewRoute, /syncCandidateMatchToPriceSnapshot/);
  assert.doesNotMatch(visitCandidateReviewRoute, /deleteLinkedSnapshot/);
});

test("bulk manual override cannot bypass a risky quality result", () => {
  assert.match(bulkReviewRunRoute, /quality_gate_status/);
  assert.match(bulkReviewRunRoute, /PASSED/);
  assert.match(bulkReviewRunRoute, /skipped/);
});

test("single manual review accepts only terminal operator-review quality states", () => {
  assert.match(reviewService, /reviewMethod === "manual"/);
  assert.match(reviewService, /quality_gate_status === "REVIEW_REQUIRED"/);
  assert.match(reviewService, /quality_gate_status === "INSUFFICIENT_BENCHMARK"/);
  assert.match(reviewService, /quality_gate_status === "FAILED"/);
  assert.match(reviewService, /quality_gate_attempt_count >= 3/);
  assert.match(reviewService, /Review token is required/);
  assert.match(reviewService, /p_review_token/);
});

test("passed candidates are auto-approved asynchronously and retried by the runner", () => {
  assert.match(reviewService, /autoApprovePassedAiPriceCandidates/);
  assert.match(reviewService, /claim_ai_price_candidates_for_auto_approval/);
  assert.match(reviewService, /finalize_ai_price_candidate_auto_approval_failure/);
  assert.match(jobs, /autoApprovePassedAiPriceCandidates/);
});

test("automatic approval uses a fenced bounded queue so poison rows cannot starve newer candidates", () => {
  assert.match(migration, /auto_approval_status/);
  assert.match(migration, /auto_approval_attempt_count/);
  assert.match(migration, /claim_ai_price_candidates_for_auto_approval/);
  assert.match(migration, /finalize_ai_price_candidate_auto_approval_failure/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /auto_approval_attempt_count < 3/);
  assert.match(migration, /auto_approval_worker_id = p_worker_id/);
  assert.match(migration, /auto_approval_status = 'EXHAUSTED'/);
});

test("single approval routes keep policy centralized in the review service", () => {
  assert.match(candidateReviewRoute, /approveAiPriceCandidate/);
  assert.match(visitCandidateReviewRoute, /approveAiPriceCandidate/);
});

test("quality gate provides explicit refresh and repair commands", () => {
  const refreshScriptPath = "scripts/refresh-price-quality-benchmarks.mjs";
  const runScriptPath = "scripts/run-price-quality-gate.mjs";
  assert.equal(existsSync(refreshScriptPath), true);
  assert.equal(existsSync(runScriptPath), true);
  const refreshScript = readFileSync(refreshScriptPath, "utf8");
  const runScript = readFileSync(runScriptPath, "utf8");
  assert.match(refreshScript, /price-quality\/refresh-benchmarks/);
  assert.match(runScript, /price-quality\/run/);
  assert.match(refreshScript, /CRON_SECRET|INTERNAL_JOB_SECRET/);
  assert.match(runScript, /CRON_SECRET|INTERNAL_JOB_SECRET/);
});

test("price architecture documents the implemented asynchronous T+1 quality boundary", () => {
  const architecture = readFileSync("docs/architecture/price-intelligence-v1.md", "utf8");
  assert.match(architecture, /price_quality_benchmark_daily/);
  assert.match(architecture, /D-30[\s\S]*D-1/);
  assert.match(architecture, /ai_price_candidates[\s\S]*quality/i);
  assert.match(architecture, /Visit[\s\S]*(?:never waits|不等待|不会等待)/i);
  assert.match(architecture, /price_snapshots[\s\S]*(?:confirmed|已确认|事实)/i);
});
