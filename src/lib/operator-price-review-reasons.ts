export const OPERATOR_PRICE_REVIEW_REASON_FILTERS = [
  { value: "SKU_MATCH_UNCERTAIN", zh: "商品归属不明确", en: "Product association unclear" },
  { value: "DUPLICATE_MASTER_SKU", zh: "主数据 SKU 重复", en: "Duplicate master SKU" },
  { value: "PRODUCT_PRICE_BINDING_UNCLEAR", zh: "商品与价格对应不明确", en: "Product-price binding unclear" },
  { value: "PRICE_TAG_UNCLEAR", zh: "价格牌或金额不清晰", en: "Price label or amount unclear" },
  { value: "PIECE_COUNT_UNCLEAR", zh: "包装片数不清晰", en: "Package piece count unclear" },
  { value: "PRICE_MATH_CONFLICT", zh: "包装价格数学冲突", en: "Package price math conflict" },
  { value: "PRICE_DERIVED", zh: "换算单片价需要确认", en: "Derived unit price needs confirmation" },
  { value: "LEGACY_EVIDENCE_UNAVAILABLE", zh: "历史识别依据缺失", en: "Legacy recognition evidence unavailable" },
  { value: "OTHER_EVIDENCE_REVIEW_REQUIRED", zh: "其他图片证据不明确", en: "Other image evidence unclear" },
  { value: "AMOUNT_SCALE_SUSPECTED", zh: "疑似金额位数错误", en: "Possible amount digit error" },
  { value: "PRICE_DEVIATION_CRITICAL", zh: "价格偏差超过 50%", en: "Price deviation over 50%" },
  { value: "PRICE_DEVIATION_HIGH", zh: "价格偏差超过 30% 且不超过 50%", en: "Price deviation over 30% and up to 50%" },
  { value: "PROMOTION_EVIDENCE", zh: "促销价格需要确认", en: "Promotion price needs confirmation" },
  { value: "INSUFFICIENT_BENCHMARK", zh: "历史基准不足", en: "Insufficient price benchmark" },
  { value: "QUALITY_CHECK_FAILED", zh: "系统校验失败", en: "Quality check failed" },
  { value: "OTHER_REVIEW_REQUIRED", zh: "其他原因", en: "Other reason" },
] as const;

export type OperatorPriceReviewReasonFilter = typeof OPERATOR_PRICE_REVIEW_REASON_FILTERS[number]["value"];

const validReasonFilters = new Set<string>(OPERATOR_PRICE_REVIEW_REASON_FILTERS.map((item) => item.value));

export function normalizeOperatorPriceReviewReason(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return validReasonFilters.has(normalized) ? normalized as OperatorPriceReviewReasonFilter : undefined;
}
