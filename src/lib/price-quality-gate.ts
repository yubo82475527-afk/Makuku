import type {
  AiPriceCandidateMatchType,
  AiPriceQualityGateStatus,
  PriceQualityReasonCode,
  PriceReviewDecision,
} from "@/lib/types";

export const PRICE_QUALITY_GATE_VERSION = "price-quality-gate-v1";
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
  promoType: string | null;
  benchmark: QualityBenchmarkInput | null;
};

export type PriceQualityGateResult = {
  status: Extract<
    AiPriceQualityGateStatus,
    "PASSED" | "REVIEW_REQUIRED" | "INSUFFICIENT_BENCHMARK"
  >;
  reviewDecision: PriceReviewDecision;
  reasonCodes: PriceQualityReasonCode[];
  benchmarkDate: string | null;
  benchmarkPricePerPiece: number | null;
  benchmarkDeviationPct: number | null;
  benchmarkSampleCount: number | null;
  benchmarkStoreCount: number | null;
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
  return Math.round(((candidatePrice - benchmarkPrice) / benchmarkPrice) * 100 * 10000) / 10000;
}

export function evaluatePriceQualityGate(input: PriceQualityGateInput): PriceQualityGateResult {
  const reasonCodes: PriceQualityReasonCode[] = [];

  if (input.evidenceReviewDecision !== "AUTO_APPROVE" || !isPositiveFinite(input.candidatePricePerPiece)) {
    addReason(reasonCodes, "EVIDENCE_REVIEW_REQUIRED");
  }
  if (input.matchedEntityType === "unmatched" || !input.matchedEntityId) {
    addReason(reasonCodes, "SKU_MATCH_UNCERTAIN");
  }

  const benchmark = input.benchmark;
  const benchmarkUsable = Boolean(
    benchmark
    && benchmark.status === "READY"
    && isPositiveFinite(benchmark.medianPricePerPiece)
    && benchmark.sampleCount >= MIN_BENCHMARK_SAMPLES
    && benchmark.storeCount >= MIN_BENCHMARK_STORES,
  );

  if (!benchmarkUsable || !benchmark) {
    addReason(reasonCodes, "INSUFFICIENT_BENCHMARK");
    return {
      status: "INSUFFICIENT_BENCHMARK",
      reviewDecision: "NEED_REVIEW",
      reasonCodes,
      benchmarkDate: benchmark?.benchmarkDate ?? null,
      benchmarkPricePerPiece: benchmark?.medianPricePerPiece ?? null,
      benchmarkDeviationPct: null,
      benchmarkSampleCount: benchmark?.sampleCount ?? null,
      benchmarkStoreCount: benchmark?.storeCount ?? null,
      version: PRICE_QUALITY_GATE_VERSION,
    };
  }

  const candidatePrice = input.candidatePricePerPiece;
  const benchmarkPrice = benchmark.medianPricePerPiece;
  let benchmarkDeviationPct: number | null = null;

  if (isPositiveFinite(candidatePrice)) {
    benchmarkDeviationPct = roundedDeviationPct(candidatePrice, benchmarkPrice);
    const absoluteDeviation = Math.abs(benchmarkDeviationPct);

    if (isApproximateScaleError(candidatePrice, benchmarkPrice)) {
      addReason(reasonCodes, "AMOUNT_SCALE_SUSPECTED");
    }
    if (absoluteDeviation > CRITICAL_DEVIATION_PCT) {
      addReason(reasonCodes, "PRICE_DEVIATION_CRITICAL");
    } else if (absoluteDeviation > HIGH_DEVIATION_PCT) {
      addReason(reasonCodes, "PRICE_DEVIATION_HIGH");
    }
    if (absoluteDeviation > HIGH_DEVIATION_PCT && String(input.promoType ?? "").trim()) {
      addReason(reasonCodes, "PROMOTION_EVIDENCE");
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
    version: PRICE_QUALITY_GATE_VERSION,
  };
}
