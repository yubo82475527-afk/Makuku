import type {
  AiPriceCandidateMatchType,
  AiPriceQualityGateStatus,
  BenchmarkAssessment,
  BenchmarkAssessmentReason,
  PriceQualityReasonCode,
  PriceReviewDecision,
} from "@/lib/types";

export const PRICE_QUALITY_GATE_VERSION = "price-quality-gate-v2";
export const HIGH_DEVIATION_PCT = 30;
export const CRITICAL_DEVIATION_PCT = 50;
export const MIN_BENCHMARK_SAMPLES = 5;
export const MIN_BENCHMARK_STORES = 3;

type QualityBenchmarkInput = {
  benchmarkDate: string;
  medianPricePerPiece: number;
  sampleCount: number;
  storeCount: number;
  status: "READY" | "INSUFFICIENT";
};

export type PriceQualityGateInput = {
  candidatePricePerPiece: number | null;
  evidenceReviewDecision: PriceReviewDecision | null;
  matchedEntityType: AiPriceCandidateMatchType;
  matchedEntityId: string | null;
  matchScore: number | null;
  hasWarnings: boolean;
  hasConflicts: boolean;
  hasSourceImage: boolean;
  hasValidPackageFacts: boolean;
  promoType: string | null;
  benchmark: QualityBenchmarkInput | null;
};

export type PriceQualityGateResult = {
  status: Extract<
    AiPriceQualityGateStatus,
    "PASSED" | "REVIEW_REQUIRED"
  >;
  reviewDecision: PriceReviewDecision;
  reasonCodes: PriceQualityReasonCode[];
  benchmarkDate: string | null;
  benchmarkPricePerPiece: number | null;
  benchmarkDeviationPct: number | null;
  benchmarkSampleCount: number | null;
  benchmarkStoreCount: number | null;
  benchmarkAssessment: BenchmarkAssessment;
  benchmarkAssessmentReason: BenchmarkAssessmentReason | null;
  version: string;
};

const SCALE_MULTIPLES = [10, 100, 1000] as const;
const SCALE_TOLERANCE = 0.08;

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function addReason(reasons: PriceQualityReasonCode[], reason: PriceQualityReasonCode) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function isApproximateScaleError(candidatePrice: number, benchmarkPrice: number) {
  const ratio = candidatePrice / benchmarkPrice;
  return SCALE_MULTIPLES.some((multiple) => {
    const directMin = multiple * (1 - SCALE_TOLERANCE);
    const directMax = multiple * (1 + SCALE_TOLERANCE);
    const inverse = 1 / multiple;
    const inverseMin = inverse * (1 - SCALE_TOLERANCE);
    const inverseMax = inverse * (1 + SCALE_TOLERANCE);
    return (ratio >= directMin && ratio <= directMax)
      || (ratio >= inverseMin && ratio <= inverseMax);
  });
}

function roundedDeviationPct(candidatePrice: number, benchmarkPrice: number) {
  return Math.round(rawDeviationPct(candidatePrice, benchmarkPrice) * 10000) / 10000;
}

function rawDeviationPct(candidatePrice: number, benchmarkPrice: number) {
  return ((candidatePrice - benchmarkPrice) / benchmarkPrice) * 100;
}

type BenchmarkAssessmentResult = {
  assessment: BenchmarkAssessment;
  reason: BenchmarkAssessmentReason | null;
  usable: boolean;
};

function assessBenchmark(input: PriceQualityGateInput): BenchmarkAssessmentResult {
  if (input.matchedEntityType === "unmatched" || !input.matchedEntityId) {
    return { assessment: "NOT_EVALUATED", reason: null, usable: false };
  }

  const benchmark = input.benchmark;
  if (!benchmark) {
    return { assessment: "BUILDING", reason: "NO_HISTORY", usable: false };
  }

  const lowSample = benchmark.sampleCount < MIN_BENCHMARK_SAMPLES;
  const lowStore = benchmark.storeCount < MIN_BENCHMARK_STORES;
  const usable = benchmark.status === "READY"
    && isPositiveFinite(benchmark.medianPricePerPiece)
    && !lowSample
    && !lowStore;
  if (usable) return { assessment: "READY", reason: null, usable: true };
  if (lowSample && lowStore) {
    return { assessment: "BUILDING", reason: "LOW_SAMPLE_AND_STORE", usable: false };
  }
  if (lowSample) return { assessment: "BUILDING", reason: "LOW_SAMPLE", usable: false };
  if (lowStore) return { assessment: "BUILDING", reason: "LOW_STORE", usable: false };
  return { assessment: "BUILDING", reason: "NO_HISTORY", usable: false };
}

function commonResult(input: PriceQualityGateInput, assessment: BenchmarkAssessmentResult) {
  return {
    benchmarkDate: input.benchmark?.benchmarkDate ?? null,
    benchmarkPricePerPiece: input.benchmark?.medianPricePerPiece ?? null,
    benchmarkDeviationPct: null,
    benchmarkSampleCount: input.benchmark?.sampleCount ?? null,
    benchmarkStoreCount: input.benchmark?.storeCount ?? null,
    benchmarkAssessment: assessment.assessment,
    benchmarkAssessmentReason: assessment.reason,
    version: PRICE_QUALITY_GATE_VERSION,
  };
}

export function evaluatePriceQualityGate(input: PriceQualityGateInput): PriceQualityGateResult {
  const reasonCodes: PriceQualityReasonCode[] = [];
  const assessment = assessBenchmark(input);

  // Only block if evidence review decision is not AUTO_APPROVE OR there are actual conflicts.
  // Price derivation warnings (DERIVED_FROM_PACKAGE) are acceptable when evidence is clear.
  if (
    input.evidenceReviewDecision !== "AUTO_APPROVE"
    || !isPositiveFinite(input.candidatePricePerPiece)
    || input.hasConflicts  // Only conflicts block, not all warnings
    || !input.hasSourceImage
    || !input.hasValidPackageFacts
  ) {
    addReason(reasonCodes, "EVIDENCE_REVIEW_REQUIRED");
  }
  if (
    input.matchedEntityType === "unmatched"
    || !input.matchedEntityId
    || !isPositiveFinite(input.matchScore)
    || input.matchScore < 0.9
  ) {
    addReason(reasonCodes, "SKU_MATCH_UNCERTAIN");
  }

  if (!assessment.usable) {
    const passed = reasonCodes.length === 0;
    return {
      status: passed ? "PASSED" : "REVIEW_REQUIRED",
      reviewDecision: passed ? "AUTO_APPROVE" : "NEED_REVIEW",
      reasonCodes,
      ...commonResult(input, assessment),
    };
  }

  const benchmark = input.benchmark!;
  const candidatePrice = input.candidatePricePerPiece;
  const benchmarkPrice = benchmark.medianPricePerPiece;
  let benchmarkDeviationPct: number | null = null;

  if (isPositiveFinite(candidatePrice)) {
    benchmarkDeviationPct = roundedDeviationPct(candidatePrice, benchmarkPrice);
    const absoluteDeviation = Math.abs(rawDeviationPct(candidatePrice, benchmarkPrice));

    if (isApproximateScaleError(candidatePrice, benchmarkPrice)) {
      addReason(reasonCodes, "AMOUNT_SCALE_SUSPECTED");
    }
    if (absoluteDeviation > CRITICAL_DEVIATION_PCT) {
      addReason(reasonCodes, "PRICE_DEVIATION_CRITICAL");
    } else if (absoluteDeviation > HIGH_DEVIATION_PCT) {
      addReason(reasonCodes, "PRICE_DEVIATION_HIGH");
    }
  }

  const passed = reasonCodes.length === 0;
  return {
    status: passed ? "PASSED" : "REVIEW_REQUIRED",
    reviewDecision: passed ? "AUTO_APPROVE" : "NEED_REVIEW",
    reasonCodes,
    benchmarkDate: benchmark.benchmarkDate,
    benchmarkPricePerPiece: benchmarkPrice,
    benchmarkDeviationPct,
    benchmarkSampleCount: benchmark.sampleCount,
    benchmarkStoreCount: benchmark.storeCount,
    benchmarkAssessment: assessment.assessment,
    benchmarkAssessmentReason: assessment.reason,
    version: PRICE_QUALITY_GATE_VERSION,
  };
}
