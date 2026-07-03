import type {
  CategoryCoverage,
  StoreVisitDisplayAnalysis,
  StoreVisitImageCategory,
  StoreVisitPhotoQuality,
  StoreVisitPriceImageAnalysis,
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
import { parseIdrPrice, reconcilePackagePriceMetrics } from "@/lib/price-utils";
import { normalizePieceCountFromCandidates, normalizePieceCountFromEvidence } from "@/lib/piece-count";
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
const priceBasisValues = ["VISIBLE_PACKAGE_PRICE", "VISIBLE_PROMO_PACKAGE_PRICE", "VISIBLE_PRICE_PER_PIECE", "RECONCILED_PACKAGE_PRICE"] as const;
const photoQualityReasonValues = ["price_unclear", "angled_affects_reading", "price_obstructed"] as const;
const PROMOTION_PROMPT_REQUIREMENT = [
  "Promotion insight requirement: promotion_insights.competitor_promotions must include EVERY distinct visible promotion detected across ALL images. Do not return only the top promotions. Do not cap this array at 3. Do not drop a promotion because brand, product, price, or mechanic is partially unclear; keep the visible evidence in description and add a validation warning when needed.",
  "A distinct promotion means a visible promo tag, discount, bundle, buy-more-save offer, special price, gondola/display offer, gift/cashback offer, or any shelf material communicating a promotional mechanic. If the same physical promotion appears in multiple images, merge it once; if different brands/products/mechanics/prices are visible, output each one separately.",
  "For each competitor promotion, description must mention the visible product or pack, promo mechanic, promo price or discount text, and location/evidence when visible. Use Promo Tag when the mechanic is visible but cannot be classified more specifically.",
].join("\n");

const PRICE_CANDIDATE_PROMPT_REQUIREMENT = [
  "Price candidate quality requirement: price_insights.key_sku_prices must contain only sellable product prices that are suitable for AI Price Review. Every item must have a specific product or pack, a visible IDR package price, and visible piece_count from the pack text or shelf tag.",
  "For each key_sku_prices item, capture list_price, package_price, net_price, and promo_type when visible. list_price is the normal shelf/list price. package_price is the package price before voucher/cashback. net_price is the final paid price after discounts. If only one price is visible, set price, list_price, package_price, and net_price to that same visible selling price. promo_type should describe the mechanic, such as Discount, Buy 2 Get 1, Buy 1 Get 1, Special Offer, or empty when no clear activity is visible.",
  "For bonus-pack piece counts such as 28+6 pcs or 44+10 pcs, return the total piece_count. For open-ended text such as 30+ pcs where the extra quantity is not shown, return 30.",
  "For price boards, shelf tags, promo tags, and handwritten price boards, extract EVERY visible readable SKU-price row into price_insights.key_sku_prices. Do not return only the top SKUs. If 8 SKU prices are visible, return 8 key_sku_prices.",
  "Do not summarize a multi-row price board only in promotion_insights. If promotion_insights.description mentions a SKU price, normal price, promo price, or per-piece row, the same SKU-price pair must also appear as a separate price_insights.key_sku_prices item.",
  "Before finalizing, count the readable SKU-price rows on each price board/promo tag and make sure key_sku_prices contains one item for each counted row.",
  "For price-board rows where the product, pack size, and most price digits are visible, output the best-read price with lower confidence instead of omitting the row. Use validation warnings for uncertainty; do not hide the SKU row only because the handwriting is imperfect.",
  "Do not mix unrelated shelf-edge labels or background price tags into the same promo-board extraction. If a separate shelf label is not clearly linked to a visible product pack or board row, keep it as SHELF_SIGNAL rather than key_sku_prices.",
  "Do not put gifts, freebies, bonus items, giveaway mechanics, unclear handwritten notes, or non-price text into price_insights.key_sku_prices. Text such as gratis, free, gift, bonus, hadiah, cashback, voucher, plate, bowl, toy, or '1 pcs' without an IDR selling price is promotion context only, not a price candidate.",
  "raw_extraction.detected_items may include original observations, but price must be an actual IDR selling price only. If the visible text is a gift, free item, bonus, or mechanic rather than a selling price, leave price as an empty string and record the context in promotion_insights.competitor_promotions.",
  "For handwritten or shelf-board prices, distinguish normal price, promo price, and gift mechanic. If the price-product mapping is uncertain, use type SHELF_SIGNAL or add a validation warning; do not force it into key_sku_prices unless the product and IDR price are clearly linked.",
  "When a price appears as a shelf tag mismatch, unrelated top-shelf label, or low-confidence ANOMALY outside the main promo tag rows, keep it out of key_sku_prices and explain it in validation warnings or raw_extraction as SHELF_SIGNAL.",
  "This requirement overrides any earlier key_sku_prices top-N or max-5 instruction. key_sku_prices has no fixed row cap; completeness of readable SKU-price rows is more important than brevity.",
].join("\n");

const OUTPUT_LIMITS_PROMPT_REQUIREMENT = "Output limits: raw_extraction.detected_items max 30; price_insights.key_sku_prices has no fixed max and must include every readable SKU-price row; price_insights.brand_price_range max 6; store_summary max 25 words and one sentence. There is no top-N limit for promotion_insights.competitor_promotions; include all distinct visible promotions.";

export const STORE_VISIT_AI_PROMPT = [
  "You are a Retail Shelf Intelligence AI System with strict observability requirements.",
  "You analyze MULTIPLE store shelf images from a SINGLE store visit and produce raw structured extraction, normalized retail insights, and validation metadata.",
  "Never silently fail. Never replace missing data with fake defaults. Every output must be explainable through structured layers.",
  "Mandatory pipeline: Step 1 raw extraction of visible brands, SKUs, prices, promotions, and shelf condition signals without deduplication. Step 2 aggregate into brand-level insights, key SKU selection, promotion grouping, and stock signals. Step 3 validate missing brand, unclear price, low confidence, and JSON completeness risk. Step 4 produce normalized output.",
  "If information is unclear, keep it in raw_extraction with confidence 0 and add a validation warning. Do not use Unknown or Price unclear in the model output.",
  "For price_insights.key_sku_prices, include piece_count only when the package piece count is visible on pack text or shelf tag. If unclear, set piece_count to null. Do not guess piece count.",
  "Never calculate price_per_piece yourself. Return package price and piece_count only; the system calculates per-piece price.",
  PROMOTION_PROMPT_REQUIREMENT,
  PRICE_CANDIDATE_PROMPT_REQUIREMENT,
  "Review each image independently first, then aggregate only store-level conclusions that are clearly supported by the provided images.",
  OUTPUT_LIMITS_PROMPT_REQUIREMENT,
  "Return ONLY valid compact JSON. No markdown. No explanations. No extra text.",
  "Use exactly this JSON structure and enum values:",
  '{"raw_extraction":{"detected_items":[{"brand":"string","product":"string","price":"string","type":"SKU|PROMO|SHELF_SIGNAL","confidence":0.8}]},"validation":{"is_valid":true,"warnings":[{"type":"MISSING_DATA|LOW_CONFIDENCE|PARSE_RISK","message":"string"}]},"shelf_understanding":{"brands_present":[{"brand":"string","shelf_share_estimate":0}],"category_coverage":"FULL|PARTIAL|FRAGMENTED","shelf_condition":"WELL_ORGANISED|NORMAL|MESSY","facings_estimate":[{"brand":"string","facing_count_estimate":0}]},"price_insights":{"brand_price_range":[{"brand":"string","min_price":"string","max_price":"string"}],"key_sku_prices":[{"brand":"string","product":"string","price":"string","list_price":"string","package_price":"string","net_price":"string","promo_type":"string","piece_count":44,"tag":"HERO|PROMO|ANOMALY","confidence":0.8}]},"stock_risk":{"level":"Normal|Low Stock|Out of Stock Risk","affected_brands":[{"brand":"string","risk_signal":"EMPTY_FACING|LOW_FACING|BLOCKED_SHELF"}],"reason":"string"},"promotion_insights":{"competitor_promotions":[{"brand":"string","type":"Discount|Buy 1 Get 1|Buy 2 Get 1|Promo Tag|Special Offer","visibility":"LOW|MEDIUM|HIGH","description":"string"}],"promo_pressure_level":"LOW|MEDIUM|HIGH"},"store_summary":"string"}',
].join("\n");

const STORE_VISIT_PRICE_IMAGE_PROMPT = [
  "You are a Retail Price Tag Extraction AI.",
  "Your task is to accurately extract visible retail pricing information from ONE store-visit image.",
  "The output must contain ONLY directly observable evidence. Never infer, estimate, repair, calculate, or invent hidden information.",
  "WORKFLOW: Step 1 evaluate image quality. If status is retake_required, rows must be [] and extraction must stop. If status is pass, extract all valid product-price rows.",
  "PHOTO QUALITY: the target must be shelf price tags or promotional price boards.",
  "Pass when target price tags are front-facing or nearly front-facing, main price digits are readable, and product-price relationships are visually reliable.",
  "Do not fail because background labels are unreadable, edge labels are cropped, small peripheral labels are blurry, minor tilt, minor glare, or timestamp overlays outside the target area.",
  "Fail only for wide shelf overview without usable price evidence, severe perspective distortion, unreadable price digits, blocked price tags, blur or glare preventing reading, or product-price relationships cannot be confirmed.",
  "photo_quality.reasons may contain only: price_unclear, angled_affects_reading, price_obstructed. If status is pass, reasons=[].",
  "VALID PRICE TAGS: accept paper shelf labels, electronic shelf labels, shelf strips, hanging shelf price cards, promotional shelf cards, and price-board table rows.",
  "Ignore posters, advertisements, package printing, banners, and marketing graphics unless they function as the actual shelf price tag.",
  "ROW EXTRACTION: extract every readable sellable SKU. Return a row only if both product or SKU and selling price are visible.",
  "Associate every price tag only with the nearest product or same table row: directly above, directly below, immediately adjacent, or same row in a price-board table.",
  "Never cross shelf levels, cross shelf columns, associate distant products, or borrow values from another SKU row. If association is ambiguous, skip the row and add PARSE_RISK warning.",
  "VISIBLE ROW EVIDENCE: for each row, capture piece_count_text, list_price_text, package_price_text, net_price_text, and visible_price_per_piece_text whenever available.",
  "All row evidence must come from the SAME product row.",
  "Never copy, inherit, carry down, repeat, or reuse price values from the row above, row below, group header, or another SKU.",
  "If a same-row cell is blank, hidden, cropped, or unclear, leave that field empty or null and add PARSE_RISK when it affects selling price certainty.",
  "NORMAL VS PROMO: if both NORMAL and PROMO price sections exist, list_price_text should come from the visible NORMAL package price when available; package_price_text, net_price_text, and visible_price_per_piece_text should come from the visible PROMO section when available.",
  "PROMO evidence is valid ONLY when the PROMO/PACK or PROMO/PCS cell is visibly printed in the SAME row.",
  "Never copy, inherit, carry down, or repeat PROMO package price or PROMO per-piece price from another row.",
  "If the same-row PROMO cell is blank, hidden, cropped, or unclear, do not output that PROMO value; use visible NORMAL evidence only and add PARSE_RISK if the final selling price is uncertain.",
  "If no PROMO exists, use NORMAL values.",
  "PRICE FIELDS: return all IDR values as integers. Example: Rp129.900 -> 129900.",
  "list_price_idr, package_price_idr, and net_price_idr must ALWAYS represent WHOLE PACKAGE prices. Never output per-piece values into these fields.",
  "If only one package price exists, copy the same value into list_price_idr, package_price_idr, and net_price_idr.",
  "If multiple package prices exist but payable price is unclear, use the lowest clearly payable package price as net_price_idr and add PARSE_RISK warning.",
  "Never calculate package prices. Never divide package prices by piece_count.",
  "Do not output 1400, 3210, or any other per-piece value in list_price_idr, package_price_idr, or net_price_idr when visible package prices are Rp56.000 or Rp89.900.",
  "PIECE COUNT: read the original Pcs cell. Output piece_count_text and piece_count.",
  "Examples: 28 -> 28, 30+ -> 30, 42+4 -> 46, 44+10 -> 54, 60+6 -> 66, 80+10 -> 90.",
  "If + exists but bonus digits are unreadable, set piece_count=null and add PARSE_RISK. Never discard visible bonus quantity.",
  "PER PIECE PRICE: visible_price_per_piece_text and visible_price_per_piece_idr represent ONLY visibly printed HARGA/PCS.",
  "Never calculate per-piece price. Never derive per-piece price from package price. Never write per-piece price into list_price_idr, package_price_idr, or net_price_idr.",
  "HANDWRITING NOTES: Indonesian handwritten digit 7 may contain a horizontal middle stroke. Do not confuse handwritten 7 with digit 2.",
  "Example: visible HARGA/PCS 2.678 -> visible_price_per_piece_text=\"2.678\", visible_price_per_piece_idr=2678.",
  "PROMOTION: promo_type may be Discount, Bundle, Buy 1 Get 1, Buy 2 Get 1, Cashback, Special Offer, or null. Never invent promotions.",
  "Return ONLY valid compact JSON. No markdown. No explanation. No extra text.",
  '{"photo_quality":{"status":"pass|retake_required","reasons":["price_unclear|angled_affects_reading|price_obstructed"],"message":"string"},"rows":[{"brand":"string","sku":"string","piece_count_text":"44","list_price_text":"129.900","package_price_text":"129.900","net_price_text":"119.900","visible_price_per_piece_text":"2.725","list_price_idr":129900,"package_price_idr":129900,"net_price_idr":119900,"visible_price_per_piece_idr":2725,"promo_type":"Discount","piece_count":44}],"summary":"string","warnings":[{"type":"MISSING_DATA|LOW_CONFIDENCE|PARSE_RISK","message":"string"}]}',
].join("\n");

const STORE_VISIT_DISPLAY_PROMPT = [
  "You are a store display analysis system.",
  "You receive one or more storefront or display images from the same store visit.",
  "Summarize only display and store-level observations supported by the images.",
  "Focus on concise business-readable output.",
  "Return ONLY valid compact JSON. No markdown. No extra text.",
  '{"summary":"string","observations":["string"],"warnings":[{"type":"MISSING_DATA|LOW_CONFIDENCE|PARSE_RISK","message":"string"}]}',
].join("\n");

export const DEFAULT_STORE_VISIT_AI_CONFIG: StoreVisitAiConfig = {
  version_name: "Default code config",
  system_prompt: STORE_VISIT_AI_PROMPT,
  temperature: 0,
  max_tokens: 6000,
  status: "active",
};

export function normalizeAiConfig(value: Partial<StoreVisitAiConfig> | null | undefined): StoreVisitAiConfig {
  const temperature = Number(value?.temperature ?? DEFAULT_STORE_VISIT_AI_CONFIG.temperature);
  const maxTokens = Number(value?.max_tokens ?? DEFAULT_STORE_VISIT_AI_CONFIG.max_tokens);
  return {
    ...DEFAULT_STORE_VISIT_AI_CONFIG,
    ...value,
    version_name: asString(value?.version_name, DEFAULT_STORE_VISIT_AI_CONFIG.version_name),
    system_prompt: withRequiredPromptSections(asString(value?.system_prompt, DEFAULT_STORE_VISIT_AI_CONFIG.system_prompt)),
    temperature: Number.isFinite(temperature) ? Math.min(Math.max(temperature, 0), 2) : DEFAULT_STORE_VISIT_AI_CONFIG.temperature,
    max_tokens: Number.isFinite(maxTokens) ? Math.min(Math.max(Math.floor(maxTokens), DEFAULT_STORE_VISIT_AI_CONFIG.max_tokens), 6000) : DEFAULT_STORE_VISIT_AI_CONFIG.max_tokens,
  };
}

function sanitizePromptLimits(prompt: string) {
  return prompt
    .replace(
      /Output limits: raw_extraction\.detected_items max 20; price_insights\.key_sku_prices max 5; price_insights\.brand_price_range max 6; store_summary max 25 words and one sentence\. There is no top-N limit for promotion_insights\.competitor_promotions; include all distinct visible promotions\./g,
      OUTPUT_LIMITS_PROMPT_REQUIREMENT,
    )
    .replace(/price_insights\.key_sku_prices max 5/g, "price_insights.key_sku_prices has no fixed max and must include every readable SKU-price row")
    .replace(/raw_extraction\.detected_items max 20/g, "raw_extraction.detected_items max 30");
}

function appendPromptSection(prompt: string, marker: string, section: string) {
  return prompt.includes(marker) ? prompt : `${prompt.trim()}\n\n${section}`;
}

function withRequiredPromptSections(prompt: string) {
  return [
    {
      marker: "promotion_insights.competitor_promotions must include EVERY distinct visible promotion",
      section: PROMOTION_PROMPT_REQUIREMENT,
    },
    {
      marker: "key_sku_prices has no fixed row cap",
      section: PRICE_CANDIDATE_PROMPT_REQUIREMENT,
    },
  ].reduce((current, requirement) => appendPromptSection(current, requirement.marker, requirement.section), sanitizePromptLimits(prompt));
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

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNullablePriceNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : parseIdrPrice(typeof value === "string" ? value : null);
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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

function asEnum<T extends string>(value: unknown, options: readonly T[], fallback: T) {
  return options.includes(value as T) ? value as T : fallback;
}

function asOptionalPriceBasis(value: unknown) {
  return priceBasisValues.includes(value as (typeof priceBasisValues)[number]) ? value as (typeof priceBasisValues)[number] : null;
}

function normalizeValidationWarnings(warnings: { type: ValidationWarningType; message: string }[]) {
  const priority: ValidationWarningType[] = ["PARSE_RISK", "LOW_CONFIDENCE", "MISSING_DATA"];
  const grouped = new Map<ValidationWarningType, string[]>();

  for (const warning of warnings) {
    const messages = grouped.get(warning.type) ?? [];
    const normalizedMessage = warning.message.trim();
    if (normalizedMessage && !messages.some((message) => message.toLowerCase() === normalizedMessage.toLowerCase())) {
      messages.push(normalizedMessage);
    }
    grouped.set(warning.type, messages);
  }

  return priority
    .filter((type) => grouped.has(type))
    .slice(0, 2)
    .map((type) => {
      const messages = grouped.get(type) ?? [];
      return {
        type,
        message: mergedWarningMessage(type, messages),
      };
    });
}

function mergedWarningMessage(type: ValidationWarningType, messages: string[]) {
  if (messages.length === 0) {
    if (type === "PARSE_RISK") return "Image quality or overlays may limit reliable extraction.";
    if (type === "LOW_CONFIDENCE") return "Some visible shelf items or promo details are low confidence.";
    return "Some required brand, product, price, or promo details are missing.";
  }
  if (messages.length === 1) return messages[0];

  if (type === "PARSE_RISK") {
    return `Multiple parse risks detected: ${messages.slice(0, 2).join(" ")}`;
  }
  if (type === "LOW_CONFIDENCE") {
    return `Multiple low-confidence items detected: ${messages.slice(0, 2).join(" ")}`;
  }
  return `Multiple missing-data issues detected: ${messages.slice(0, 2).join(" ")}`;
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
    .slice(0, 30)
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
  const normalizedKeySkuPrices = keySkuPrices.map((item) => {
    const price = asRecord(item);
    const visiblePrice = asString(price.price, "Price unclear");
    const pieceCountText = asOptionalString(price.piece_count_text);
    const listPriceText = asOptionalString(price.list_price_text);
    const packagePriceText = asOptionalString(price.package_price_text);
    const netPriceText = asOptionalString(price.net_price_text);
    const visiblePricePerPieceText = asOptionalString(price.visible_price_per_piece_text);
    return {
      brand: asString(price.brand, "Unknown"),
      product: asString(price.product, "Unknown product"),
      price: visiblePrice,
      list_price: asOptionalString(price.list_price) ?? visiblePrice,
      package_price: asOptionalString(price.package_price) ?? visiblePrice,
      net_price: asOptionalString(price.net_price) ?? visiblePrice,
      promo_type: asOptionalString(price.promo_type),
      piece_count: normalizePieceCountFromEvidence(price.piece_count, pieceCountText, asOptionalString(price.product)),
      piece_count_text: pieceCountText,
      list_price_text: listPriceText,
      package_price_text: packagePriceText,
      net_price_text: netPriceText,
      visible_price_per_piece_text: visiblePricePerPieceText,
      visible_price_per_piece_idr: asNullablePriceNumber(price.visible_price_per_piece_idr) ?? asNullablePriceNumber(visiblePricePerPieceText),
      price_basis: asOptionalPriceBasis(price.price_basis),
      tag: asEnum(price.tag, priceInsightTags, "HERO"),
      confidence: Math.min(Math.max(asNumber(price.confidence, 0.7), 0), 1),
    };
  });
  const normalizedPromotions = competitorPromotions.map((item) => {
    const promotion = asRecord(item);
    const promotionType = asString(promotion.type ?? promotion.promotion_type, "Promo Tag");
    return {
      brand: asString(promotion.brand, "Unknown"),
      type: asEnum(promotionType, promotionTypes, "Promo Tag"),
      visibility: asEnum(promotion.visibility, promotionVisibilities, "MEDIUM"),
      description: asString(promotion.description, "No clear promotion detected"),
    };
  });
  const normalizedWarnings = normalizeValidationWarnings(
    detectedItems.length > 0
      ? warnings
      : [
        ...warnings,
        { type: "MISSING_DATA" as const, message: "AI did not return raw extraction items." },
      ],
  );

  return {
    raw_extraction: {
      detected_items: detectedItems,
    },
    validation: {
      is_valid: typeof validation.is_valid === "boolean"
        ? validation.is_valid
        : detectedItems.length > 0 && normalizedWarnings.length === 0,
      warnings: normalizedWarnings,
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
        : [{ brand: "Unknown", product: "Unknown product", price: "Price unclear", list_price: "Price unclear", package_price: "Price unclear", net_price: "Price unclear", promo_type: null, piece_count: null, tag: "HERO", confidence: 0 }],
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

function normalizePriceImageWarnings(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .slice(0, 5)
    .map((item) => {
      const warning = asRecord(item);
      return {
        type: asEnum(warning.type, validationWarningTypes, "MISSING_DATA"),
        message: asString(warning.message, "AI output contains missing or uncertain data."),
      };
    });
}

function normalizePhotoQuality(value: unknown): StoreVisitPhotoQuality {
  const record = asRecord(value);
  const rawReasons = Array.isArray(record.reasons) ? record.reasons : [];
  const reasons = rawReasons.filter((reason): reason is (typeof photoQualityReasonValues)[number] => (
    typeof reason === "string" && photoQualityReasonValues.includes(reason as (typeof photoQualityReasonValues)[number])
  ));
  const status = record.status === "retake_required" && reasons.length > 0
    ? "retake_required"
    : "pass";
  const fallbackMessage = status === "retake_required"
    ? "Please retake or replace this photo with a clear, front-facing price-tag image."
    : "Photo quality passed.";
  return {
    status,
    reasons: status === "retake_required" ? reasons : [],
    message: asString(record.message, fallbackMessage),
  };
}

export function normalizeStoreVisitPriceImageAnalysis(
  value: unknown,
  category: StoreVisitImageCategory,
): StoreVisitPriceImageAnalysis {
  const record = asRecord(value);
  const photoQuality = normalizePhotoQuality(record.photo_quality);
  const normalizationWarnings = normalizePriceImageWarnings(record.warnings);
  const rows = photoQuality.status === "retake_required" ? [] : (Array.isArray(record.rows) ? record.rows : [])
    .slice(0, 30)
    .map((item) => {
      const row = asRecord(item);
      const pieceCountText = asOptionalString(row.piece_count_text);
      const listPriceText = asOptionalString(row.list_price_text);
      const packagePriceText = asOptionalString(row.package_price_text);
      const netPriceText = asOptionalString(row.net_price_text);
      const visiblePricePerPieceText = asOptionalString(row.visible_price_per_piece_text);
      const rawListPrice = asNullablePriceNumber(listPriceText) ?? asNullablePriceNumber(row.list_price_idr);
      const rawPackagePrice = asNullablePriceNumber(packagePriceText) ?? asNullablePriceNumber(row.package_price_idr) ?? rawListPrice;
      const rawNetPrice = asNullablePriceNumber(netPriceText) ?? asNullablePriceNumber(row.net_price_idr) ?? rawPackagePrice ?? rawListPrice;
      const visiblePricePerPiece = asNullablePriceNumber(row.visible_price_per_piece_idr) ?? asNullablePriceNumber(visiblePricePerPieceText);
      const sku = asString(row.sku, "Unknown SKU");
      const modelPieceCount = normalizePieceCountFromCandidates(row.piece_count, sku);
      const pieceCount = normalizePieceCountFromEvidence(row.piece_count, pieceCountText, sku);
      const reconciledPrices = reconcilePackagePriceMetrics({
        listPriceIdr: rawListPrice,
        packagePriceIdr: rawPackagePrice,
        netPriceIdr: rawNetPrice,
        pieceCount,
        visiblePricePerPieceIdr: visiblePricePerPiece,
        listPriceText,
        packagePriceText,
        netPriceText,
        visiblePricePerPieceText,
      });
      const listPrice = reconciledPrices.listPriceIdr ?? rawNetPrice;
      const packagePrice = reconciledPrices.packagePriceIdr ?? listPrice;
      const netPrice = reconciledPrices.netPriceIdr ?? packagePrice ?? listPrice;
      if (pieceCountText && modelPieceCount && pieceCount && modelPieceCount !== pieceCount) {
        normalizationWarnings.push({
          type: "PARSE_RISK",
          message: "Corrected piece count from visible same-row Pcs text evidence.",
        });
      }
      if (reconciledPrices.warningMessage) {
        normalizationWarnings.push({
          type: "PARSE_RISK",
          message: reconciledPrices.warningMessage,
        });
      }
      const pricePerPiece = reconciledPrices.pricePerPieceIdr;
      return {
        brand: asOptionalString(row.brand),
        sku,
        piece_count_text: pieceCountText,
        list_price_text: listPriceText,
        package_price_text: packagePriceText,
        net_price_text: netPriceText,
        visible_price_per_piece_text: visiblePricePerPieceText,
        list_price_idr: listPrice ?? netPrice,
        package_price_idr: packagePrice ?? netPrice,
        net_price_idr: netPrice,
        visible_price_per_piece_idr: reconciledPrices.visiblePricePerPieceIdr,
        price_basis: reconciledPrices.priceBasis,
        promo_type: asOptionalString(row.promo_type),
        piece_count: pieceCount,
        price_per_piece_idr: pricePerPiece,
      };
    })
    .filter((row) => row.net_price_idr !== null);

  return {
    schema_version: "store_visit_price_image_v1",
    upload_category: category,
    photo_quality: photoQuality,
    rows,
    summary: asString(record.summary, photoQuality.status === "retake_required" ? photoQuality.message : rows.length > 0 ? `${rows.length} SKU rows detected.` : "No readable SKU price rows detected."),
    warnings: normalizationWarnings,
  };
}

export function normalizeStoreVisitDisplayAnalysis(value: unknown): StoreVisitDisplayAnalysis {
  const record = asRecord(value);
  const observations = (Array.isArray(record.observations) ? record.observations : [])
    .map((item) => asString(item, ""))
    .filter(Boolean)
    .slice(0, 8);

  return {
    schema_version: "store_visit_display_v1",
    summary: asString(record.summary, observations[0] ?? "No display summary available."),
    observations,
    warnings: normalizePriceImageWarnings(record.warnings),
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

export async function analyzeStoreVisitPriceImage(input: {
  visitId?: string;
  imageId?: string;
  imageUrl: string;
  imageCategory: StoreVisitImageCategory;
  storeName: string;
  region: string;
  channel: string;
  promoter: string;
  visitDate: string;
  config?: Partial<StoreVisitAiConfig>;
}) {
  const config = input.config ? normalizeAiConfig(input.config) : await getActiveStoreVisitAiConfig();
  const completion = await createJsonChatCompletion({
    messages: [
      {
        role: "system",
        content: STORE_VISIT_PRICE_IMAGE_PROMPT,
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
            `Image category: ${input.imageCategory}`,
          ].join("\n")),
          imageUrlPart(input.imageUrl),
        ],
      },
    ],
    temperature: config.temperature,
    maxTokens: Math.min(config.max_tokens, 6000),
  });

  console.info("[store-visit-ai] price image analyzed", {
    visit_id: input.visitId ?? null,
    image_id: input.imageId ?? null,
    model: completion.metadata.model,
    api_family: completion.metadata.api_family,
    request_url: completion.metadata.request_url,
    http_status: completion.metadata.http_status ?? null,
    provider_request_id: completion.metadata.provider_request_id ?? completion.metadata.response_id ?? null,
    fallback_used: completion.metadata.fallback_used,
    attempt_count: completion.metadata.attempt_count,
  });

  return {
    normalized: normalizeStoreVisitPriceImageAnalysis(completion.parsed, input.imageCategory),
    rawText: completion.rawText,
    parsed: completion.parsed,
    metadata: completion.metadata,
    config,
  };
}

export async function analyzeStoreVisitDisplayImages(input: {
  imageUrls: string[];
  storeName: string;
  region: string;
  channel: string;
  promoter: string;
  visitDate: string;
  config?: Partial<StoreVisitAiConfig>;
}) {
  if (input.imageUrls.length === 0) {
    return {
      normalized: normalizeStoreVisitDisplayAnalysis({ summary: "No display images uploaded.", observations: [], warnings: [] }),
      rawText: "",
      parsed: {},
      metadata: null,
      config: input.config ? normalizeAiConfig(input.config) : await getActiveStoreVisitAiConfig(),
    };
  }

  const config = input.config ? normalizeAiConfig(input.config) : await getActiveStoreVisitAiConfig();
  const completion = await createJsonChatCompletion({
    messages: [
      {
        role: "system",
        content: STORE_VISIT_DISPLAY_PROMPT,
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
          ].join("\n")),
          ...input.imageUrls.map(imageUrlPart),
        ],
      },
    ],
    temperature: config.temperature,
    maxTokens: Math.min(config.max_tokens, 1800),
  });

  return {
    normalized: normalizeStoreVisitDisplayAnalysis(completion.parsed),
    rawText: completion.rawText,
    parsed: completion.parsed,
    metadata: completion.metadata,
    config,
  };
}
