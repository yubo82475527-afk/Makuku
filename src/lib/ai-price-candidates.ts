import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";
import { calculatePricePerPiece, parseIdrPrice } from "@/lib/price-utils";
import type { AiPriceCandidate, CompetitorProduct, MaterialMaster, StoreVisitAiResult } from "@/lib/types";

type Warning = { type: string; message: string };

type CandidateInput = {
  visitId: string;
  aiResult: StoreVisitAiResult;
};

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

function normalizePieceCount(value: number | null | undefined) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
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

function pickBestMaterial(candidate: { brand: string; product: string; parsedPrice: number | null }, materials: MaterialMaster[]) {
  let best: { item: MaterialMaster; score: number } | null = null;
  for (const item of materials) {
    const brandScore = tokenScore(candidate.brand, [item.brand, item.sub_brand].filter(Boolean).join(" "));
    const productScore = tokenScore(candidate.product, [item.tenant_sku_name, item.type, item.sub_type, item.pack_count].filter(Boolean).join(" "));
    const priceScore = candidate.parsedPrice && item.pcs_price
      ? Math.max(0, 1 - Math.min(Math.abs(candidate.parsedPrice - item.pcs_price) / Math.max(item.pcs_price, 1), 1))
      : 0;
    const score = Math.min(1, brandScore * 0.35 + productScore * 0.5 + priceScore * 0.15);
    if (!best || score > best.score) best = { item, score };
  }
  return best;
}

function pickBestCompetitor(candidate: { brand: string; product: string }, products: CompetitorProduct[]) {
  let best: { item: CompetitorProduct; score: number } | null = null;
  for (const item of products) {
    const brandScore = tokenScore(candidate.brand, item.brands?.name ?? "");
    const productScore = tokenScore(candidate.product, [item.normalized_name, item.raw_title, item.size, item.piece_count].filter(Boolean).join(" "));
    const score = Math.min(1, brandScore * 0.45 + productScore * 0.55);
    if (!best || score > best.score) best = { item, score };
  }
  return best;
}

function sourceItems(aiResult: StoreVisitAiResult) {
  const keySkuItems = aiResult.price_insights.key_sku_prices.map((item) => ({
    brand: item.brand,
    product: item.product,
    price: item.price,
    piece_count: item.piece_count,
    type: "SKU" as const,
    confidence: item.confidence,
  }));

  const rawItems = aiResult.raw_extraction.detected_items
    .filter((item) => item.type === "SKU" || item.type === "PROMO")
    .map((item) => ({
      brand: item.brand,
      product: item.product,
      price: item.price,
      piece_count: null as number | null,
      type: item.type,
      confidence: item.confidence,
    }));

  const byKey = new Map<string, (typeof keySkuItems | typeof rawItems)[number]>();
  for (const item of [...keySkuItems, ...rawItems]) {
    const key = normalizeText(`${item.brand} ${item.product} ${item.price}`);
    if (!key || !Boolean(item.brand || item.product || item.price)) continue;
    const existing = byKey.get(key);
    if (!existing || (!existing.piece_count && item.piece_count)) {
      byKey.set(key, item);
    }
  }
  return [...byKey.values()];
}

export async function generateAiPriceCandidates(input: CandidateInput) {
  if (!hasSupabaseServiceConfig()) return [];
  const supabase = createSupabaseServiceClient();
  const items = sourceItems(input.aiResult);
  if (items.length === 0) return [];

  await supabase
    .from("ai_price_candidates")
    .delete()
    .eq("visit_id", input.visitId)
    .neq("status", "approved");

  const [{ data: materials }, { data: products }] = await Promise.all([
    supabase.from("material_master").select("*").limit(5000),
    supabase.from("competitor_products").select("*, brands(id,name)").limit(5000),
  ]);

  const rows = items.map((item) => {
    const parsedPrice = parseIdrPrice(item.price);
    const pieceCount = normalizePieceCount(item.piece_count);
    const pricePerPiece = calculatePricePerPiece(parsedPrice, pieceCount);
    const warnings: Warning[] = [];
    if (!item.brand) warnings.push({ type: "MISSING_DATA", message: "AI did not extract a brand." });
    if (!item.product) warnings.push({ type: "MISSING_DATA", message: "AI did not extract a product name." });
    if (!parsedPrice) warnings.push({ type: "MISSING_DATA", message: "AI price could not be parsed into a number." });
    if (!pieceCount) warnings.push({ type: "MISSING_DATA", message: "Missing piece count; per-piece price cannot be calculated." });
    if (item.confidence < 0.5) warnings.push({ type: "LOW_CONFIDENCE", message: "AI extraction confidence is below 50%." });

    const materialMatch = isMakukuBrand(item.brand)
      ? pickBestMaterial({ brand: item.brand, product: item.product, parsedPrice }, (materials ?? []) as MaterialMaster[])
      : null;
    const competitorMatch = !materialMatch
      ? pickBestCompetitor({ brand: item.brand, product: item.product }, (products ?? []) as CompetitorProduct[])
      : null;
    const matchScore = materialMatch?.score ?? competitorMatch?.score ?? 0;
    if (matchScore < 0.65) warnings.push({ type: "LOW_CONFIDENCE", message: "No reliable product/master-data match found." });

    return {
      visit_id: input.visitId,
      raw_brand: item.brand,
      raw_product: item.product,
      raw_price: item.price,
      parsed_price_idr: parsedPrice,
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
  });

  const { data, error } = await supabase
    .from("ai_price_candidates")
    .insert(rows)
    .select("*, offline_store_visits(id,store_name,city,channel_type,visit_date,created_at)");

  if (error?.message.includes("ai_price_candidates")) {
    return [];
  }
  if (error) throw new Error(error.message);
  return (data ?? []) as AiPriceCandidate[];
}
