import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";
import { calculatePricePerPiece, parseIdrPrice } from "@/lib/price-utils";
import { normalizePieceCount, normalizePieceCountFromCandidates, parsePieceCountText } from "@/lib/piece-count";
import type { AiPriceCandidate, CompetitorProduct, MaterialMaster, StoreVisitAiResult } from "@/lib/types";

type Warning = { type: string; message: string };

type CandidateInput = {
  visitId: string;
  aiResult: StoreVisitAiResult;
  sourceItems?: SourceItem[];
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

function candidateKey(item: SourceItem) {
  const parsedPrice = parseCandidatePrice(item.net_price) ?? parseCandidatePrice(item.price);
  if (item.sourceImageId && item.sourceRowIndex !== null && item.sourceRowIndex !== undefined) {
    return ["image_row", item.sourceImageId, item.sourceRowIndex].join("|");
  }
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

function materialCandidateRank(candidate: { brand: string; product: string; parsedPrice: number | null; pieceCount: number | null; size: string | null }, item: MaterialMaster) {
  const materialSize = normalizedMaterialSize(item.sub_type);
  const materialPieceCount = normalizePieceCount(item.pack_count);
  const sizeScore = candidate.size && materialSize === candidate.size ? 1 : 0;
  const pieceScore = candidate.pieceCount && materialPieceCount === candidate.pieceCount ? 1 : 0;
  const brandScore = tokenScore(candidate.brand, [item.brand, item.sub_brand].filter(Boolean).join(" "));
  const productScore = tokenScore(candidate.product, [item.tenant_sku_name, item.type, item.sub_type, item.pack_count].filter(Boolean).join(" "));
  const priceScore = candidate.parsedPrice && item.pcs_price
    ? Math.max(0, 1 - Math.min(Math.abs(candidate.parsedPrice - item.pcs_price) / Math.max(item.pcs_price, 1), 1))
    : 0;
  return {
    sizeScore,
    pieceScore,
    brandScore,
    productScore,
    priceScore,
    score: Math.min(1, pieceScore * 0.35 + sizeScore * 0.3 + brandScore * 0.15 + productScore * 0.15 + priceScore * 0.05),
  };
}

export function pickBestMaterialForCandidate(candidate: { brand: string; product: string; parsedPrice: number | null; pieceCount: number | null }, materials: MaterialMaster[]) {
  const size = extractCandidateSize(candidate.product);
  const pieceCount = normalizePieceCount(candidate.pieceCount);
  const enrichedCandidate = { ...candidate, pieceCount, size };
  const sizePieceExactMatches = size && pieceCount
    ? materials.filter((item) => normalizedMaterialSize(item.sub_type) === size && normalizePieceCount(item.pack_count) === pieceCount)
    : [];
  const candidateMaterials = sizePieceExactMatches.length > 0 ? sizePieceExactMatches : materials;
  let best: { item: MaterialMaster; score: number } | null = null;
  for (const item of candidateMaterials) {
    const rank = materialCandidateRank(enrichedCandidate, item);
    const score = sizePieceExactMatches.length > 0 ? rank.score : Math.min(rank.score, 0.64);
    const exactTieBreak = rank.pieceScore + rank.sizeScore;
    const bestRank = best ? materialCandidateRank(enrichedCandidate, best.item) : null;
    const bestTieBreak = bestRank ? bestRank.pieceScore + bestRank.sizeScore : -1;
    if (!best || score > best.score || score === best.score && exactTieBreak > bestTieBreak) {
      best = { item, score };
    }
  }
  return best;
}

function pickBestMaterial(candidate: { brand: string; product: string; parsedPrice: number | null; pieceCount: number | null }, materials: MaterialMaster[]) {
  const best = pickBestMaterialForCandidate(candidate, materials);
  if (!best) return null;
  if (best.score < 0.65) return null;
  return best;
}

function competitorCandidateRank(candidate: { brand: string; product: string; pieceCount: number | null; size: string | null }, item: CompetitorProduct) {
  const competitorSize = normalizedCompetitorSize(item.size) ?? extractCandidateSize(item.normalized_name) ?? extractCandidateSize(item.raw_title);
  const competitorPieceCount = normalizePieceCount(item.piece_count);
  const sizeScore = candidate.size && competitorSize === candidate.size ? 1 : 0;
  const pieceScore = candidate.pieceCount && competitorPieceCount === candidate.pieceCount ? 1 : 0;
  const brandScore = tokenScore(candidate.brand, item.brands?.name ?? "");
  const productScore = tokenScore(candidate.product, [item.normalized_name, item.raw_title, item.size, item.piece_count].filter(Boolean).join(" "));
  return {
    sizeScore,
    pieceScore,
    brandScore,
    productScore,
    score: Math.min(1, pieceScore * 0.4 + sizeScore * 0.3 + brandScore * 0.15 + productScore * 0.15),
  };
}

export function pickBestCompetitorForCandidate(candidate: { brand: string; product: string; pieceCount: number | null }, products: CompetitorProduct[]) {
  const size = extractCandidateSize(candidate.product);
  const pieceCount = normalizePieceCount(candidate.pieceCount);
  const brandMatchedProducts = products.filter((item) => competitorBrandsMatch(candidate.brand, item.brands?.name));
  const competitorSizePieceExactMatches = size && pieceCount
    ? brandMatchedProducts.filter((item) => {
      const itemSize = normalizedCompetitorSize(item.size) ?? extractCandidateSize(item.normalized_name) ?? extractCandidateSize(item.raw_title);
      return itemSize === size && normalizePieceCount(item.piece_count) === pieceCount;
    })
    : [];
  const candidateProducts = competitorSizePieceExactMatches.length > 0 ? competitorSizePieceExactMatches : brandMatchedProducts;
  let best: { item: CompetitorProduct; score: number } | null = null;
  const enrichedCandidate = { ...candidate, pieceCount, size };
  for (const item of candidateProducts) {
    const rank = competitorCandidateRank(enrichedCandidate, item);
    const score = competitorSizePieceExactMatches.length > 0 ? rank.score : Math.min(rank.score, 0.64);
    const exactTieBreak = rank.pieceScore + rank.sizeScore;
    const bestRank = best ? competitorCandidateRank(enrichedCandidate, best.item) : null;
    const bestTieBreak = bestRank ? bestRank.pieceScore + bestRank.sizeScore : -1;
    if (!best || score > best.score || score === best.score && exactTieBreak > bestTieBreak) {
      best = { item, score };
    }
  }
  return best;
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

  await supabase
    .from("ai_price_candidates")
    .delete()
    .eq("visit_id", input.visitId)
    .neq("status", "approved");

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
    const itemCandidateKey = candidateKey(item);
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
      matched_entity_type: materialMatch ? "material_master" : competitorMatch ? "competitor_product" : "unmatched",
      matched_entity_id: materialMatch?.item.tenant_sku_code ?? competitorMatch?.item.id ?? null,
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
