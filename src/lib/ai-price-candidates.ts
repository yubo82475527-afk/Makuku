import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";
import { calculatePricePerPiece, parseIdrPrice } from "@/lib/price-utils";
import { normalizePieceCount, normalizePieceCountFromCandidates, parsePieceCountText } from "@/lib/piece-count";
import type { AiPriceCandidate, CompetitorProduct, MaterialMaster, StoreVisitAiResult } from "@/lib/types";

type Warning = { type: string; message: string };

type SkuMatchAttributes = {
  normalizedText: string;
  series: string | null;
  size: string | null;
  pieceCount: number | null;
  format: "tape" | "pants" | null;
};

type RankedSkuCandidate<T> = {
  item: T;
  score: number;
  rank: {
    tokenCoverage: number;
    formatScore: number;
    packageExpressionScore: number;
    activeScore: number;
  };
};

type CandidateInput = {
  visitId: string;
  aiResult: StoreVisitAiResult;
  sourceItems?: SourceItem[];
  affectedImageIds?: string[];
};

type SourceItem = {
  brand: string;
  product: string;
  price: string;
  list_price?: string | null;
  package_price?: string | null;
  net_price?: string | null;
  promo_type?: string | null;
  piece_count: number | null;
  type: "SKU" | "PROMO";
  tag?: string | null;
  confidence: number;
  source: "key_sku" | "raw";
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

function tokens(value: string | null | undefined) {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

function tokenScore(query: string, target: string) {
  const queryTokens = tokens(query);
  if (queryTokens.length === 0) return 0;
  const targetText = normalizeText(target);
  const hits = queryTokens.filter((token) => targetText.includes(token)).length;
  return hits / queryTokens.length;
}

function compactText(value: string | null | undefined) {
  return normalizeText(value).replace(/\s+/g, "");
}

function seriesKey(value: string | null | undefined) {
  return normalizeText(value).replace(/\b(?:makuku|air|diapers?|3|0|2)\b/g, " ").replace(/\s+/g, " ").trim() || null;
}

function extractKnownSeries(value: string | null | undefined) {
  const text = normalizeText(value);
  if (text.includes("pro care")) return "pro care";
  if (text.includes("dry care")) return "dry care";
  if (text.includes("comfort fit")) return "comfort fit";
  if (text.includes("skin health")) return "skin health";
  if (text.includes("slim")) return "slim";
  return null;
}

function extractFormat(value: string | null | undefined): "tape" | "pants" | null {
  const text = normalizeText(value);
  if (text.includes("tape")) return "tape";
  if (text.includes("pants") || text.includes("celana")) return "pants";
  return null;
}

function normalizedPackageExpression(size: string | null, pieceCount: number | null) {
  return size && pieceCount ? `${size.toLowerCase()}${pieceCount}` : null;
}

function hasPackageExpression(text: string, size: string | null, pieceCount: number | null) {
  const expression = normalizedPackageExpression(size, pieceCount);
  if (!expression) return false;
  return compactText(text).includes(expression);
}

export function extractSkuMatchAttributes(
  text: string | null | undefined,
  structuredFields?: {
    series?: string | null;
    size?: string | null;
    pieceCount?: number | null;
    format?: "tape" | "pants" | string | null;
  },
): SkuMatchAttributes {
  const normalizedText = normalizeText(text);
  const normalizedFormat = extractFormat(structuredFields?.format) ?? extractFormat(text);
  return {
    normalizedText,
    series: seriesKey(structuredFields?.series) ?? extractKnownSeries(text),
    size: normalizedMaterialSize(structuredFields?.size) ?? extractCandidateSize(text),
    pieceCount: normalizePieceCount(structuredFields?.pieceCount) ?? extractPieceCount(text),
    format: normalizedFormat === "tape" || normalizedFormat === "pants" ? normalizedFormat : null,
  };
}

function seriesMatches(candidate: SkuMatchAttributes, target: SkuMatchAttributes) {
  if (!target.series) return false;
  if (candidate.series && candidate.series === target.series) return true;
  return candidate.normalizedText.includes(target.series);
}

export function skuAttributesHardMatch(candidate: SkuMatchAttributes, target: SkuMatchAttributes) {
  if (!seriesMatches(candidate, target)) return false;
  if (!candidate.size || !target.size || candidate.size !== target.size) return false;
  if (!candidate.pieceCount || !target.pieceCount || candidate.pieceCount !== target.pieceCount) return false;
  return true;
}

function compareRank(left: RankedSkuCandidate<unknown>, right: RankedSkuCandidate<unknown>) {
  return left.rank.tokenCoverage - right.rank.tokenCoverage
    || left.rank.formatScore - right.rank.formatScore
    || left.rank.packageExpressionScore - right.rank.packageExpressionScore
    || left.rank.activeScore - right.rank.activeScore;
}

function sameRank(left: RankedSkuCandidate<unknown>, right: RankedSkuCandidate<unknown>) {
  return compareRank(left, right) === 0;
}

export function rankHardMatchedSkuCandidate<T>({
  candidate,
  target,
  item,
  targetText,
  active,
}: {
  candidate: SkuMatchAttributes;
  target: SkuMatchAttributes;
  item: T;
  targetText: string;
  active?: boolean;
}): RankedSkuCandidate<T> {
  return {
    item,
    score: 1,
    rank: {
      tokenCoverage: tokenScore(candidate.normalizedText, targetText),
      formatScore: candidate.format && target.format && candidate.format === target.format ? 1 : 0,
      packageExpressionScore: hasPackageExpression(targetText, candidate.size, candidate.pieceCount) ? 1 : 0,
      activeScore: active === false ? 0 : 1,
    },
  };
}

export function pickUniqueHardMatchedCandidate<T>(ranked: RankedSkuCandidate<T>[]) {
  if (ranked.length === 0) return null;
  const sorted = [...ranked].sort((left, right) => compareRank(right, left));
  if (sorted.length > 1 && sameRank(sorted[0], sorted[1])) return null;
  return { item: sorted[0].item, score: sorted[0].score };
}

function competitorBrandsMatch(candidateBrand: string | null | undefined, productBrand: string | null | undefined) {
  const candidate = compactText(candidateBrand);
  const product = compactText(productBrand);
  if (!candidate || !product) return false;
  return candidate === product;
}

function extractPieceCount(value: string | null | undefined) {
  return parsePieceCountText(value);
}

function extractCandidateSize(value: string | null | undefined) {
  const text = String(value ?? "");
  const match = text.match(/\b(nb|xxxxl|xxxl|xxl|xl|l|m|s)\s*(?:\d{1,3})?\b/i);
  return match ? match[1].toUpperCase() : null;
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

function candidateKey({
  item,
  matchedEntityType,
  matchedEntityId,
  netPrice,
}: {
  item: SourceItem;
  matchedEntityType: "material_master" | "competitor_product" | "unmatched";
  matchedEntityId: string | null;
  netPrice: number | null;
}) {
  if (item.sourceImageId && matchedEntityId && netPrice) {
    return [
      "image_entity_price",
      item.sourceImageId,
      matchedEntityType,
      matchedEntityId,
      String(netPrice),
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

function isMakukuBrand(brand: string) {
  return normalizeText(brand).includes("makuku");
}

function materialLabel(item: MaterialMaster) {
  return `${item.tenant_sku_code} ${item.tenant_sku_name}`;
}

function competitorLabel(item: CompetitorProduct) {
  return `${item.brands?.name ?? ""} ${item.normalized_name}`.trim();
}

function normalizedMaterialSize(value: string | null | undefined) {
  const text = String(value ?? "").trim().toUpperCase();
  return text || null;
}

function normalizedCompetitorSize(value: string | null | undefined) {
  const directSize = String(value ?? "").trim().toUpperCase();
  if (directSize) return directSize;
  return null;
}

function materialTargetAttributes(item: MaterialMaster) {
  return extractSkuMatchAttributes(
    [item.tenant_sku_name, item.type, item.sub_type, item.pack_count].filter(Boolean).join(" "),
    {
      series: item.sub_brand,
      size: item.sub_type,
      pieceCount: normalizePieceCount(item.pack_count),
      format: extractFormat([item.tenant_sku_name, item.sub_category, item.type].filter(Boolean).join(" ")),
    },
  );
}

export function pickBestMaterialForCandidate(candidate: { brand: string; product: string; parsedPrice: number | null; pieceCount: number | null }, materials: MaterialMaster[]) {
  const candidateAttributes = extractSkuMatchAttributes(candidate.product, {
    pieceCount: normalizePieceCount(candidate.pieceCount),
  });
  const ranked = materials.flatMap((item) => {
    const target = materialTargetAttributes(item);
    if (!skuAttributesHardMatch(candidateAttributes, target)) return [];
    return rankHardMatchedSkuCandidate({
      candidate: candidateAttributes,
      target,
      item,
      targetText: [item.tenant_sku_name, item.type, item.sub_type, item.pack_count].filter(Boolean).join(" "),
    });
  });
  return pickUniqueHardMatchedCandidate(ranked);
}

function pickBestMaterial(candidate: { brand: string; product: string; parsedPrice: number | null; pieceCount: number | null }, materials: MaterialMaster[]) {
  const best = pickBestMaterialForCandidate(candidate, materials);
  if (!best) return null;
  if (best.score < 0.65) return null;
  return best;
}

function competitorTargetAttributes(item: CompetitorProduct) {
  const targetText = [item.product_series, item.normalized_name, item.raw_title, item.size, item.piece_count].filter(Boolean).join(" ");
  return extractSkuMatchAttributes(targetText, {
    series: item.product_series,
    size: normalizedCompetitorSize(item.size) ?? extractCandidateSize(item.normalized_name) ?? extractCandidateSize(item.raw_title),
    pieceCount: normalizePieceCount(item.piece_count),
    format: extractFormat(targetText),
  });
}

export function pickBestCompetitorForCandidate(candidate: { brand: string; product: string; pieceCount: number | null }, products: CompetitorProduct[]) {
  const candidateAttributes = extractSkuMatchAttributes(candidate.product, {
    pieceCount: normalizePieceCount(candidate.pieceCount),
  });
  const brandMatchedProducts = products.filter((item) => competitorBrandsMatch(candidate.brand, item.brands?.name));
  const ranked = brandMatchedProducts.flatMap((item) => {
    const target = competitorTargetAttributes(item);
    if (!skuAttributesHardMatch(candidateAttributes, target)) return [];
    return rankHardMatchedSkuCandidate({
      candidate: candidateAttributes,
      target,
      item,
      targetText: [item.product_series, item.normalized_name, item.raw_title, item.size, item.piece_count].filter(Boolean).join(" "),
      active: item.status !== "disabled",
    });
  });
  return pickUniqueHardMatchedCandidate(ranked);
}

function pickBestCompetitor(candidate: { brand: string; product: string; pieceCount: number | null }, products: CompetitorProduct[]) {
  const best = pickBestCompetitorForCandidate(candidate, products);
  if (!best) return null;
  if (best.score < 0.65) return null;
  return best;
}

function isPriceCandidate(item: SourceItem) {
  if (!item.brand || !item.product) return false;
  if (item.confidence < 0.4) return false;
  if (item.tag === "ANOMALY") return false;
  if (hasNonPricePromotionText(item)) return false;
  return parseCandidatePrice(item.price) !== null;
}

function sourceItems(aiResult: StoreVisitAiResult) {
  const keySkuItems: SourceItem[] = aiResult.price_insights.key_sku_prices.map((item) => ({
    brand: item.brand,
    product: item.product,
    price: item.price,
    list_price: item.list_price ?? item.price,
    package_price: item.package_price ?? item.price,
    net_price: item.net_price ?? item.price,
    promo_type: item.promo_type ?? null,
    piece_count: normalizePieceCountFromCandidates(item.piece_count, item.product),
    type: "SKU" as const,
    tag: item.tag,
    confidence: item.confidence,
    source: "key_sku" as const,
  })).filter(isPriceCandidate);

  const rawItems = aiResult.raw_extraction.detected_items
    .filter((item) => item.type === "SKU" || item.type === "PROMO")
    .map((item): SourceItem => ({
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

export async function generateAiPriceCandidates(input: CandidateInput) {
  if (!hasSupabaseServiceConfig()) return [];
  const supabase = createSupabaseServiceClient();
  const items = (input.sourceItems?.map((item) => ({
    ...item,
    piece_count: normalizePieceCountFromCandidates(item.piece_count, item.product),
  })).filter(isPriceCandidate)) ?? sourceItems(input.aiResult);
  if (items.length === 0) return [];

  if (input.affectedImageIds && input.affectedImageIds.length > 0) {
    await supabase
      .from("ai_price_candidates")
      .delete()
      .eq("visit_id", input.visitId)
      .in("source_image_id", input.affectedImageIds)
      .neq("status", "approved");
  } else {
    await supabase
      .from("ai_price_candidates")
      .delete()
      .eq("visit_id", input.visitId)
      .neq("status", "approved");
  }

  const { data: approvedCandidateRows, error: approvedCandidateError } = await supabase
    .from("ai_price_candidates")
    .select("candidate_key")
    .eq("visit_id", input.visitId)
    .eq("status", "approved");
  if (approvedCandidateError && !isCandidateKeyColumnError(approvedCandidateError)) {
    throw new Error(approvedCandidateError.message);
  }
  const approvedCandidateKeys = (approvedCandidateRows ?? [])
    .map((row) => (row as { candidate_key?: string | null }).candidate_key)
    .filter(Boolean) as string[];
  const existingApprovedKeys = new Set(approvedCandidateKeys);

  const [{ data: materials }, { data: products }] = await Promise.all([
    supabase.from("material_master").select("*").limit(5000),
    supabase.from("competitor_products").select("*, brands(id,name)").limit(5000),
  ]);

  const rows = items.map((item) => {
    const parsedPrice = parseCandidatePrice(item.price);
    const listPrice = parseCandidatePrice(item.list_price) ?? parsedPrice;
    const packagePrice = parseCandidatePrice(item.package_price) ?? parsedPrice;
    const netPrice = parseCandidatePrice(item.net_price) ?? parsedPrice;
    const pieceCount = normalizePieceCount(item.piece_count);
    const pricePerPiece = calculatePricePerPiece(netPrice, pieceCount);
    const warnings: Warning[] = [];
    if (!item.brand) warnings.push({ type: "MISSING_DATA", message: "AI did not extract a brand." });
    if (!item.product) warnings.push({ type: "MISSING_DATA", message: "AI did not extract a product name." });
    if (!parsedPrice) warnings.push({ type: "MISSING_DATA", message: "AI price could not be parsed into a number." });
    if (!pieceCount) warnings.push({ type: "MISSING_DATA", message: "Missing piece count; per-piece price cannot be calculated." });
    if (item.confidence < 0.5) warnings.push({ type: "LOW_CONFIDENCE", message: "AI extraction confidence is below 50%." });

    const isOwnBrandCandidate = isMakukuBrand(item.brand);
    const materialMatch = isOwnBrandCandidate
      ? pickBestMaterial({ brand: item.brand, product: item.product, parsedPrice, pieceCount }, (materials ?? []) as MaterialMaster[])
      : null;
    const competitorMatch = !materialMatch && !isOwnBrandCandidate
      ? pickBestCompetitor({ brand: item.brand, product: item.product, pieceCount }, (products ?? []) as CompetitorProduct[])
      : null;
    const matchScore = materialMatch?.score ?? competitorMatch?.score ?? 0;
    const matchedEntityType = materialMatch ? "material_master" : competitorMatch ? "competitor_product" : "unmatched";
    const matchedEntityId = materialMatch?.item.tenant_sku_code ?? competitorMatch?.item.id ?? null;
    const itemCandidateKey = candidateKey({
      item,
      matchedEntityType,
      matchedEntityId,
      netPrice,
    });
    if (matchScore < 0.65) warnings.push({ type: "LOW_CONFIDENCE", message: "No reliable product/master-data match found." });

    return {
      visit_id: input.visitId,
      candidate_key: itemCandidateKey,
      source_image_id: item.sourceImageId ?? null,
      source_image_path: item.sourceImagePath ?? null,
      raw_brand: item.brand,
      raw_product: item.product,
      raw_price: item.price,
      parsed_price_idr: netPrice,
      list_price_idr: listPrice,
      package_price_idr: packagePrice,
      net_price_idr: netPrice,
      promo_type: normalizePromoType(item.promo_type),
      piece_count: pieceCount,
      price_per_piece: pricePerPiece,
      candidate_type: item.type,
      ai_confidence: item.confidence,
      matched_entity_type: matchedEntityType,
      matched_entity_id: matchedEntityId,
      matched_label: materialMatch ? materialLabel(materialMatch.item) : competitorMatch ? competitorLabel(competitorMatch.item) : null,
      match_score: matchScore,
      warnings,
      status: "pending",
    };
  }).filter((row) => !existingApprovedKeys.has(row.candidate_key));

  if (rows.length === 0) return [];

  let { data, error } = await supabase
    .from("ai_price_candidates")
    .insert(rows)
    .select(candidateVisitSelect);

  if (isExtendedCandidateColumnError(error)) {
    const legacyRows = rows.map((row) => {
      const legacyRow = { ...row } as Record<string, unknown>;
      delete legacyRow.list_price_idr;
      delete legacyRow.package_price_idr;
      delete legacyRow.net_price_idr;
      delete legacyRow.promo_type;
      delete legacyRow.candidate_key;
      delete legacyRow.source_image_id;
      delete legacyRow.source_image_path;
      return legacyRow;
    });
    const legacyResult = await supabase
      .from("ai_price_candidates")
      .insert(legacyRows)
      .select(candidateVisitSelect);
    data = legacyResult.data;
    error = legacyResult.error;
  }

  if (isMissingCandidateTableError(error)) {
    return [];
  }
  if (error) throw new Error(error.message);
  return (data ?? []) as AiPriceCandidate[];
}
