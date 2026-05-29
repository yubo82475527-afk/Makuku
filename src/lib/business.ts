import type {
  AiStrategyRecommendation,
  CompetitorProduct,
  OfflineOcrResult,
  PriceSnapshot,
  PromoEvent,
  RecommendedAction,
  Severity,
  SkuMaster,
} from "@/lib/types";
import { createJsonChatCompletion, hasAiConfig } from "@/lib/ai-client";

export type NormalizePriceSnapshotInput = {
  promo_price_idr: number;
  voucher_value_idr?: number;
  shipping_subsidy_idr?: number;
  piece_count: number;
};

export function normalizePriceSnapshot(input: NormalizePriceSnapshotInput) {
  const voucher = input.voucher_value_idr ?? 0;
  const shipping = input.shipping_subsidy_idr ?? 0;
  const net_price_idr = Math.max(input.promo_price_idr - voucher - shipping, 0);
  const price_per_piece =
    input.piece_count > 0 ? Number((net_price_idr / input.piece_count).toFixed(2)) : 0;

  return { net_price_idr, price_per_piece };
}

export function calculatePriceGapVsMakuku(
  price_per_piece: number,
  target_price_per_piece: number,
) {
  if (!target_price_per_piece) return 0;
  return Number((((price_per_piece - target_price_per_piece) / target_price_per_piece) * 100).toFixed(2));
}

export function severityFromGap(
  pricePerPiece: number,
  targetPricePerPiece?: number | null,
  floorPricePerPiece?: number | null,
  fallback: Severity = "low",
): Severity {
  if (floorPricePerPiece && pricePerPiece < floorPricePerPiece) return "critical";
  if (targetPricePerPiece && pricePerPiece < targetPricePerPiece * 0.92) return "high";
  return fallback;
}

export function detectPromoEvent(input: {
  priceSnapshot: PriceSnapshot;
  previousSnapshot?: PriceSnapshot | null;
  competitorProduct: CompetitorProduct;
  skuMaster?: SkuMaster | null;
}): Omit<PromoEvent, "id" | "created_at"> | null {
  const { priceSnapshot, previousSnapshot, competitorProduct, skuMaster } = input;
  const promoType = priceSnapshot.promo_type?.toLowerCase() ?? "";
  const oldPrice = previousSnapshot?.price_per_piece ?? null;
  const newPrice = priceSnapshot.price_per_piece;

  const isPriceDrop =
    oldPrice !== null && oldPrice > 0 && (oldPrice - newPrice) / oldPrice >= 0.08;
  const isFlashSale = promoType.includes("flash_sale") || promoType.includes("flash sale");

  if (!isPriceDrop && !isFlashSale) return null;

  const eventType = isFlashSale ? "flash_sale" : "price_drop";
  const gap = skuMaster
    ? calculatePriceGapVsMakuku(newPrice, skuMaster.target_price_per_piece)
    : null;

  let severity: Severity = isPriceDrop ? "medium" : "high";
  severity = severityFromGap(
    newPrice,
    skuMaster?.target_price_per_piece,
    skuMaster?.floor_price_per_piece,
    severity,
  );

  const brandName = competitorProduct.brands?.name ?? "Competitor";
  const title =
    eventType === "flash_sale"
      ? `${brandName} ${competitorProduct.size ?? ""} flash sale detected`
      : `${brandName} ${competitorProduct.size ?? ""} price drop detected`;

  return {
    competitor_product_id: competitorProduct.id,
    sku_master_id: skuMaster?.id ?? null,
    channel: priceSnapshot.channel,
    event_type: eventType,
    event_title: title.trim(),
    event_summary: `${competitorProduct.normalized_name} moved to IDR ${Math.round(newPrice)}/pc${oldPrice ? ` from IDR ${Math.round(oldPrice)}/pc` : ""}.`,
    old_price_per_piece: oldPrice,
    new_price_per_piece: newPrice,
    price_gap_vs_makuku_pct: gap,
    severity,
    city: null,
    started_at: priceSnapshot.captured_at,
    ended_at: null,
    evidence_url: priceSnapshot.evidence_url,
  };
}

export function buildAIStrategyPrompt(input: {
  promoEvent: PromoEvent;
  competitorProduct?: CompetitorProduct | null;
  skuMaster?: SkuMaster | null;
}) {
  const { promoEvent, competitorProduct, skuMaster } = input;
  return [
    "You are a commercial strategy assistant for Makuku Indonesia.",
    "Return JSON only.",
    `Competitor brand: ${competitorProduct?.brands?.name ?? "unknown"}`,
    `Competitor SKU: ${competitorProduct?.normalized_name ?? "unknown"}`,
    `Channel: ${promoEvent.channel}`,
    `Promo type: ${promoEvent.event_type}`,
    `Old price per piece: ${promoEvent.old_price_per_piece ?? "unknown"}`,
    `New price per piece: ${promoEvent.new_price_per_piece ?? "unknown"}`,
    `Makuku target price per piece: ${skuMaster?.target_price_per_piece ?? "unknown"}`,
    `Makuku floor price per piece: ${skuMaster?.floor_price_per_piece ?? "unknown"}`,
    `Price gap vs Makuku target pct: ${promoEvent.price_gap_vs_makuku_pct ?? "unknown"}`,
    `City: ${promoEvent.city ?? "not applicable"}`,
    `Evidence: ${promoEvent.evidence_url ?? "none"}`,
    "Required JSON shape: { risk_level, impact_summary, recommended_actions, suggested_price_per_piece, margin_impact_summary, confidence_score }.",
  ].join("\n");
}

function mockRecommendedActions(severity: Severity): RecommendedAction[] {
  return [
    {
      channel: "Shopee",
      action: severity === "critical" ? "设置48小时限时券" : "加大搜索位和轻量券防守",
      reason: "用短周期动作缩小对标 SKU 的感知价差，避免永久调低标价。",
      priority: severity === "critical" || severity === "high" ? "high" : "medium",
    },
    {
      channel: "TikTok",
      action: "安排直播间bundle",
      reason: "TikTok Shop 是下一阶段渠道，先用 bundle 方案作为跨平台防守预案。",
      priority: "medium",
    },
    {
      channel: "Offline",
      action: "重点门店补充陈列物料",
      reason: "线下团队需要同步检查重点城市货架和竞品陈列变化。",
      priority: "medium",
    },
  ];
}

export async function generateAIStrategy(input: {
  promoEvent: PromoEvent;
  competitorProduct?: CompetitorProduct | null;
  skuMaster?: SkuMaster | null;
}): Promise<Omit<AiStrategyRecommendation, "id" | "created_at">> {
  const { promoEvent, skuMaster } = input;
  const riskLevel = promoEvent.severity;
  const suggested = Math.max(
    Math.round((promoEvent.new_price_per_piece ?? skuMaster?.target_price_per_piece ?? 2200) * 1.02),
    Math.round(skuMaster?.floor_price_per_piece ?? 0),
  );

  if (hasAiConfig()) {
    try {
      const completion = await createJsonChatCompletion({
        messages: [
          {
            role: "system",
            content: "You are a commercial strategy assistant. Return valid JSON only.",
          },
          {
            role: "user",
            content: buildAIStrategyPrompt(input),
          },
        ],
      });

      const result = completion.parsed as Partial<Omit<AiStrategyRecommendation, "id" | "created_at">>;
      return {
        promo_event_id: promoEvent.id,
        risk_level: result.risk_level ?? riskLevel,
        impact_summary: result.impact_summary ?? "",
        recommended_actions: result.recommended_actions ?? mockRecommendedActions(riskLevel),
        suggested_price_per_piece: result.suggested_price_per_piece ?? suggested,
        margin_impact_summary: result.margin_impact_summary ?? "",
        confidence_score: result.confidence_score ?? 0.7,
        status: "draft",
        reviewer_note: null,
      };
    } catch {
      // Fall through to deterministic mock output.
    }
  }

  return {
    promo_event_id: promoEvent.id,
    risk_level: riskLevel,
    impact_summary:
      riskLevel === "critical"
        ? "竞品价格已低于 Makuku floor price，核心对标 SKU 有明显转化流失风险。"
        : "竞品促销正在压低同尺码价格带，需要用短周期渠道动作防守。",
    recommended_actions: mockRecommendedActions(riskLevel),
    suggested_price_per_piece: suggested,
    margin_impact_summary: "建议以限时券或 bundle 方式控制毛利影响，避免直接长期改价。",
    confidence_score: riskLevel === "critical" ? 0.78 : 0.7,
    status: "draft",
    reviewer_note: null,
  };
}

export function mockOcrFromUpload(input: {
  uploadId: string;
  fileName?: string | null;
  city?: string | null;
  storeName?: string | null;
}): Omit<OfflineOcrResult, "id" | "created_at"> {
  const text = `${input.fileName ?? ""} ${input.storeName ?? ""}`.toLowerCase();
  const brand = text.includes("sweety")
    ? "Sweety"
    : text.includes("pampers")
      ? "Pampers"
      : text.includes("mamypoko")
        ? "MamyPoko"
        : text.includes("goon") || text.includes("goo")
          ? "Goo.N"
          : "Merries";
  const size = text.includes("xl") ? "XL" : text.includes("m") ? "M" : "L";
  const pieceCount = size === "XL" ? 28 : size === "M" ? 32 : 30;
  const price = pieceCount * (brand === "Merries" ? 2320 : brand === "Pampers" ? 2260 : 2150);

  return {
    upload_id: input.uploadId,
    detected_brand: brand,
    detected_product: `${brand} Pants ${size}${pieceCount}`,
    detected_price_idr: price,
    detected_promo_text: input.city ? `${input.city} shelf promo` : "Mock shelf promo",
    detected_piece_count: pieceCount,
    confidence_score: 0.81,
    reviewed: false,
    corrected_brand: null,
    corrected_product: null,
    corrected_price_idr: null,
    corrected_piece_count: null,
  };
}

export function shouldCreateAlertFromPromoEvent(event: PromoEvent) {
  return (
    event.severity === "critical" ||
    event.severity === "high" ||
    (event.price_gap_vs_makuku_pct ?? 0) <= -8 ||
    event.channel === "offline"
  );
}
