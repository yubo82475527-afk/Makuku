import type {
  AiPriceCandidate,
  OperatorPriceReviewReasonGroup,
  PriceEvidenceReasonCode,
  PriceQualityReasonCode,
} from "@/lib/types";

type ReasonGroupCandidate = Pick<AiPriceCandidate,
  | "quality_gate_reason_codes"
  | "benchmark_price_per_piece"
  | "benchmark_deviation_pct"
  | "reviewed_price_per_piece"
  | "price_per_piece"
  | "ai_price_per_piece"
  | "price_evidence_reason_code"
  | "price_evidence_status"
  | "matched_entity_type"
  | "matched_entity_id"
  | "match_score"
  | "conflicts"
  | "quality_gate_status"
>;

const PRICE_REASON_CODES: PriceQualityReasonCode[] = [
  "AMOUNT_SCALE_SUSPECTED",
  "PRICE_DEVIATION_CRITICAL",
  "PRICE_DEVIATION_HIGH",
];

const EVIDENCE_MESSAGES: Record<PriceEvidenceReasonCode, { zh: string; en: string }> = {
  PRODUCT_PRICE_BINDING_UNCLEAR: {
    zh: "商品与价格的对应关系不明确，需要人工确认。",
    en: "The product-to-price binding is unclear and needs confirmation.",
  },
  PRICE_TAG_UNCLEAR: {
    zh: "价格牌或金额不清晰，需要人工确认。",
    en: "The price label or amount is unclear and needs confirmation.",
  },
  PIECE_COUNT_UNCLEAR: {
    zh: "图片中的包装片数不清晰，无法确认单片价。",
    en: "The package piece count is unclear, so the per-piece price cannot be confirmed.",
  },
  PRICE_MATH_CONFLICT: {
    zh: "图片中的包装价、片数和单片价无法相互验证。",
    en: "The package price, piece count, and per-piece price do not reconcile.",
  },
  PRICE_DERIVED: {
    zh: "单片价由包装价和片数换算，需要确认包装价和片数。",
    en: "The per-piece price was derived from the package price and piece count, which need confirmation.",
  },
  LEGACY_EVIDENCE_UNAVAILABLE: {
    zh: "历史记录缺少原始识别依据，无法自动判断。",
    en: "The historical record lacks the original recognition evidence for an automatic decision.",
  },
};

export function buildOperatorPriceReviewReasonGroups(
  candidate: ReasonGroupCandidate,
  locale = "zh",
): OperatorPriceReviewReasonGroup[] {
  const isZh = locale === "zh";
  const reasonCodes = new Set(candidate.quality_gate_reason_codes ?? []);
  const groups: OperatorPriceReviewReasonGroup[] = [];
  const priceMessages = buildPriceMessages(candidate, reasonCodes, isZh);
  if (priceMessages.length > 0) {
    groups.push({
      kind: "PRICE",
      title: isZh ? "价格问题" : "Price issue",
      messages: priceMessages,
    });
  }

  const confirmationMessages = buildConfirmationMessages(candidate, reasonCodes, isZh);
  if (confirmationMessages.length > 0) {
    groups.push({
      kind: "CONFIRMATION",
      title: isZh ? "需要确认" : "Needs confirmation",
      messages: confirmationMessages,
    });
  }
  return groups;
}

function buildPriceMessages(
  candidate: ReasonGroupCandidate,
  reasonCodes: Set<PriceQualityReasonCode>,
  isZh: boolean,
) {
  if (!PRICE_REASON_CODES.some((reason) => reasonCodes.has(reason))) return [];

  const benchmark = positiveNumber(candidate.benchmark_price_per_piece);
  const current = positiveNumber(candidate.reviewed_price_per_piece)
    ?? positiveNumber(candidate.price_per_piece)
    ?? positiveNumber(candidate.ai_price_per_piece);
  const deviation = signedRoundedPercent(candidate.benchmark_deviation_pct);
  const messages: string[] = [];

  if (benchmark && current && deviation !== null) {
    messages.push(isZh
      ? `基准 ${formatRupiah(benchmark)}/片 · AI 识别 ${formatRupiah(current)}/片 · 偏差 ${formatSignedPercent(deviation)}。`
      : `Baseline ${formatRupiah(benchmark)}/piece · AI read ${formatRupiah(current)}/piece · ${formatSignedPercent(deviation)} deviation.`);
  } else {
    messages.push(isZh
      ? "按当前 AI 识别结果，本次价格与历史常见价格差异明显。"
      : "Based on the current AI reading, this price differs materially from the historical common price.");
  }

  if (reasonCodes.has("AMOUNT_SCALE_SUSPECTED")) {
    messages.push(isZh
      ? "金额接近历史常见价格的 10、100 或 1000 倍，可能多识别了一个或多个 0。"
      : "The amount is close to 10, 100, or 1,000 times the common price and may include extra zeroes.");
  }
  return messages;
}

function buildConfirmationMessages(
  candidate: ReasonGroupCandidate,
  reasonCodes: Set<PriceQualityReasonCode>,
  isZh: boolean,
) {
  const messages: string[] = [];
  const add = (message: string) => {
    if (!messages.includes(message)) messages.push(message);
  };
  const evidenceReason = candidate.price_evidence_reason_code;

  if (reasonCodes.has("SKU_MATCH_UNCERTAIN") || candidate.matched_entity_type === "unmatched" || !candidate.matched_entity_id || Number(candidate.match_score ?? 0) < 0.9) {
    add(isZh ? "AI 无法确认这个价格属于哪款商品。" : "AI could not confirm which product this price belongs to.");
  }
  if (evidenceReason) {
    add(isZh ? EVIDENCE_MESSAGES[evidenceReason].zh : EVIDENCE_MESSAGES[evidenceReason].en);
  } else if (hasPackageMathConflict(candidate)) {
    add(isZh ? EVIDENCE_MESSAGES.PRICE_MATH_CONFLICT.zh : EVIDENCE_MESSAGES.PRICE_MATH_CONFLICT.en);
  } else if (reasonCodes.has("EVIDENCE_REVIEW_REQUIRED") || candidate.price_evidence_status === "LOW_CONFIDENCE" || candidate.price_evidence_status === "REVIEW_REQUIRED") {
    add(isZh
      ? "本次识别已有图片依据，但商品、价格或包装信息仍存在不确定之处，需要人工确认。"
      : "Current recognition evidence exists, but the product, price, or package facts still need confirmation.");
  }
  if (reasonCodes.has("PROMOTION_EVIDENCE")) {
    add(isZh
      ? "图片显示为促销价，但需要确认该促销是否属于这款商品。"
      : "The image shows a promotion, but the promotion-to-product match needs confirmation.");
  }
  if (reasonCodes.has("INSUFFICIENT_BENCHMARK") || candidate.quality_gate_status === "INSUFFICIENT_BENCHMARK") {
    add(isZh
      ? "目前没有足够的历史价格，系统无法自动判断。"
      : "There is not enough price history for an automatic decision.");
  }
  if (candidate.quality_gate_status === "FAILED") {
    add(isZh
      ? "系统多次校验仍未得到可靠结果，需要人工确认。"
      : "Repeated checks did not produce a reliable result, so manual confirmation is required.");
  }
  if (messages.length === 0) {
    add(isZh ? "这个价格需要人工确认。" : "This price needs manual confirmation.");
  }
  return messages;
}

function hasPackageMathConflict(candidate: ReasonGroupCandidate) {
  return (candidate.conflicts ?? []).some((conflict) =>
    String(conflict.type ?? conflict.message).toUpperCase().includes("PACKAGE_PIECE"),
  ) || candidate.price_evidence_status === "CONFLICT";
}

function positiveNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function signedRoundedPercent(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function formatSignedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value}%`;
}

function formatRupiah(value: number) {
  return `Rp ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value))}`;
}
