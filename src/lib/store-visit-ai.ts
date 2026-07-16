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

export const PRICE_IMAGE_PROMPT_VERSION = "price-evidence-v1.9-capture-quality-field-risk";

function simpleHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(16);
}

const STORE_VISIT_PRICE_IMAGE_PROMPT = [
  "You are a Retail Shelf Price Evidence Extraction System.",
  "PRIMARY PRINCIPLE: The Vision model is an evidence extractor, not a pricing engine.",
  "Its only responsibility is to describe what is visibly printed inside one visual evidence group.",
  "It must never perform business reasoning, promotion selection, price reconciliation, value propagation, or price calculation.",
  "If evidence is incomplete, return incomplete evidence.",
  "WORKFLOW: First evaluate capture suitability separately from per-field certainty. If photo_quality.status is retake_required, rows must be [] and extraction must stop. If photo_quality.status is pass, extract reliable visible price evidence row by row and express uncertain fields with omissions and PARSE_RISK.",
  "CELL TRANSCRIPTION RULE: For price-board rows, copy each visible cell exactly as printed or handwritten in that same row. Do not calculate, infer, complete, average, normalize, or propagate prices across rows. Do not create a price because it mathematically matches piece count.",
  "PHOTO QUALITY: First identify the primary price board, price tag, or promotion card intended to be captured. Evaluate quality by that primary visual section, not by the entire image. Photo quality is strict capture suitability, not individual field certainty.",
  "The photo passes only when the primary visual section is captured at a usable size and orientation, and its clear-majority row structure, row anchors, and same-row product-to-price positions can be visually inspected. Exact certainty for every handwritten price digit is not a pass condition.",
  "One or two isolated readable rows are not enough. Other distant, cropped, or unrelated boards must not reduce the assessment of the primary visual section. The photo does not need every row to be readable.",
  "Judge the actual effect on digit readability and same-row binding, not visual appearance alone. Angle, handwriting, crossed-out prices, and mild glare are not retake reasons by themselves.",
  "Use retake_required only when no primary visual section meets all pass conditions. A genuine physical capture failure such as blur, insufficient scale, cropping, glare, obstruction, or perspective must be retake_required when it prevents inspection of the clear majority of visible rows. Use price_unclear only when a physical capture failure makes the price cells uninspectable for the clear majority. Use angled_affects_reading only when perspective actually prevents inspection or reliable same-row binding for the clear majority. Use price_obstructed only when cropping, glare, products, shelf structure, or other obstruction actually blocks the clear majority of visible rows or price cells. Do not treat handwriting or strike-throughs as price_obstructed. photo_quality.reasons may contain only: price_unclear, angled_affects_reading, price_obstructed. If status is pass, reasons=[].",
  "FIELD CERTAINTY: Once the photo passes capture suitability, uncertain handwritten digits in individual cells must not trigger retake_required or price_unclear. If a row has direct same-row price evidence but one auxiliary price cell is uncertain, output the row, leave the field empty and add a top-level PARSE_RISK warning. If no same-row price field can be directly transcribed, do not invent a price row; add a top-level PARSE_RISK warning. A handwritten or crossed-out price that is not individually certain does not by itself make the photo retake_required.",
  "BLANK PRINCIPLE: An empty or unclear cell is meaningful evidence. Keep it empty and add a top-level PARSE_RISK warning when the uncertainty is material. Empty does not mean same as the row above or same as the normal column.",
  "SECTION DISCOVERY AND CHECKLIST: Before extracting any rows, visually inspect the entire primary board from its top edge to its bottom edge. Discover every independently titled product section, promotion block, or board subsection, including those below previously noticed sections. Internally build a complete section checklist before extracting rows. Do not begin row extraction until no additional visible section title can be found. Do not invent any cell, price tag, or product binding.",
  "VISUAL EVIDENCE GROUP: each output row represents ONE visual price evidence group.",
  "source_type may be PRICE_BOARD_ROW for one readable row inside a shelf price board or promotion table, or PRICE_TAG for one individual price tag, shelf label, promo card, or single-product price label.",
  "For every output row, all fields must come from the same visual evidence group.",
  "Never merge across different price boards, different product sections, different product families, different horizontal rows, different individual price tags, row above or row below, neighboring tags, repeated headers, or previous extracted rows.",
  "group_id should uniquely distinguish different visual evidence groups within the image. The exact naming format is not important as long as it is consistent inside the same response.",
  "row_anchor should be constructed only from visible row identity such as SKU, Size, Pcs, or Variant. row_anchor must not use prices.",
  "BOARD / SECTION RULE: if the image contains multiple price boards, tables, cards, or product sections, treat each one independently. For PRICE_BOARD_ROW, identify the board or card, its section, and the same horizontal row; anchor the row by SKU / size / Pcs cells and read only cells that visually intersect that same row.",
  "SECTION ROW COVERAGE: Process every checklist section from top to bottom. Inspect every visible horizontal row exactly once. For every directly confirmable row with at least one same-row price field, output one PRICE_BOARD_ROW. A row may keep unclear auxiliary evidence cells empty and add a top-level PARSE_RISK warning. Never skip a readable row merely because nearby rows were already extracted.",
  "SECTION COMPLETENESS CHECK: Before returning JSON, verify every discovered section has been processed. Each discovered section must either produce at least one output row or truly contain no readable rows. If a discovered section produced zero rows, re-inspect that section before finishing. Continue searching below the last extracted row for additional section titles until reaching the bottom of the board.",
  "TABLE CELL VERIFICATION: For PRICE_BOARD_ROW, use the visible SIZE + PCS cells together as the row key. When both are visible, row_anchor must include both values, for example S|38. Do not output an alternate Pcs value for the same size.",
  "Before final response, visually re-read every output cell in its original table cell. Preserve the exact visible product-family title. If a cell cannot be visually confirmed, leave it empty and add a top-level PARSE_RISK warning when material; never substitute a value from another row, a computed value, a repeated pattern, or a plausible-looking digit.",
  "Rows under one section must not inherit prices from another section. Example: rows under SLIM REGULAR (TAPE) must not use prices from SLIM LUXURY SILKY, SLIM JUMBO, or another board.",
  "For PRICE_TAG, extract only text visible on the same individual tag, card, or label. Do not combine product name from one tag with price from another tag.",
  "PRICE_TAG COVERAGE SCAN: Scan independent shelf price tags from left to right, then top to bottom. Output one PRICE_TAG row for every readable individual price tag with a direct product-price binding. The title printed on the tag itself is the primary product identity. If the tag title is incomplete, bind it to a product only when there is a clear one-to-one shelf-position relationship. If several products or tags could match, it is not a direct binding: must not guess or borrow a neighboring product.",
  "PROMO PRICE TAG: A crossed-out price on the same tag is normal_package_text. A prominent promotion price on that same tag is promo_package_text. Read both only from that one tag; do not use the nearby package or another tag to complete either price.",
  "TITLE AND PRODUCT CONTEXT: A visible brand, product, or product-family title at the top of a promotion card or board section applies to all following rows inside that same visual card or section, until the next title, card boundary, or board boundary. Capture that title as product_family_text. Do not apply it to a neighboring card, board, or section.",
  "sku may include only the same-row size/variant text, but do not drop a visible product family header; put the header in product_family_text so the system can build a complete product name.",
  "If one size cell contains multiple readable pcs-price combinations, output one row for EACH pcs-price combination. Do not collapse multiple pack sizes under S/M/L/XL into a single row.",
  "EVIDENCE FIELDS: capture source_type, group_id, section_title, row_anchor, brand, product_family_text, sku, piece_count_text, normal_package_text, normal_piece_text, promo_package_text, promo_piece_text, promo_label, and piece_count when visible.",
  "COLUMN ROLE: use visible table headers to assign fields. HARGA NORMAL / PACK -> normal_package_text. NORMAL HARGA / PCS -> normal_piece_text. HARGA PROMO / PACK -> promo_package_text. PROMO HARGA / PCS -> promo_piece_text.",
  "Empty visible promo cells must remain empty. Do not copy promo price from another row. Do not carry down promo price. Do not infer promo from normal price.",
  "PRICE TEXT: extract prices as visible text only. Do not normalize currency symbols, separators, or formatting except removing surrounding whitespace. Examples: \"129.900\", \"119.900\", \"2.725\", \"Rp 56.900\".",
  "PER PIECE PRICE: only extract per-piece price if explicitly printed as HARGA/PCS, price per pcs, /pcs, per piece, or equivalent visible label. Never derive HARGA/PCS by dividing HARGA/PACK by PCS. The system calculates derived per-piece values later if needed.",
  "PIECE COUNT: read the original Pcs cell from the SAME row. If piece_count_text has format A+B, piece_count = A + B. Examples: 60+6 -> 66, 80+10 -> 90. If bonus digits are unreadable, piece_count=null and add a top-level PARSE_RISK warning.",
  "CONFIDENCE: output confidence values from 0 to 1 for visible evidence only. If the evidence field is empty, its confidence must be null.",
  "Confidence fields: normal_package_price_confidence, promo_package_price_confidence, normal_per_piece_price_confidence, promo_per_piece_price_confidence, piece_count_confidence, row_binding_confidence, section_binding_confidence, product_identity_confidence.",
  "row_binding_confidence means confidence that cells are from the same visual row/tag. section_binding_confidence means confidence that the row belongs to the captured board or section. product_identity_confidence means confidence that brand/product family/SKU identity is correctly associated.",
  "WARNINGS: top-level warnings may contain only PARSE_RISK.",
  "PROMOTION AND HANDWRITING: A visibly crossed-out handwritten price in the same row is the original/list price, and the following visible price in that same row is the promotion price. Transcribe both only when visibly present in that same row. Do not require retake because a price is handwritten or crossed out. Handwritten prices and strike-throughs are normal promotion evidence, not blur or obstruction. Indonesian handwritten digit 7 may contain a horizontal middle stroke. Do not confuse handwritten 7 with digit 2. Example: visible HARGA/PCS \"2.678\" means 2678.",
  "COMPACT OUTPUT: Keep the existing photo_quality and rows JSON structure and the existing evidence field names. When an optional evidence field is not visible, omit it instead of emitting a null placeholder. Never omit a directly confirmable PRICE_BOARD_ROW or PRICE_TAG merely to make the response shorter.",
  "Return ONLY valid compact JSON. No markdown. No explanation. No extra text.",
  '{"photo_quality":{"status":"pass|retake_required","reasons":["price_unclear|angled_affects_reading|price_obstructed"],"message":"string"},"rows":[{"source_type":"PRICE_BOARD_ROW|PRICE_TAG","group_id":"string","section_title":"string","row_anchor":"M|32","brand":"string","product_family_text":"string","sku":"string","piece_count_text":"44","normal_package_text":"129.900","normal_piece_text":"2.952","promo_package_text":"119.900","promo_piece_text":"2.725","promo_label":"Discount","piece_count":44,"normal_package_price_confidence":0.9,"promo_package_price_confidence":0.9,"normal_per_piece_price_confidence":0.9,"promo_per_piece_price_confidence":0.9,"piece_count_confidence":0.9,"row_binding_confidence":0.9,"section_binding_confidence":0.9,"product_identity_confidence":0.9}],"warnings":[{"type":"PARSE_RISK","message":"string"}]}',
].join("\n");

const PRICE_IMAGE_PROMPT_HASH = simpleHash(STORE_VISIT_PRICE_IMAGE_PROMPT);

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
  max_tokens: 10000,
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
    max_tokens: Number.isFinite(maxTokens) ? Math.min(Math.max(Math.floor(maxTokens), DEFAULT_STORE_VISIT_AI_CONFIG.max_tokens), 10000) : DEFAULT_STORE_VISIT_AI_CONFIG.max_tokens,
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

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeComparableText(value: string | null | undefined) {
  return compactWhitespace(String(value ?? "")).toLowerCase();
}

function comparableTokens(value: string | null | undefined): string[] {
  return normalizeComparableText(value).match(/[a-z0-9]+/g) ?? [];
}

function isProductFamilySectionTitle(value: string | null | undefined) {
  const cleanValue = compactWhitespace(String(value ?? ""));
  if (!cleanValue) return false;
  if (/\b(promo|promosi|discount|diskon|harga|price|special|offer|buy|beli|get|gratis|pcs|rp|idr)\b/i.test(cleanValue)) {
    return false;
  }
  if (/\d[\d.]*\s*(?:pcs|pc|idr|rp)?\b/i.test(cleanValue)) return false;
  return comparableTokens(cleanValue).length >= 2;
}

function resolvePriceRowProductFamilyText(productFamilyText: string | null, sectionTitle: string | null) {
  const cleanFamily = productFamilyText ? compactWhitespace(productFamilyText) : "";
  const cleanSection = sectionTitle ? compactWhitespace(sectionTitle) : "";
  if (!isProductFamilySectionTitle(cleanSection)) return cleanFamily || null;

  const familyTokens = comparableTokens(cleanFamily);
  if (familyTokens.length === 0) return cleanSection;

  const sectionTokens = comparableTokens(cleanSection);
  const sectionIncludesFamily = familyTokens.every((token) => sectionTokens.includes(token));
  if (sectionIncludesFamily && sectionTokens.length > familyTokens.length) return cleanSection;

  return cleanFamily || null;
}

function stripSkuPrefixCoveredByFamily(sku: string, familyWithBrand: string, brand: string) {
  let remainingSku = compactWhitespace(sku);
  const familyTokens = comparableTokens(familyWithBrand);
  const removablePrefixes = [brand, ...familyTokens]
    .map((token) => compactWhitespace(token))
    .filter(Boolean);

  while (remainingSku) {
    const nextPrefix = removablePrefixes.find((prefix) => normalizeComparableText(remainingSku).startsWith(normalizeComparableText(prefix)));
    if (!nextPrefix) break;
    const prefixPattern = new RegExp(`^${nextPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b\\s*`, "i");
    const nextSku = remainingSku.replace(prefixPattern, "").trim();
    if (nextSku === remainingSku) break;
    remainingSku = nextSku;
  }

  return remainingSku;
}

function buildPriceImageSkuName(brand: string | null, productFamilyText: string | null, sku: string) {
  const cleanSku = compactWhitespace(sku) || "Unknown SKU";
  const cleanFamily = productFamilyText ? compactWhitespace(productFamilyText) : "";
  const cleanBrand = brand ? compactWhitespace(brand) : "";
  const comparableSku = normalizeComparableText(cleanSku);
  const comparableBrand = normalizeComparableText(cleanBrand);
  if (!cleanFamily) {
    if (!cleanBrand || comparableSku.includes(comparableBrand)) return cleanSku;
    return compactWhitespace(`${cleanBrand} ${cleanSku}`);
  }

  const comparableFamily = normalizeComparableText(cleanFamily);
  if (comparableSku.includes(comparableFamily)) return cleanSku;

  const familyWithBrand = cleanBrand && !comparableFamily.includes(comparableBrand)
    ? `${cleanBrand} ${cleanFamily}`
    : cleanFamily;
  const comparableFamilyWithBrand = normalizeComparableText(familyWithBrand);
  if (comparableSku.includes(comparableFamilyWithBrand)) return cleanSku;

  const skuSuffix = stripSkuPrefixCoveredByFamily(cleanSku, familyWithBrand, cleanBrand);
  return compactWhitespace(`${familyWithBrand} ${skuSuffix || cleanSku}`);
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

function asOptionalConfidence(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(Math.max(parsed, 0), 1);
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
      const sourceType = asOptionalString(row.source_type);
      const groupId = asOptionalString(row.group_id);
      const sectionTitle = asOptionalString(row.section_title);
      const rowAnchor = asOptionalString(row.row_anchor);
      const pieceCountText = asOptionalString(row.piece_count_text);
      const normalPackageText = asOptionalString(row.normal_package_text);
      const normalPieceText = asOptionalString(row.normal_piece_text);
      const promoPackageText = asOptionalString(row.promo_package_text);
      const promoPieceText = asOptionalString(row.promo_piece_text);
      const promoLabel = asOptionalString(row.promo_label);
      const normalPackagePriceConfidence = asOptionalConfidence(row.normal_package_price_confidence);
      const promoPackagePriceConfidence = asOptionalConfidence(row.promo_package_price_confidence);
      const normalPerPiecePriceConfidence = asOptionalConfidence(row.normal_per_piece_price_confidence);
      const promoPerPiecePriceConfidence = asOptionalConfidence(row.promo_per_piece_price_confidence);
      const pieceCountConfidence = asOptionalConfidence(row.piece_count_confidence);
      const rowBindingConfidence = asOptionalConfidence(row.row_binding_confidence);
      const sectionBindingConfidence = asOptionalConfidence(row.section_binding_confidence);
      const productIdentityConfidence = asOptionalConfidence(row.product_identity_confidence);
      const brand = asOptionalString(row.brand);
      const productFamilyText = resolvePriceRowProductFamilyText(asOptionalString(row.product_family_text), sectionTitle);
      const hasEvidenceFields = Boolean(
        sourceType
        || groupId
        || sectionTitle
        || rowAnchor
        || normalPackageText
        || normalPieceText
        || promoPackageText
        || promoPieceText
        || promoLabel
      );
      const hasPromoPackageEvidence = Boolean(asNullablePriceNumber(promoPackageText));
      const hasPromoPieceEvidence = Boolean(asNullablePriceNumber(promoPieceText));
      const listPriceText = hasEvidenceFields ? normalPackageText : asOptionalString(row.list_price_text);
      const packagePriceText = hasEvidenceFields
        ? hasPromoPackageEvidence ? promoPackageText : normalPackageText
        : asOptionalString(row.package_price_text);
      const netPriceText = hasEvidenceFields
        ? packagePriceText
        : asOptionalString(row.net_price_text);
      const visiblePricePerPieceText = hasEvidenceFields
        ? hasPromoPieceEvidence ? promoPieceText : normalPieceText
        : asOptionalString(row.visible_price_per_piece_text);
      const selectedPackageConfidence = hasEvidenceFields
        ? hasPromoPackageEvidence ? promoPackagePriceConfidence : normalPackagePriceConfidence
        : null;
      const selectedPieceConfidence = hasEvidenceFields
        ? hasPromoPieceEvidence ? promoPerPiecePriceConfidence : normalPerPiecePriceConfidence
        : null;
      const rawListPrice = asNullablePriceNumber(listPriceText) ?? (hasEvidenceFields ? null : asNullablePriceNumber(row.list_price_idr));
      const rawPackagePrice = asNullablePriceNumber(packagePriceText) ?? (hasEvidenceFields ? rawListPrice : asNullablePriceNumber(row.package_price_idr) ?? rawListPrice);
      const rawNetPrice = asNullablePriceNumber(netPriceText) ?? (hasEvidenceFields ? rawPackagePrice ?? rawListPrice : asNullablePriceNumber(row.net_price_idr) ?? rawPackagePrice ?? rawListPrice);
      const visiblePricePerPiece = asNullablePriceNumber(visiblePricePerPieceText) ?? (hasEvidenceFields ? null : asNullablePriceNumber(row.visible_price_per_piece_idr));
      const sku = buildPriceImageSkuName(brand, productFamilyText, asString(row.sku, "Unknown SKU"));
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
        pieceCountText,
        skuText: sku,
        rowAnchor,
        listPriceConfidence: hasEvidenceFields ? normalPackagePriceConfidence : null,
        packagePriceConfidence: selectedPackageConfidence,
        netPriceConfidence: selectedPackageConfidence,
        visiblePricePerPieceConfidence: selectedPieceConfidence,
        pieceCountConfidence,
        rowBindingConfidence,
        sectionBindingConfidence,
        productIdentityConfidence,
      });
      const listPrice = reconciledPrices.listPriceIdr ?? rawNetPrice;
      const packagePrice = reconciledPrices.packagePriceIdr ?? listPrice;
      const netPrice = reconciledPrices.netPriceIdr ?? packagePrice ?? listPrice;
      const promoType = hasEvidenceFields
        ? hasPromoPackageEvidence
          ? asOptionalString(row.promo_type) ?? promoLabel ?? "Discount"
          : promoLabel
            ? asOptionalString(row.promo_type) ?? promoLabel
            : null
        : asOptionalString(row.promo_type);
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
        source_type: sourceType,
        group_id: groupId,
        section_title: sectionTitle,
        row_anchor: rowAnchor,
        brand,
        product_family_text: productFamilyText,
        sku,
        piece_count_text: pieceCountText,
        normal_package_text: normalPackageText,
        normal_piece_text: normalPieceText,
        promo_package_text: promoPackageText,
        promo_piece_text: promoPieceText,
        promo_label: promoLabel,
        normal_package_price_confidence: normalPackagePriceConfidence,
        promo_package_price_confidence: promoPackagePriceConfidence,
        normal_per_piece_price_confidence: normalPerPiecePriceConfidence,
        promo_per_piece_price_confidence: promoPerPiecePriceConfidence,
        piece_count_confidence: pieceCountConfidence,
        row_binding_confidence: rowBindingConfidence,
        section_binding_confidence: sectionBindingConfidence,
        product_identity_confidence: productIdentityConfidence,
        list_price_text: listPriceText,
        package_price_text: packagePriceText,
        net_price_text: netPriceText,
        visible_price_per_piece_text: visiblePricePerPieceText,
        list_price_idr: listPrice ?? netPrice,
        package_price_idr: packagePrice ?? netPrice,
        net_price_idr: netPrice,
        visible_price_per_piece_idr: reconciledPrices.visiblePricePerPieceIdr,
        price_basis: reconciledPrices.priceBasis,
        ai_confidence: reconciledPrices.aiConfidence,
        legacy_confidence_fallback: reconciledPrices.legacyConfidenceFallback,
        price_evidence_status: reconciledPrices.priceEvidenceStatus,
        price_evidence_confidence: reconciledPrices.priceEvidenceConfidence,
        price_evidence_detail: reconciledPrices.priceEvidenceDetail,
        review_decision: reconciledPrices.reviewDecision,
        conflicts: reconciledPrices.conflicts,
        promo_type: promoType,
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
    prompt_version: PRICE_IMAGE_PROMPT_VERSION,
    prompt_hash: PRICE_IMAGE_PROMPT_HASH,
    analysis_metadata: {
      prompt_version: PRICE_IMAGE_PROMPT_VERSION,
      prompt_hash: PRICE_IMAGE_PROMPT_HASH,
    },
    review_decision: rows.some((row) => row.review_decision === "NEED_REVIEW") ? "NEED_REVIEW" : "AUTO_APPROVE",
    conflicts: rows.flatMap((row) => row.conflicts ?? []),
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
    maxTokens: Math.min(config.max_tokens, 10000),
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
