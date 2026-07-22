import type {
  AiPriceCandidate,
  AiPriceQualityGateStatus,
  PriceCandidateHandling,
  StoreVisitAiJobStatus,
  StoreVisitAnalysisStatus,
  VisitPriceHandlingSummary,
} from "@/lib/types";

type CandidateInput = Pick<AiPriceCandidate,
  | "status"
  | "review_decision"
  | "quality_gate_status"
  | "quality_gate_attempt_count"
>;

const manualQualityGateStatuses = new Set<AiPriceQualityGateStatus>([
  "REVIEW_REQUIRED",
  "INSUFFICIENT_BENCHMARK",
]);

export function resolveCandidatePriceHandling(candidate: CandidateInput): PriceCandidateHandling {
  if (candidate.status === "approved" || candidate.status === "rejected") {
    return { status: "COMPLETED", action_type: null };
  }

  if (
    candidate.review_decision === "NEED_REVIEW"
    || manualQualityGateStatuses.has(candidate.quality_gate_status ?? "PENDING")
    || (candidate.quality_gate_status === "FAILED" && Number(candidate.quality_gate_attempt_count ?? 0) >= 3)
  ) {
    return { status: "ACTION_REQUIRED", action_type: "MANUAL_CONFIRMATION_REQUIRED" };
  }

  return { status: "PROCESSING", action_type: null };
}

export function summarizeVisitPriceHandling(input: {
  analysis_status: StoreVisitAnalysisStatus | null | undefined;
  active_job_status: StoreVisitAiJobStatus | null | undefined;
  candidates: CandidateInput[];
}): VisitPriceHandlingSummary {
  const candidateCounts = {
    processing: 0,
    action_required: 0,
    approved: 0,
    rejected: 0,
  };
  let manualConfirmationRequired = 0;

  for (const candidate of input.candidates) {
    const handling = resolveCandidatePriceHandling(candidate);
    if (candidate.status === "approved") candidateCounts.approved += 1;
    if (candidate.status === "rejected") candidateCounts.rejected += 1;
    if (handling.status === "PROCESSING") candidateCounts.processing += 1;
    if (handling.status === "ACTION_REQUIRED") {
      candidateCounts.action_required += 1;
      manualConfirmationRequired += 1;
    }
  }

  const retakeRequired = input.analysis_status === "action_required" ? 1 : 0;
  const retryRequired = input.analysis_status === "partial" || input.analysis_status === "failed" ? 1 : 0;
  const actionRequired = retakeRequired + manualConfirmationRequired + retryRequired > 0;
  const processing = input.analysis_status === "pending"
    || input.analysis_status === "analyzing"
    || input.active_job_status === "queued"
    || input.active_job_status === "running"
    || candidateCounts.processing > 0;

  return {
    status: actionRequired ? "ACTION_REQUIRED" : processing ? "PROCESSING" : "COMPLETED",
    action_counts: {
      retake_required: retakeRequired,
      manual_confirmation_required: manualConfirmationRequired,
      retry_required: retryRequired,
    },
    candidate_counts: candidateCounts,
  };
}
