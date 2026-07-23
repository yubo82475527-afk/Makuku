import type { AiPriceCandidate } from "@/lib/types";

/** Keep in sync with MAX_QUALITY_GATE_ATTEMPTS in operator-price-review.ts */
const QUALITY_GATE_FAILED_ATTEMPTS = 3;

export const OPERATOR_PRICE_REVIEW_REASON_FILTERS = [
  { value: "SKU_MATCH_UNCERTAIN", zh: "无法确认是哪款商品", en: "Which product is unclear" },
  { value: "DUPLICATE_MASTER_SKU", zh: "同规格有多个 SKU", en: "Multiple SKUs for same spec" },
  { value: "PRODUCT_PRICE_BINDING_UNCLEAR", zh: "商品和价格对不上", en: "Product and price don't match" },
  { value: "PRICE_TAG_UNCLEAR", zh: "价格看不清", en: "Price hard to read" },
  { value: "PIECE_COUNT_UNCLEAR", zh: "片数看不清", en: "Piece count hard to read" },
  { value: "PRICE_MATH_CONFLICT", zh: "包价/片数/片单价不一致", en: "Pack price, pcs, and unit price conflict" },
  { value: "PRICE_DERIVED", zh: "单片价为换算，需确认", en: "Unit price is calculated - confirm" },
  { value: "LEGACY_EVIDENCE_UNAVAILABLE", zh: "缺少原始识别依据", en: "Original evidence missing" },
  { value: "OTHER_EVIDENCE_REVIEW_REQUIRED", zh: "图片证据需确认", en: "Image evidence needs review" },
  { value: "AMOUNT_SCALE_SUSPECTED", zh: "金额位数可能多了", en: "Amount may have extra digits" },
  { value: "PRICE_DEVIATION_CRITICAL", zh: "价格偏差超过 50%", en: "Price off by over 50%" },
  { value: "PRICE_DEVIATION_HIGH", zh: "价格偏差 30%–50%", en: "Price off by 30%–50%" },
  { value: "PROMOTION_EVIDENCE", zh: "促销价需确认", en: "Promo price needs review" },
  { value: "INSUFFICIENT_BENCHMARK", zh: "历史价格不足", en: "Not enough price history" },
  { value: "QUALITY_CHECK_FAILED", zh: "系统校验失败", en: "System check failed" },
  { value: "OTHER_REVIEW_REQUIRED", zh: "其他原因", en: "Other reason" },
] as const;

export type OperatorPriceReviewReasonFilter = typeof OPERATOR_PRICE_REVIEW_REASON_FILTERS[number]["value"];

const validReasonFilters = new Set<string>(OPERATOR_PRICE_REVIEW_REASON_FILTERS.map((item) => item.value));

const labelByValue = new Map(
  OPERATOR_PRICE_REVIEW_REASON_FILTERS.map((item) => [item.value, item] as const),
);

export function normalizeOperatorPriceReviewReason(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return validReasonFilters.has(normalized) ? normalized as OperatorPriceReviewReasonFilter : undefined;
}

export function operatorPriceReviewReasonLabel(
  key: OperatorPriceReviewReasonFilter,
  locale = "zh",
) {
  const item = labelByValue.get(key);
  if (!item) return key;
  return locale === "zh" ? item.zh : item.en;
}

export function formatOperatorPriceReviewReasonLabels(
  keys: readonly OperatorPriceReviewReasonFilter[],
  locale = "zh",
) {
  return keys.map((key) => operatorPriceReviewReasonLabel(key, locale));
}

type ReasonResolveCandidate = Pick<AiPriceCandidate,
  | "quality_gate_reason_codes"
  | "quality_gate_status"
  | "quality_gate_attempt_count"
  | "price_evidence_reason_code"
  | "price_evidence_status"
  | "ai_match_method"
  | "matched_entity_type"
  | "matched_entity_id"
>;

/**
 * Resolve filter keys hit by a candidate using the same semantics as the
 * operator review reason query filters (display and filter share one catalog).
 */
export function resolveOperatorPriceReviewReasonKeys(
  candidate: ReasonResolveCandidate,
): OperatorPriceReviewReasonFilter[] {
  const reasonCodes = new Set(candidate.quality_gate_reason_codes ?? []);
  const evidenceReason = candidate.price_evidence_reason_code;
  const duplicateMasterSku = candidate.ai_match_method === "MASTER_DATA_DUPLICATE";
  const keys: OperatorPriceReviewReasonFilter[] = [];

  const add = (key: OperatorPriceReviewReasonFilter) => {
    if (!keys.includes(key)) keys.push(key);
  };

  if (
    !duplicateMasterSku
    && (
      reasonCodes.has("SKU_MATCH_UNCERTAIN")
      || candidate.matched_entity_type === "unmatched"
      || !candidate.matched_entity_id
    )
  ) {
    add("SKU_MATCH_UNCERTAIN");
  }

  if (duplicateMasterSku) add("DUPLICATE_MASTER_SKU");

  if (evidenceReason === "PRODUCT_PRICE_BINDING_UNCLEAR") add("PRODUCT_PRICE_BINDING_UNCLEAR");
  if (evidenceReason === "PRICE_TAG_UNCLEAR") add("PRICE_TAG_UNCLEAR");
  if (evidenceReason === "PIECE_COUNT_UNCLEAR") add("PIECE_COUNT_UNCLEAR");
  if (evidenceReason === "PRICE_MATH_CONFLICT" || candidate.price_evidence_status === "CONFLICT") {
    add("PRICE_MATH_CONFLICT");
  }
  if (evidenceReason === "PRICE_DERIVED") add("PRICE_DERIVED");
  if (evidenceReason === "LEGACY_EVIDENCE_UNAVAILABLE") add("LEGACY_EVIDENCE_UNAVAILABLE");

  if (
    !evidenceReason
    && (
      reasonCodes.has("EVIDENCE_REVIEW_REQUIRED")
      || candidate.price_evidence_status === "LOW_CONFIDENCE"
      || candidate.price_evidence_status === "REVIEW_REQUIRED"
    )
  ) {
    add("OTHER_EVIDENCE_REVIEW_REQUIRED");
  }

  if (reasonCodes.has("AMOUNT_SCALE_SUSPECTED")) add("AMOUNT_SCALE_SUSPECTED");
  if (reasonCodes.has("PRICE_DEVIATION_CRITICAL")) add("PRICE_DEVIATION_CRITICAL");
  if (reasonCodes.has("PRICE_DEVIATION_HIGH")) add("PRICE_DEVIATION_HIGH");
  if (reasonCodes.has("PROMOTION_EVIDENCE")) add("PROMOTION_EVIDENCE");

  if (
    reasonCodes.has("INSUFFICIENT_BENCHMARK")
    || candidate.quality_gate_status === "INSUFFICIENT_BENCHMARK"
  ) {
    add("INSUFFICIENT_BENCHMARK");
  }

  if (
    candidate.quality_gate_status === "FAILED"
    && Number(candidate.quality_gate_attempt_count ?? 0) >= QUALITY_GATE_FAILED_ATTEMPTS
  ) {
    add("QUALITY_CHECK_FAILED");
  }

  if (keys.length === 0 && isOtherReviewRequired(candidate, reasonCodes)) {
    add("OTHER_REVIEW_REQUIRED");
  }

  return keys;
}

export function buildOperatorPriceReviewReasonLabels(
  candidate: ReasonResolveCandidate,
  locale = "zh",
) {
  return formatOperatorPriceReviewReasonLabels(
    resolveOperatorPriceReviewReasonKeys(candidate),
    locale,
  );
}

function isOtherReviewRequired(
  candidate: ReasonResolveCandidate,
  reasonCodes: Set<string>,
) {
  if (candidate.quality_gate_status !== "REVIEW_REQUIRED") return false;
  if (reasonCodes.size > 0) return false;
  if (candidate.price_evidence_reason_code) return false;
  if (candidate.matched_entity_type === "unmatched" || !candidate.matched_entity_id) return false;
  const status = candidate.price_evidence_status;
  return status == null || status === "CLEAR" || status === "DERIVED";
}
