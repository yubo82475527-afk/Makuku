import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";
import { derivePriceEvidenceReasonCode, parseIdrPrice, reconcilePackagePriceMetrics } from "@/lib/price-utils";
import { normalizePieceCount, normalizePieceCountFromCandidates, parsePieceCountText, resolveTrustedPieceCount } from "@/lib/piece-count";
import { compileProductMatchIndex, matchProduct, type CompiledProductMatchIndex, type MatchRuleSet, type ProductMatchMaster } from "@/lib/product-match-engine";
import { createProductMatchRulesV2 } from "@/lib/product-match-rules-v2";
import { compileProductMatchNormalizations, type ProductMatchNormalizationRule } from "@/lib/product-match-normalizations";
import type { AiPriceCandidate, CompetitorProduct, MaterialMaster, PriceEvidenceStatus, PriceReviewDecision, StoreVisitAiResult } from "@/lib/types";

type Warning = { type?: string; message: string };

type CandidateInput = {
  visitId: string;
  aiResult: StoreVisitAiResult;
  sourceItems?: AiPriceCandidateSourceItem[];
  affectedImageIds?: string[];
};

export type AiPriceCandidateSourceItem = {
  brand: string;
  product: string;
  price: string;
  list_price?: string | null;
  package_price?: string | null;
  net_price?: string | null;
  promo_type?: string | null;
  piece_count: number | null;
  raw_piece_count_text?: string | null;
  piece_count_source_label?: string | null;
  raw_package_price_text?: string | null;
  raw_net_price_text?: string | null;
  raw_price_per_piece_text?: string | null;
  visible_price_per_piece_idr?: number | null;
  normal_package_price_confidence?: number | null;
  promo_package_price_confidence?: number | null;
  normal_per_piece_price_confidence?: number | null;
  promo_per_piece_price_confidence?: number | null;
  piece_count_confidence?: number | null;
  row_binding_confidence?: number | null;
  section_binding_confidence?: number | null;
  product_identity_confidence?: number | null;
  price_basis?: string | null;
  legacy_confidence_fallback?: boolean | null;
  price_evidence_status?: PriceEvidenceStatus | null;
  price_evidence_confidence?: number | null;
  price_evidence_detail?: Record<string, unknown> | null;
  conflicts?: Warning[] | null;
  review_decision?: PriceReviewDecision | null;
  type: "SKU" | "PROMO";
  tag?: string | null;
  confidence: number | null;
  source: "key_sku" | "raw";
  productFamilyText?: string | null;
  sectionTitle?: string | null;
  rowAnchor?: string | null;
  sourceImageId?: string | null;
  sourceImagePath?: string | null;
  sourceRowIndex?: number | null;
};

const nonPricePromotionPattern = /\b(gratis|free|gift|bonus|hadiah|cashback|voucher|plate|bowl|toy|giveaway)\b/i;
const priceRangePattern = /\d[\d.,]*\s*(?:-|–|—|~|to|sampai)\s*(?:rp\s*)?\d[\d.,]*/i;

const candidateVisitSelect = "*, offline_store_visits(id,store_name,city,province,city_name,district,channel_type,visit_date,created_at)";

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractPieceCount(value: string | null | undefined) {
  return parsePieceCountText(value);
}

function hasNonPricePromotionText(item: { brand: string; product: string; price: string }) {
  return nonPricePromotionPattern.test(`${item.brand} ${item.product} ${item.price}`);
}

function parseCandidatePrice(value: string | number | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw || priceRangePattern.test(raw)) return null;

  const parsed = parseIdrPrice(value);
  if (!parsed || parsed < 1000) return null;

  const hasCurrency = /\b(?:rp|idr)\b/i.test(raw);
  const hasThousandsPattern = /\d{1,3}(?:[.,]\d{3})+/.test(raw);
  const hasPlainIdrAmount = /^\s*\d{4,}\s*$/.test(raw);
  return hasCurrency || hasThousandsPattern || hasPlainIdrAmount ? parsed : null;
}

function normalizePromoType(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text || /^none|no activity|no promo|normal$/i.test(text)) return null;
  return text;
}

function hasH5VisiblePriceSignal(item: AiPriceCandidateSourceItem) {
  return [
    item.price,
    item.list_price,
    item.package_price,
    item.net_price,
    item.raw_package_price_text,
    item.raw_net_price_text,
    item.raw_price_per_piece_text,
  ].some((value) => String(value ?? "").trim() !== "")
    || item.visible_price_per_piece_idr !== null && item.visible_price_per_piece_idr !== undefined;
}

export function isH5VisiblePriceCandidate(item: AiPriceCandidateSourceItem) {
  if (!item.product) return false;
  if (item.tag === "ANOMALY") return false;
  if (hasNonPricePromotionText(item)) return false;
  if (item.sourceImageId) return hasH5VisiblePriceSignal(item);
  return parseCandidatePrice(item.price) !== null;
}

function candidateKey({
  item,
  matchedEntityType,
  matchedEntityId,
  netPrice,
}: {
  item: AiPriceCandidateSourceItem;
  matchedEntityType: "material_master" | "competitor_product" | "unmatched";
  matchedEntityId: string | null;
  netPrice: number | null;
}) {
  if (item.sourceImageId) {
    return [
      "image_entity_price",
      item.sourceImageId,
      String(item.sourceRowIndex ?? ""),
      matchedEntityType,
      matchedEntityId ?? "",
      String(netPrice ?? parseCandidatePrice(item.price) ?? item.price),
    ].join("|");
  }
  const parsedPrice = netPrice ?? parseCandidatePrice(item.price);
  return [
    normalizeText(item.brand),
    candidateProductKey(item.product),
    normalizeText(String(parsedPrice ?? item.price)),
    normalizePieceCount(item.piece_count) ?? "",
    item.type,
  ].join("|");
}

function isExtendedCandidateColumnError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return [
    "list_price_idr",
    "package_price_idr",
    "net_price_idr",
    "promo_type",
    "candidate_key",
    "source_image_id",
    "source_image_path",
    "source_row_index",
    "price_evidence_reason_code",
    "ai_match_rule_version",
    "ai_match_method",
    "ai_match_evidence",
  ].some((column) => message.includes(column));
}

function isCandidateKeyColumnError(error: { message?: string } | null) {
  return (error?.message ?? "").includes("candidate_key");
}

function isMissingCandidateTableError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message.includes("ai_price_candidates")
    && (message.includes("Could not find the table") || message.includes("does not exist"));
}

function candidateProductKey(value: string) {
  return normalizeText(value)
    .replace(/\bpromo\b/g, " ")
    .replace(/\bpcs?\b/g, " ")
    .replace(/\bpieces?\b/g, " ")
    .replace(/\b(\d{1,3})(\s*$)/, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function materialLabel(item: MaterialMaster) {
  return `${item.tenant_sku_code} ${item.tenant_sku_name}`;
}

function competitorLabel(item: CompetitorProduct) {
  return `${item.brands?.name ?? ""} ${item.normalized_name}`.trim();
}

export type ProductMatchContext = {
  index: CompiledProductMatchIndex;
  rules: MatchRuleSet;
};

function materialMatchMaster(item: MaterialMaster): ProductMatchMaster {
  return {
    id: item.tenant_sku_code,
    entityType: "material_master",
    code: item.tenant_sku_code,
    active: new Date(item.f_expiry_date).getTime() >= Date.now(),
    signature: {
      brand: item.brand,
      series: item.sub_brand,
      packageLevel: null,
      shape: null,
      size: item.sub_type,
      pieceCount: normalizePieceCount(item.pack_count),
      version: null,
    },
    raw: {
      brand: item.brand,
      name: item.tenant_sku_name,
      title: [item.tenant_sku_name, item.category, item.sub_category, item.type].filter(Boolean).join(" "),
      shape: [item.tenant_sku_name, item.sub_category, item.type].filter(Boolean).join(" "),
      label: materialLabel(item),
      source: item,
    },
  };
}

function competitorMatchMaster(item: CompetitorProduct): ProductMatchMaster {
  return {
    id: item.id,
    entityType: "competitor_product",
    code: item.competitor_sku_code ?? null,
    active: item.status !== "disabled",
    signature: {
      brand: item.brands?.name ?? null,
      series: item.product_series ?? null,
      packageLevel: item.package_type ?? null,
      shape: null,
      size: item.size,
      pieceCount: normalizePieceCount(item.piece_count),
      version: null,
    },
    raw: {
      brand: item.brands?.name ?? null,
      name: item.normalized_name,
      title: item.raw_title,
      shape: item.pack_type,
      packageLevel: item.package_type,
      label: competitorLabel(item),
      source: item,
    },
  };
}

export async function loadProductMatchContext(supabase: SupabaseServiceClient = createSupabaseServiceClient()): Promise<ProductMatchContext> {
  const [{ data: materials, error: materialError }, { data: products, error: productError }, { data: normalizationRows, error: normalizationError }] = await Promise.all([
    supabase.from("material_master").select("*").limit(5000),
    supabase.from("competitor_products").select("*, brands(id,name)").eq("status", "active").limit(5000),
    supabase.from("product_match_normalizations").select("id,field,brand_scope,source_value,canonical_value,active").eq("active", true).limit(5000),
  ]);
  if (materialError) throw new Error(materialError.message);
  if (productError) throw new Error(productError.message);
  if (normalizationError && !normalizationError.message.includes("product_match_normalizations")) throw new Error(normalizationError.message);
  const masters = [
    ...(materials ?? []).map((item) => materialMatchMaster(item as MaterialMaster)),
    ...(products ?? []).map((item) => competitorMatchMaster(item as CompetitorProduct)),
  ];
  const normalizations = compileProductMatchNormalizations(
    (normalizationRows ?? []) as ProductMatchNormalizationRule[],
    {
      brand: masters.map((master) => master.signature?.brand ?? ""),
      series: masters.map((master) => master.signature?.series ?? ""),
      size: masters.map((master) => master.signature?.size ?? ""),
      piece_count: masters.map((master) => master.signature?.pieceCount ?? ""),
    },
  );
  const rules = createProductMatchRulesV2(normalizations);
  return { index: compileProductMatchIndex(masters, rules), rules };
}

function productMatchEvidence(item: AiPriceCandidateSourceItem, pieceCount: number | null) {
  return {
    code: String(item.product ?? "").trim() || null,
    entityType: null,
    signature: {
      brand: item.brand,
      series: item.productFamilyText ?? null,
      packageLevel: null,
      shape: null,
      size: null,
      pieceCount,
      version: null,
    },
    sources: ["brand", "product_family_text", "section_title", "sku", "row_anchor", "piece_count"]
      .filter((key) => {
        const values: Record<string, unknown> = {
          brand: item.brand,
          product_family_text: item.productFamilyText,
          section_title: item.sectionTitle,
          sku: item.product,
          row_anchor: item.rowAnchor,
          piece_count: pieceCount,
        };
        return values[key] !== null && values[key] !== undefined && String(values[key]).trim() !== "";
      }),
    raw: {
      brand: item.brand,
      productFamilyText: item.productFamilyText,
      sectionTitle: item.sectionTitle,
      sku: item.product,
      rowAnchor: item.rowAnchor,
      pieceCount,
    },
  };
}

function isPriceCandidate(item: AiPriceCandidateSourceItem) {
  if (!item.product) return false;
  if (item.tag === "ANOMALY") return false;
  if (hasNonPricePromotionText(item)) return false;
  return parseCandidatePrice(item.price) !== null;
}

function sourceItems(aiResult: StoreVisitAiResult) {
  const keySkuItems: AiPriceCandidateSourceItem[] = aiResult.price_insights.key_sku_prices.map((item) => ({
    brand: item.brand,
    product: item.product,
    price: item.price,
    list_price: item.list_price ?? item.price,
    package_price: item.package_price ?? item.price,
    net_price: item.net_price ?? item.price,
    promo_type: item.promo_type ?? null,
    piece_count: normalizePieceCountFromCandidates(item.piece_count, item.product),
    raw_piece_count_text: item.piece_count_text ?? null,
    raw_package_price_text: item.package_price_text ?? null,
    raw_net_price_text: item.net_price_text ?? null,
    raw_price_per_piece_text: item.visible_price_per_piece_text ?? null,
    visible_price_per_piece_idr: item.visible_price_per_piece_idr ?? null,
    price_basis: item.price_basis ?? null,
    type: "SKU" as const,
    tag: item.tag,
    confidence: item.confidence,
    source: "key_sku" as const,
  })).filter(isPriceCandidate);

  const rawItems = aiResult.raw_extraction.detected_items
    .filter((item) => item.type === "SKU" || item.type === "PROMO")
    .map((item): AiPriceCandidateSourceItem => ({
      brand: item.brand,
      product: item.product,
      price: item.price,
      list_price: item.price,
      package_price: item.price,
      net_price: item.price,
      promo_type: null,
      piece_count: extractPieceCount(item.product),
      type: item.type === "PROMO" ? "PROMO" : "SKU",
      confidence: item.confidence,
      source: "raw",
    }))
    .filter(isPriceCandidate);

  return [...keySkuItems, ...rawItems];
}

function buildAiPriceCandidateRow(input: {
  visitId: string;
  item: AiPriceCandidateSourceItem;
  matchContext: ProductMatchContext;
}) {
  const { item } = input;
  const parsedPrice = parseCandidatePrice(item.price);
  const pieceCountResolution = resolveTrustedPieceCount({
    productTitle: item.product,
    extractedValue: item.piece_count,
    extractedText: item.raw_piece_count_text,
    sourceLabel: item.piece_count_source_label,
  });
  const pieceCount = pieceCountResolution.pieceCount;
  const visiblePricePerPiece = parseCandidatePrice(item.raw_price_per_piece_text) ?? item.visible_price_per_piece_idr ?? null;
  const reconciledPrices = reconcilePackagePriceMetrics({
    listPriceIdr: parseCandidatePrice(item.list_price) ?? parsedPrice,
    packagePriceIdr: parseCandidatePrice(item.package_price) ?? parsedPrice,
    netPriceIdr: parseCandidatePrice(item.net_price) ?? parsedPrice,
    pieceCount,
    visiblePricePerPieceIdr: visiblePricePerPiece,
    listPriceText: item.list_price,
    packagePriceText: item.package_price,
    netPriceText: item.net_price,
    visiblePricePerPieceText: item.raw_price_per_piece_text,
    pieceCountText: item.raw_piece_count_text,
    skuText: item.product,
    listPriceConfidence: item.normal_package_price_confidence ?? null,
    packagePriceConfidence: item.promo_package_price_confidence ?? item.normal_package_price_confidence ?? null,
    netPriceConfidence: item.promo_package_price_confidence ?? item.normal_package_price_confidence ?? null,
    visiblePricePerPieceConfidence: item.promo_per_piece_price_confidence ?? item.normal_per_piece_price_confidence ?? null,
    pieceCountConfidence: item.piece_count_confidence ?? null,
    rowBindingConfidence: item.row_binding_confidence ?? null,
    sectionBindingConfidence: item.section_binding_confidence ?? null,
    productIdentityConfidence: item.product_identity_confidence ?? null,
  });
  const listPrice = reconciledPrices.listPriceIdr ?? parsedPrice;
  const packagePrice = reconciledPrices.packagePriceIdr ?? parsedPrice;
  const netPrice = reconciledPrices.netPriceIdr ?? parsedPrice;
  const pricePerPiece = reconciledPrices.pricePerPieceIdr;
  const priceEvidenceStatus = item.price_evidence_status ?? reconciledPrices.priceEvidenceStatus;
  const priceEvidenceDetail = {
    ...(item.price_evidence_detail ?? reconciledPrices.priceEvidenceDetail),
    piece_count_source: pieceCountResolution.source,
    piece_count_source_label: item.piece_count_source_label ?? null,
  };
  const priceEvidenceReasonCode = derivePriceEvidenceReasonCode({
    status: priceEvidenceStatus,
    detail: priceEvidenceDetail,
  });
  const evidenceReviewDecision = item.review_decision ?? reconciledPrices.reviewDecision;
  const warnings: Warning[] = [];
  if (!item.brand) warnings.push({ type: "MISSING_DATA", message: "AI did not extract a brand." });
  if (!item.product) warnings.push({ type: "MISSING_DATA", message: "AI did not extract a product name." });
  if (!parsedPrice) warnings.push({ type: "MISSING_DATA", message: "AI price could not be parsed into a number." });
  if (!pieceCount) warnings.push({ type: "MISSING_DATA", message: "Missing piece count; per-piece price cannot be calculated." });
  if (item.confidence === null) warnings.push({ type: "PARSE_RISK", message: "Legacy visual association confidence is missing; manual review required." });
  if (item.confidence !== null && item.confidence < 0.5) warnings.push({ type: "LOW_CONFIDENCE", message: "AI extraction confidence is below 50%." });
  if (reconciledPrices.warningMessage) {
    warnings.push({ type: "PARSE_RISK", message: reconciledPrices.warningMessage });
  }

  const productMatch = matchProduct(productMatchEvidence(item, pieceCount), input.matchContext.index, input.matchContext.rules);
  const matchScore = productMatch.product ? 1 : 0;
  const matchedEntityType = productMatch.product?.entityType ?? "unmatched";
  const matchedEntityId = productMatch.product?.id ?? null;
  const matchedLabel = String(productMatch.product?.raw.label ?? "").trim() || null;
  const itemCandidateKey = candidateKey({
    item,
    matchedEntityType,
    matchedEntityId,
    netPrice,
  });
  if (!productMatch.product) warnings.push({ type: "LOW_CONFIDENCE", message: `No deterministic product match: ${productMatch.reason ?? "UNMATCHED"}.` });

  return {
    visit_id: input.visitId,
    candidate_key: itemCandidateKey,
    source_image_id: item.sourceImageId ?? null,
    source_image_path: item.sourceImagePath ?? null,
    source_row_index: item.sourceRowIndex ?? null,
    raw_brand: item.brand,
    raw_product: item.product,
    raw_price: item.price,
    ai_matched_entity_type: matchedEntityType,
    ai_matched_entity_id: matchedEntityId,
    ai_matched_label: matchedLabel,
    ai_match_rule_version: productMatch.ruleVersion,
    ai_match_method: productMatch.method,
    ai_match_evidence: productMatch.evidence,
    ai_list_price_idr: listPrice,
    ai_package_price_idr: packagePrice,
    ai_net_price_idr: netPrice,
    ai_piece_count: pieceCount,
    ai_price_per_piece: pricePerPiece,
    ai_promo_type: normalizePromoType(item.promo_type),
    parsed_price_idr: netPrice,
    list_price_idr: listPrice,
    package_price_idr: packagePrice,
    net_price_idr: netPrice,
    raw_piece_count_text: item.raw_piece_count_text ?? null,
    raw_package_price_text: item.raw_package_price_text ?? null,
    raw_net_price_text: item.raw_net_price_text ?? null,
    raw_price_per_piece_text: item.raw_price_per_piece_text ?? null,
    visible_price_per_piece_idr: reconciledPrices.visiblePricePerPieceIdr,
    price_basis: reconciledPrices.priceBasis,
    promo_type: normalizePromoType(item.promo_type),
    piece_count: pieceCount,
    price_per_piece: pricePerPiece,
    candidate_type: item.type,
    ai_confidence: item.confidence,
    legacy_confidence_fallback: item.legacy_confidence_fallback ?? item.confidence === null,
    price_evidence_status: priceEvidenceStatus,
    price_evidence_confidence: item.price_evidence_confidence ?? reconciledPrices.priceEvidenceConfidence,
    price_evidence_detail: priceEvidenceDetail,
    price_evidence_reason_code: priceEvidenceReasonCode,
    conflicts: item.conflicts ?? reconciledPrices.conflicts,
    evidence_review_decision: evidenceReviewDecision,
    review_decision: evidenceReviewDecision,
    quality_gate_status: item.type === "SKU" ? "PENDING" : "NOT_REQUIRED",
    quality_gate_reason_codes: [],
    quality_gate_version: null,
    matched_entity_type: matchedEntityType,
    matched_entity_id: matchedEntityId,
    matched_label: matchedLabel,
    match_score: matchScore,
    warnings,
    status: "pending",
  };
}

type AiPriceCandidateInsertRow = ReturnType<typeof buildAiPriceCandidateRow>;
type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export async function buildAiPriceCandidateRows(input: {
  visitId: string;
  sourceItems: AiPriceCandidateSourceItem[];
  matchContext?: ProductMatchContext;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const items = input.sourceItems
    .map((item) => ({
      ...item,
      piece_count: resolveTrustedPieceCount({
        productTitle: item.product,
        extractedValue: item.piece_count,
        extractedText: item.raw_piece_count_text,
        sourceLabel: item.piece_count_source_label,
      }).pieceCount,
    }))
    .filter(isH5VisiblePriceCandidate);
  const scopedItems = items.filter((item) => item.sourceImageId);
  if (scopedItems.length === 0) return [];

  const matchContext = input.matchContext ?? await loadProductMatchContext(supabase);

  return scopedItems.map((item) => buildAiPriceCandidateRow({
    visitId: input.visitId,
    item,
    matchContext,
  }));
}

export async function insertAiPriceCandidateRows(input: {
  visitId: string;
  rows: AiPriceCandidateInsertRow[];
  affectedImageIds?: string[];
  preserveExistingCandidates?: boolean;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  if (input.rows.length === 0) return [];

  if (!input.preserveExistingCandidates) {
    const { error: deleteError } = await (input.affectedImageIds && input.affectedImageIds.length > 0
      ? supabase
        .from("ai_price_candidates")
        .delete()
        .eq("visit_id", input.visitId)
        .in("source_image_id", input.affectedImageIds)
      : supabase
        .from("ai_price_candidates")
        .delete()
        .eq("visit_id", input.visitId));
    if (deleteError) throw new Error(deleteError.message);
  } else if (input.affectedImageIds && input.affectedImageIds.length > 0) {
    // When preserving existing candidates but reanalyzing specific images,
    // delete old candidates from those specific images to avoid duplicate key conflicts
    const { error: deleteError } = await supabase
      .from("ai_price_candidates")
      .delete()
      .eq("visit_id", input.visitId)
      .in("source_image_id", input.affectedImageIds);
    if (deleteError) throw new Error(deleteError.message);
  }

  const { data: activeCandidateRows, error: activeCandidateError } = await supabase
    .from("ai_price_candidates")
    .select("candidate_key")
    .eq("visit_id", input.visitId)
    .in("status", ["pending", "approved"]);
  if (activeCandidateError && !isCandidateKeyColumnError(activeCandidateError)) {
    throw new Error(activeCandidateError.message);
  }
  const activeCandidateKeys = (activeCandidateRows ?? [])
    .map((row) => (row as { candidate_key?: string | null }).candidate_key)
    .filter(Boolean) as string[];
  const existingActiveKeys = new Set(activeCandidateKeys);

  const seenInsertKeys = new Set<string>();
  const rows = input.rows.filter((row) => {
    if (existingActiveKeys.has(row.candidate_key) || seenInsertKeys.has(row.candidate_key)) return false;
    seenInsertKeys.add(row.candidate_key);
    return true;
  });

  if (rows.length === 0) return [];

  let { data, error } = await supabase
    .from("ai_price_candidates")
    .insert(rows)
    .select(candidateVisitSelect);

  if (isExtendedCandidateColumnError(error)) {
    const legacyRows = rows.map(({
      source_row_index: _sourceRowIndex,
      price_evidence_reason_code: _priceEvidenceReasonCode,
      ai_match_rule_version: _aiMatchRuleVersion,
      ai_match_method: _aiMatchMethod,
      ai_match_evidence: _aiMatchEvidence,
      ...row
    }) => {
      void _sourceRowIndex;
      void _priceEvidenceReasonCode;
      void _aiMatchRuleVersion;
      void _aiMatchMethod;
      void _aiMatchEvidence;
      return row;
    });
    const legacyInsert = await supabase
      .from("ai_price_candidates")
      .insert(legacyRows)
      .select(candidateVisitSelect);
    data = legacyInsert.data;
    error = legacyInsert.error;
  }

  if (isMissingCandidateTableError(error)) {
    return [];
  }
  if (error) throw new Error(error.message);
  return (data ?? []) as AiPriceCandidate[];
}

export async function generateAiPriceCandidates(input: CandidateInput) {
  if (!hasSupabaseServiceConfig()) return [];
  const supabase = createSupabaseServiceClient();
  const rows = await buildAiPriceCandidateRows({
    visitId: input.visitId,
    sourceItems: input.sourceItems ?? sourceItems(input.aiResult),
    supabase,
  });
  return insertAiPriceCandidateRows({
    visitId: input.visitId,
    rows,
    affectedImageIds: input.affectedImageIds,
    supabase,
  });
}
