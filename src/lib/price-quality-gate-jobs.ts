import { randomUUID } from "node:crypto";
import { autoApprovePassedAiPriceCandidates } from "@/lib/ai-price-review";
import { evaluatePriceQualityGate } from "@/lib/price-quality-gate";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type {
  AiPriceCandidateMatchType,
  AiPriceQualityGateStatus,
  BenchmarkAssessment,
  BenchmarkAssessmentReason,
  PriceQualityReasonCode,
  PriceReviewDecision,
} from "@/lib/types";

export const PRICE_QUALITY_GATE_BATCH_SIZE = 50;
const DEFAULT_MAX_BATCHES = 4;

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceClient>;
type FinalizableQualityStatus = Extract<
  AiPriceQualityGateStatus,
  "PASSED" | "REVIEW_REQUIRED" | "INSUFFICIENT_BENCHMARK" | "FAILED"
>;

type ClaimedQualityCandidate = {
  candidate_id: string;
  claim_input_fingerprint: string;
  candidate_price_per_piece: number | string | null;
  evidence_review_decision: PriceReviewDecision | null;
  matched_entity_type: AiPriceCandidateMatchType;
  matched_entity_id: string | null;
  match_score: number | string | null;
  has_warnings: boolean;
  has_conflicts: boolean;
  has_source_image: boolean;
  has_valid_package_facts: boolean;
  promo_type: string | null;
  benchmark_date: string | null;
  median_price_per_piece: number | string | null;
  benchmark_sample_count: number | string | null;
  benchmark_store_count: number | string | null;
  benchmark_status: "READY" | "INSUFFICIENT" | null;
};

type FinalizeResult = "APPLIED" | "ALREADY_FINALIZED" | "OWNERSHIP_LOST";

function nullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function finalizeCandidate(input: {
  supabase: SupabaseServiceClient;
  workerId: string;
  candidateId: string;
  expectedInputFingerprint: string;
  status: FinalizableQualityStatus;
  reasonCodes: PriceQualityReasonCode[];
  version: string | null;
  benchmarkDate: string | null;
  benchmarkPricePerPiece: number | null;
  benchmarkDeviationPct: number | null;
  benchmarkSampleCount: number | null;
  benchmarkStoreCount: number | null;
  benchmarkAssessment: BenchmarkAssessment;
  benchmarkAssessmentReason: BenchmarkAssessmentReason | null;
  error: string | null;
}): Promise<FinalizeResult> {
  const { data, error } = await input.supabase.rpc("finalize_ai_price_candidate_quality_gate", {
    p_candidate_id: input.candidateId,
    p_worker_id: input.workerId,
    p_expected_input_fingerprint: input.expectedInputFingerprint,
    p_quality_gate_status: input.status,
    p_reason_codes: input.reasonCodes,
    p_quality_gate_version: input.version,
    p_benchmark_date: input.benchmarkDate,
    p_benchmark_price_per_piece: input.benchmarkPricePerPiece,
    p_benchmark_deviation_pct: input.benchmarkDeviationPct,
    p_benchmark_sample_count: input.benchmarkSampleCount,
    p_benchmark_store_count: input.benchmarkStoreCount,
    p_benchmark_assessment: input.benchmarkAssessment,
    p_benchmark_assessment_reason: input.benchmarkAssessmentReason,
    p_error: input.error,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] as { finalize_result?: string } | undefined : null;
  const result = String(row?.finalize_result ?? "OWNERSHIP_LOST");
  if (result === "APPLIED" || result === "ALREADY_FINALIZED" || result === "OWNERSHIP_LOST") {
    return result;
  }
  throw new Error(`Unexpected price quality finalization result: ${result}`);
}

type QualityCounters = {
  claimed: number;
  passed: number;
  review_required: number;
  insufficient: number;
  building_passed: number;
  failed: number;
  already_finalized: number;
  ownership_lost: number;
};

function emptyQualityCounters(): QualityCounters {
  return {
    claimed: 0,
    passed: 0,
    review_required: 0,
    insufficient: 0,
    building_passed: 0,
    failed: 0,
    already_finalized: 0,
    ownership_lost: 0,
  };
}

function addQualityCounters(target: QualityCounters, source: QualityCounters) {
  target.claimed += source.claimed;
  target.passed += source.passed;
  target.review_required += source.review_required;
  target.insufficient += source.insufficient;
  target.building_passed += source.building_passed;
  target.failed += source.failed;
  target.already_finalized += source.already_finalized;
  target.ownership_lost += source.ownership_lost;
}

async function finalizeClaimedQualityCandidates(input: {
  supabase: SupabaseServiceClient;
  workerId: string;
  rows: ClaimedQualityCandidate[];
}) {
  const counters = emptyQualityCounters();
  const passedCandidateIds: string[] = [];
  counters.claimed = input.rows.length;

  for (const row of input.rows) {
    try {
      const benchmarkPrice = nullableNumber(row.median_price_per_piece);
      const result = evaluatePriceQualityGate({
        candidatePricePerPiece: nullableNumber(row.candidate_price_per_piece),
        evidenceReviewDecision: row.evidence_review_decision,
        matchedEntityType: row.matched_entity_type,
        matchedEntityId: row.matched_entity_id,
        matchScore: nullableNumber(row.match_score),
        hasWarnings: row.has_warnings,
        hasConflicts: row.has_conflicts,
        hasSourceImage: row.has_source_image,
        hasValidPackageFacts: row.has_valid_package_facts,
        promoType: row.promo_type,
        benchmark: row.benchmark_date && benchmarkPrice !== null
          ? {
              benchmarkDate: row.benchmark_date,
              medianPricePerPiece: benchmarkPrice,
              sampleCount: nullableNumber(row.benchmark_sample_count) ?? 0,
              storeCount: nullableNumber(row.benchmark_store_count) ?? 0,
              status: row.benchmark_status ?? "INSUFFICIENT",
            }
          : null,
      });
      const finalizeResult = await finalizeCandidate({
        supabase: input.supabase,
        workerId: input.workerId,
        candidateId: row.candidate_id,
        expectedInputFingerprint: row.claim_input_fingerprint,
        status: result.status,
        reasonCodes: result.reasonCodes,
        version: result.version,
        benchmarkDate: result.benchmarkDate,
        benchmarkPricePerPiece: result.benchmarkPricePerPiece,
        benchmarkDeviationPct: result.benchmarkDeviationPct,
        benchmarkSampleCount: result.benchmarkSampleCount,
        benchmarkStoreCount: result.benchmarkStoreCount,
        benchmarkAssessment: result.benchmarkAssessment,
        benchmarkAssessmentReason: result.benchmarkAssessmentReason,
        error: null,
      });

      if (finalizeResult === "ALREADY_FINALIZED") counters.already_finalized += 1;
      else if (finalizeResult === "OWNERSHIP_LOST") counters.ownership_lost += 1;
      else if (result.status === "PASSED") {
        counters.passed += 1;
        passedCandidateIds.push(row.candidate_id);
        if (result.benchmarkAssessment === "BUILDING") counters.building_passed += 1;
      } else {
        counters.review_required += 1;
      }
    } catch (caught) {
      const message = (caught instanceof Error ? caught.message : String(caught)).slice(0, 1000);
      try {
        const finalizeResult = await finalizeCandidate({
          supabase: input.supabase,
          workerId: input.workerId,
          candidateId: row.candidate_id,
          expectedInputFingerprint: row.claim_input_fingerprint,
          status: "FAILED",
          reasonCodes: [],
          version: null,
          benchmarkDate: row.benchmark_date,
          benchmarkPricePerPiece: nullableNumber(row.median_price_per_piece),
          benchmarkDeviationPct: null,
          benchmarkSampleCount: nullableNumber(row.benchmark_sample_count),
          benchmarkStoreCount: nullableNumber(row.benchmark_store_count),
          benchmarkAssessment: "NOT_EVALUATED",
          benchmarkAssessmentReason: null,
          error: message,
        });
        if (finalizeResult === "ALREADY_FINALIZED") counters.already_finalized += 1;
        else if (finalizeResult === "OWNERSHIP_LOST") counters.ownership_lost += 1;
        else counters.failed += 1;
      } catch (finalizeError) {
        counters.failed += 1;
        console.error("[price-quality-gate] failed to finalize candidate error", {
          candidate_id: row.candidate_id,
          worker_id: input.workerId,
          error: finalizeError instanceof Error ? finalizeError.message : String(finalizeError),
        });
      }
    }
  }

  return { ...counters, passedCandidateIds };
}

export async function runPriceQualityGate(input: {
  maxBatches?: number;
  supabase?: SupabaseServiceClient;
} = {}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const maxBatches = Math.max(1, Math.min(input.maxBatches ?? DEFAULT_MAX_BATCHES, DEFAULT_MAX_BATCHES));
  const counters = {
    ...emptyQualityCounters(),
    auto_approved: 0,
    auto_approval_failed: 0,
    priority_claimed: 0,
    priority_passed: 0,
    priority_review_required: 0,
    priority_auto_approved: 0,
    priority_auto_approval_failed: 0,
  };

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const workerId = `price-quality-${Date.now()}-${randomUUID()}`;
    const { data, error } = await supabase.rpc("claim_ai_price_candidates_for_quality_gate", {
      p_worker_id: workerId,
      p_limit: PRICE_QUALITY_GATE_BATCH_SIZE,
    });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as ClaimedQualityCandidate[];
    if (rows.length === 0) break;
    addQualityCounters(counters, await finalizeClaimedQualityCandidates({ supabase, workerId, rows }));
  }

  const autoApproval = await autoApprovePassedAiPriceCandidates({
    supabase,
    limit: PRICE_QUALITY_GATE_BATCH_SIZE,
  });
  counters.auto_approved += autoApproval.approved;
  counters.auto_approval_failed += autoApproval.failed;

  return counters;
}

export type PriorityPriceQualityGateResult = {
  priority_claimed: number;
  priority_passed: number;
  priority_review_required: number;
  priority_auto_approved: number;
  priority_auto_approval_failed: number;
  quality_elapsed_ms: number;
  auto_approval_elapsed_ms: number;
};

function emptyPriorityPriceQualityGateResult(): PriorityPriceQualityGateResult {
  return {
    priority_claimed: 0,
    priority_passed: 0,
    priority_review_required: 0,
    priority_auto_approved: 0,
    priority_auto_approval_failed: 0,
    quality_elapsed_ms: 0,
    auto_approval_elapsed_ms: 0,
  };
}

function addPriorityPriceQualityGateResult(
  target: PriorityPriceQualityGateResult,
  source: PriorityPriceQualityGateResult,
) {
  target.priority_claimed += source.priority_claimed;
  target.priority_passed += source.priority_passed;
  target.priority_review_required += source.priority_review_required;
  target.priority_auto_approved += source.priority_auto_approved;
  target.priority_auto_approval_failed += source.priority_auto_approval_failed;
  target.quality_elapsed_ms += source.quality_elapsed_ms;
  target.auto_approval_elapsed_ms += source.auto_approval_elapsed_ms;
}

export async function runPriorityPriceQualityGate(input: {
  supabase: SupabaseServiceClient;
  candidateIds: string[];
}): Promise<PriorityPriceQualityGateResult> {
  const candidateIds = Array.from(new Set(input.candidateIds.map((value) => value.trim()).filter(Boolean))).slice(0, 50);
  const empty = emptyPriorityPriceQualityGateResult();
  if (candidateIds.length === 0) return empty;

  const workerId = `price-priority-${Date.now()}-${randomUUID()}`;
  const qualityStartedAt = performance.now();
  const { data, error } = await input.supabase.rpc("claim_ai_price_candidates_for_priority_quality_gate", {
    p_worker_id: workerId,
    p_candidate_ids: candidateIds,
  });
  if (error) throw new Error(error.message);

  const quality = await finalizeClaimedQualityCandidates({
    supabase: input.supabase,
    workerId,
    rows: (data ?? []) as ClaimedQualityCandidate[],
  });
  const qualityElapsedMs = Math.round(performance.now() - qualityStartedAt);
  const autoApprovalStartedAt = performance.now();
  const autoApproval = await autoApprovePassedAiPriceCandidates({
    supabase: input.supabase,
    candidateIds: quality.passedCandidateIds,
    priority: true,
  });

  return {
    priority_claimed: quality.claimed,
    priority_passed: quality.passed,
    priority_review_required: quality.review_required + quality.insufficient,
    priority_auto_approved: autoApproval.approved,
    priority_auto_approval_failed: autoApproval.failed,
    quality_elapsed_ms: qualityElapsedMs,
    auto_approval_elapsed_ms: Math.round(performance.now() - autoApprovalStartedAt),
  };
}

/** Chunks past the single-call 50-id limit so rematch / large visits do not silently drop candidates. */
export async function runPriorityPriceQualityGateBatched(input: {
  supabase: SupabaseServiceClient;
  candidateIds: string[];
}): Promise<PriorityPriceQualityGateResult & { chunk_count: number }> {
  const candidateIds = Array.from(new Set(input.candidateIds.map((value) => value.trim()).filter(Boolean)));
  const totals = emptyPriorityPriceQualityGateResult();
  let chunkCount = 0;
  for (let offset = 0; offset < candidateIds.length; offset += PRICE_QUALITY_GATE_BATCH_SIZE) {
    chunkCount += 1;
    const chunk = candidateIds.slice(offset, offset + PRICE_QUALITY_GATE_BATCH_SIZE);
    addPriorityPriceQualityGateResult(totals, await runPriorityPriceQualityGate({
      supabase: input.supabase,
      candidateIds: chunk,
    }));
  }
  return { ...totals, chunk_count: chunkCount };
}

export async function triggerPriceQualityGateRunner(input: { requestUrl: string }) {
  const secret = String(process.env.CRON_SECRET ?? process.env.INTERNAL_JOB_SECRET ?? "").trim();
  if (!secret) {
    await runPriceQualityGate();
    return;
  }

  const url = new URL("/api/internal/price-quality/run", input.requestUrl);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      console.error("[price-quality-gate] runner trigger returned non-success", {
        status: response.status,
      });
    }
  } catch (error) {
    console.error("[price-quality-gate] failed to trigger runner", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
