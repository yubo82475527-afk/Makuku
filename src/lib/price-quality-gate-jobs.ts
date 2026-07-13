import { randomUUID } from "node:crypto";
import { autoApprovePassedAiPriceCandidates } from "@/lib/ai-price-review";
import { evaluatePriceQualityGate } from "@/lib/price-quality-gate";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type {
  AiPriceCandidateMatchType,
  AiPriceQualityGateStatus,
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

export async function runPriceQualityGate(input: {
  maxBatches?: number;
  supabase?: SupabaseServiceClient;
} = {}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const maxBatches = Math.max(1, Math.min(input.maxBatches ?? DEFAULT_MAX_BATCHES, DEFAULT_MAX_BATCHES));
  const counters = {
    claimed: 0,
    passed: 0,
    review_required: 0,
    insufficient: 0,
    failed: 0,
    already_finalized: 0,
    ownership_lost: 0,
    auto_approved: 0,
    auto_approval_failed: 0,
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
    counters.claimed += rows.length;

    for (const row of rows) {
      try {
        const benchmarkPrice = nullableNumber(row.median_price_per_piece);
        const result = evaluatePriceQualityGate({
          candidatePricePerPiece: nullableNumber(row.candidate_price_per_piece),
          evidenceReviewDecision: row.evidence_review_decision,
          matchedEntityType: row.matched_entity_type,
          matchedEntityId: row.matched_entity_id,
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
          supabase,
          workerId,
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
          error: null,
        });

        if (finalizeResult === "ALREADY_FINALIZED") counters.already_finalized += 1;
        else if (finalizeResult === "OWNERSHIP_LOST") counters.ownership_lost += 1;
        else if (result.status === "PASSED") counters.passed += 1;
        else if (result.status === "INSUFFICIENT_BENCHMARK") counters.insufficient += 1;
        else counters.review_required += 1;
      } catch (caught) {
        const message = (caught instanceof Error ? caught.message : String(caught)).slice(0, 1000);
        try {
          const finalizeResult = await finalizeCandidate({
            supabase,
            workerId,
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
            error: message,
          });
          if (finalizeResult === "ALREADY_FINALIZED") counters.already_finalized += 1;
          else if (finalizeResult === "OWNERSHIP_LOST") counters.ownership_lost += 1;
          else counters.failed += 1;
        } catch (finalizeError) {
          counters.failed += 1;
          console.error("[price-quality-gate] failed to finalize candidate error", {
            candidate_id: row.candidate_id,
            worker_id: workerId,
            error: finalizeError instanceof Error ? finalizeError.message : String(finalizeError),
          });
        }
      }
    }
  }

  const autoApproval = await autoApprovePassedAiPriceCandidates({
    supabase,
    limit: PRICE_QUALITY_GATE_BATCH_SIZE,
  });
  counters.auto_approved += autoApproval.approved;
  counters.auto_approval_failed += autoApproval.failed;

  return counters;
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
