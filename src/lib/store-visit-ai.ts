import type {
  CategoryCoverage,
  PriceInsightTag,
  PromoPressureLevel,
  PromotionType,
  PromotionVisibility,
  RawExtractionType,
  ShelfCondition,
  StockRiskLevel,
  StockRiskSignal,
  StoreVisitAiResult,
  StoreVisitAiConfig,
  ValidationWarningType,
} from "@/lib/types";
import { createJsonChatCompletion, imageUrlPart, textPart } from "@/lib/ai-client";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";

const stockRiskLevels: StockRiskLevel[] = ["Normal", "Low Stock", "Out of Stock Risk"];
const promotionTypes: PromotionType[] = ["Discount", "Buy 1 Get 1", "Buy 2 Get 1", "Promo Tag", "Special Offer"];
const categoryCoverages: CategoryCoverage[] = ["FULL", "PARTIAL", "FRAGMENTED"];
const shelfConditions: ShelfCondition[] = ["WELL_ORGANISED", "NORMAL", "MESSY"];
const priceInsightTags: PriceInsightTag[] = ["HERO", "PROMO", "ANOMALY"];
const stockRiskSignals: StockRiskSignal[] = ["EMPTY_FACING", "LOW_FACING", "BLOCKED_SHELF"];
const promotionVisibilities: PromotionVisibility[] = ["LOW", "MEDIUM", "HIGH"];
const promoPressureLevels: PromoPressureLevel[] = ["LOW", "MEDIUM", "HIGH"];
const rawExtractionTypes: RawExtractionType[] = ["SKU", "PROMO", "SHELF_SIGNAL"];
const validationWarningTypes: ValidationWarningType[] = ["MISSING_DATA", "LOW_CONFIDENCE", "PARSE_RISK"];

export const STORE_VISIT_AI_PROMPT = [
  "You are a Retail Shelf Intelligence AI System with strict observability requirements.",
  "You analyze MULTIPLE store shelf images from a SINGLE store visit and produce raw structured extraction, normalized retail insights, and validation metadata.",
  "Never silently fail. Never replace missing data with fake defaults. Every output must be explainable through structured layers.",
  "Mandatory pipeline: Step 1 raw extraction of visible brands, SKUs, prices, promotions, and shelf condition signals without deduplication. Step 2 aggregate into brand-level insights, key SKU selection, promotion grouping, and stock signals. Step 3 validate missing brand, unclear price, low confidence, and JSON completeness risk. Step 4 produce normalized output.",
  "If information is unclear, keep it in raw_extraction with confidence 0 and add a validation warning. Do not use Unknown or Price unclear in the model output.",
  "For price_insights.key_sku_prices, include piece_count only when the package piece count is visible on pack text or shelf tag. If unclear, set piece_count to null. Do not guess piece count.",
  "Never calculate price_per_piece yourself. Return package price and piece_count only; the system calculates per-piece price.",
  "Treat all images as ONE store-level observation.",
  "Output limits: raw_extraction.detected_items max 20; price_insights.key_sku_prices max 5; promotion_insights.competitor_promotions max 3; price_insights.brand_price_range max 6; store_summary max 25 words and one sentence.",
  "Return ONLY valid compact JSON. No markdown. No explanations. No extra text.",
  "Use exactly this JSON structure and enum values:",
  '{"raw_extraction":{"detected_items":[{"brand":"string","product":"string","price":"string","type":"SKU|PROMO|SHELF_SIGNAL","confidence":0.8}]},"validation":{"is_valid":true,"warnings":[{"type":"MISSING_DATA|LOW_CONFIDENCE|PARSE_RISK","message":"string"}]},"shelf_understanding":{"brands_present":[{"brand":"string","shelf_share_estimate":0}],"category_coverage":"FULL|PARTIAL|FRAGMENTED","shelf_condition":"WELL_ORGANISED|NORMAL|MESSY","facings_estimate":[{"brand":"string","facing_count_estimate":0}]},"price_insights":{"brand_price_range":[{"brand":"string","min_price":"string","max_price":"string"}],"key_sku_prices":[{"brand":"string","product":"string","price":"string","piece_count":44,"tag":"HERO|PROMO|ANOMALY","confidence":0.8}]},"stock_risk":{"level":"Normal|Low Stock|Out of Stock Risk","affected_brands":[{"brand":"string","risk_signal":"EMPTY_FACING|LOW_FACING|BLOCKED_SHELF"}],"reason":"string"},"promotion_insights":{"competitor_promotions":[{"brand":"string","type":"Discount|Buy 1 Get 1|Buy 2 Get 1|Promo Tag|Special Offer","visibility":"LOW|MEDIUM|HIGH","description":"string"}],"promo_pressure_level":"LOW|MEDIUM|HIGH"},"store_summary":"string"}',
].join("\n");

export const DEFAULT_STORE_VISIT_AI_CONFIG: StoreVisitAiConfig = {
  version_name: "Default code config",
  system_prompt: STORE_VISIT_AI_PROMPT,
  temperature: 0,
  max_tokens: 2200,
  status: "active",
};

function normalizeAiConfig(value: Partial<StoreVisitAiConfig> | null | undefined): StoreVisitAiConfig {
  const temperature = Number(value?.temperature ?? DEFAULT_STORE_VISIT_AI_CONFIG.temperature);
  const maxTokens = Number(value?.max_tokens ?? DEFAULT_STORE_VISIT_AI_CONFIG.max_tokens);
  return {
    ...DEFAULT_STORE_VISIT_AI_CONFIG,
    ...value,
    version_name: asString(value?.version_name, DEFAULT_STORE_VISIT_AI_CONFIG.version_name),
    system_prompt: asString(value?.system_prompt, DEFAULT_STORE_VISIT_AI_CONFIG.system_prompt),
    temperature: Number.isFinite(temperature) ? Math.min(Math.max(temperature, 0), 2) : DEFAULT_STORE_VISIT_AI_CONFIG.temperature,
    max_tokens: Number.isFinite(maxTokens) ? Math.min(Math.max(Math.floor(maxTokens), 500), 6000) : DEFAULT_STORE_VISIT_AI_CONFIG.max_tokens,
  };
}

export async function getActiveStoreVisitAiConfig(): Promise<StoreVisitAiConfig> {
  if (!hasSupabaseServiceConfig()) return DEFAULT_STORE_VISIT_AI_CONFIG;

  try {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("store_visit_ai_configs")
      .select("*")
      .eq("status", "active")
      .order("activated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return DEFAULT_STORE_VISIT_AI_CONFIG;
    return normalizeAiConfig(data as StoreVisitAiConfig);
  } catch {
    return DEFAULT_STORE_VISIT_AI_CONFIG;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function oneSentenceMax30Words(value: unknown) {
  const raw = asString(value, "AI summary unavailable.");
  const firstSentence = raw.split(/[.!?]/)[0]?.trim() || raw.trim();
  const words = firstSentence.split(/\s+/).filter(Boolean).slice(0, 25);
  return `${words.join(" ")}.`;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asPositiveIntegerOrNull(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function asEnum<T extends string>(value: unknown, options: readonly T[], fallback: T) {
  return options.includes(value as T) ? value as T : fallback;
}

export function normalizeStoreVisitAiResult(value: unknown): StoreVisitAiResult {
  const result = asRecord(value);
  const rawExtraction = asRecord(result.raw_extraction);
  const validation = asRecord(result.validation);
  const shelfUnderstanding = asRecord(result.shelf_understanding);
  const priceInsights = asRecord(result.price_insights);
  const promotionInsights = asRecord(result.promotion_insights);
  const keySkuPrices = Array.isArray(priceInsights.key_sku_prices)
    ? priceInsights.key_sku_prices
    : Array.isArray(result.price_detection)
      ? result.price_detection
      : [];
  const legacyPromotions = Array.isArray(result.competitor_promotion) ? result.competitor_promotion : [];
  const competitorPromotions = Array.isArray(promotionInsights.competitor_promotions)
    ? promotionInsights.competitor_promotions
    : legacyPromotions;
  const stockRisk = asRecord(result.stock_risk);
  const stockLevel = asString(stockRisk.level, "Normal");
  const warnings = (Array.isArray(validation.warnings) ? validation.warnings : [])
    .slice(0, 10)
    .map((item) => {
      const warning = asRecord(item);
      return {
        type: asEnum(warning.type, validationWarningTypes, "MISSING_DATA"),
        message: asString(warning.message, "AI output contains missing or uncertain data."),
      };
    });
  const detectedItems = (Array.isArray(rawExtraction.detected_items) ? rawExtraction.detected_items : [])
    .slice(0, 20)
    .map((item) => {
      const detected = asRecord(item);
      const confidence = Math.min(Math.max(asNumber(detected.confidence, 0), 0), 1);
      if (confidence < 0.4) {
        warnings.push({
          type: "LOW_CONFIDENCE",
          message: `Low confidence raw extraction for ${asString(detected.brand, "missing brand")} ${asString(detected.product, "missing product")}.`,
        });
      }
      if (!asString(detected.brand, "") || !asString(detected.product, "")) {
        warnings.push({
          type: "MISSING_DATA",
          message: "Raw extraction item is missing brand or product.",
        });
      }
      return {
        brand: asString(detected.brand, ""),
        product: asString(detected.product, ""),
        price: asString(detected.price, ""),
        type: asEnum(detected.type, rawExtractionTypes, "SKU"),
        confidence,
      };
    });
  const normalizedKeySkuPrices = keySkuPrices.slice(0, 5).map((item) => {
    const price = asRecord(item);
    return {
      brand: asString(price.brand, "Unknown"),
      product: asString(price.product, "Unknown product"),
      price: asString(price.price, "Price unclear"),
      piece_count: asPositiveIntegerOrNull(price.piece_count),
      tag: asEnum(price.tag, priceInsightTags, "HERO"),
      confidence: Math.min(Math.max(asNumber(price.confidence, 0.7), 0), 1),
    };
  });
  const normalizedPromotions = competitorPromotions.slice(0, 3).map((item) => {
    const promotion = asRecord(item);
    const promotionType = asString(promotion.type ?? promotion.promotion_type, "Promo Tag");
    return {
      brand: asString(promotion.brand, "Unknown"),
      type: asEnum(promotionType, promotionTypes, "Promo Tag"),
      visibility: asEnum(promotion.visibility, promotionVisibilities, "MEDIUM"),
      description: asString(promotion.description, "No clear promotion detected"),
    };
  });

  return {
    raw_extraction: {
      detected_items: detectedItems,
    },
    validation: {
      is_valid: typeof validation.is_valid === "boolean"
        ? validation.is_valid
        : detectedItems.length > 0 && warnings.length === 0,
      warnings: detectedItems.length > 0
        ? warnings.slice(0, 10)
        : [
          ...warnings,
          { type: "MISSING_DATA" as const, message: "AI did not return raw extraction items." },
        ].slice(0, 10),
    },
    shelf_understanding: {
      brands_present: (Array.isArray(shelfUnderstanding.brands_present) ? shelfUnderstanding.brands_present : [])
        .slice(0, 6)
        .map((item) => {
          const brand = asRecord(item);
          return {
            brand: asString(brand.brand, "Unknown"),
            shelf_share_estimate: asNumber(brand.shelf_share_estimate, 0),
          };
        }),
      category_coverage: asEnum(shelfUnderstanding.category_coverage, categoryCoverages, "PARTIAL"),
      shelf_condition: asEnum(shelfUnderstanding.shelf_condition, shelfConditions, "NORMAL"),
      facings_estimate: (Array.isArray(shelfUnderstanding.facings_estimate) ? shelfUnderstanding.facings_estimate : [])
        .slice(0, 6)
        .map((item) => {
          const facing = asRecord(item);
          return {
            brand: asString(facing.brand, "Unknown"),
            facing_count_estimate: asNumber(facing.facing_count_estimate, 0),
          };
        }),
    },
    price_insights: {
      brand_price_range: (Array.isArray(priceInsights.brand_price_range) ? priceInsights.brand_price_range : [])
        .slice(0, 6)
        .map((item) => {
          const range = asRecord(item);
          return {
            brand: asString(range.brand, "Unknown"),
            min_price: asString(range.min_price, "Price unclear"),
            max_price: asString(range.max_price, "Price unclear"),
          };
        }),
      key_sku_prices: normalizedKeySkuPrices.length > 0
        ? normalizedKeySkuPrices
        : [{ brand: "Unknown", product: "Unknown product", price: "Price unclear", piece_count: null, tag: "HERO", confidence: 0 }],
    },
    price_detection: normalizedKeySkuPrices.length > 0
      ? normalizedKeySkuPrices.map((price) => {
        return {
          brand: price.brand,
          product: price.product,
          price: price.price,
        };
      })
      : [{ brand: "Unknown", product: "Unknown product", price: "Price unclear" }],
    stock_risk: {
      level: stockRiskLevels.includes(stockLevel as StockRiskLevel) ? stockLevel as StockRiskLevel : "Normal",
      affected_brands: (Array.isArray(stockRisk.affected_brands) ? stockRisk.affected_brands : [])
        .slice(0, 5)
        .map((item) => {
          const brand = asRecord(item);
          return {
            brand: asString(brand.brand, "Unknown"),
            risk_signal: asEnum(brand.risk_signal, stockRiskSignals, "LOW_FACING"),
          };
        }),
      reason: asString(stockRisk.reason, "No clear stock risk detected."),
    },
    promotion_insights: {
      competitor_promotions: normalizedPromotions,
      promo_pressure_level: asEnum(promotionInsights.promo_pressure_level, promoPressureLevels, "LOW"),
    },
    competitor_promotion: normalizedPromotions.length > 0
      ? normalizedPromotions.map((promotion) => {
        return {
          brand: promotion.brand,
          promotion_type: promotion.type,
          description: promotion.description,
        };
      })
      : [{ brand: "Unknown", promotion_type: "Promo Tag", description: "No clear promotion detected" }],
    store_summary: oneSentenceMax30Words(result.store_summary),
  };
}

export async function analyzeStoreVisitImages(input: {
  imageUrls: string[];
  imageCategories?: string[];
  storeName: string;
  region: string;
  channel: string;
  promoter: string;
  visitDate: string;
  config?: Partial<StoreVisitAiConfig>;
}) {
  if (input.imageUrls.length === 0) {
    throw new Error("At least one image is required for analysis");
  }

  const config = input.config ? normalizeAiConfig(input.config) : await getActiveStoreVisitAiConfig();
  const completion = await createJsonChatCompletion({
    messages: [
      {
        role: "system",
        content: config.system_prompt,
      },
      {
        role: "user",
        content: [
          textPart([
            `Store Name: ${input.storeName}`,
            `Region: ${input.region}`,
            `Channel: ${input.channel}`,
            `Promoter: ${input.promoter}`,
            `Visit Date: ${input.visitDate}`,
            `Image count: ${input.imageUrls.length}`,
            ...input.imageUrls.map((_, index) => `Image ${index + 1} category: ${input.imageCategories?.[index] ?? "uncategorized"}`),
          ].join("\n")),
          ...input.imageUrls.map(imageUrlPart),
        ],
      },
    ],
    temperature: config.temperature,
    maxTokens: config.max_tokens,
  });

  return {
    normalized: normalizeStoreVisitAiResult(completion.parsed),
    rawText: completion.rawText,
    parsed: completion.parsed,
    metadata: completion.metadata,
    config,
  };
}
