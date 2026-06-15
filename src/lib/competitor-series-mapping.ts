import { ensureSkuMasterFromMaterial } from "@/lib/sku-master-bridge";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type { CompetitorProduct, CompetitorSeriesMapping, MaterialMaster, SkuMatch } from "@/lib/types";

type Supabase = ReturnType<typeof createSupabaseServiceClient>;

export type SeriesRuleApplySummary = {
  total: number;
  matched: number;
  manual_overrides: number;
  unmatched: Array<{ competitor_product_id: string; reason: string }>;
};

export function seriesKey(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function makukuSeriesOptions(materials: MaterialMaster[]) {
  return Array.from(new Set(materials.map((material) => cleanText(material.sub_brand)).filter(Boolean) as string[])).sort((left, right) => left.localeCompare(right));
}

export function findMatchingMaterialForSeries(product: Pick<CompetitorProduct, "size" | "piece_count" | "normalized_name" | "raw_title">, targetMakukuSeries: string, materials: MaterialMaster[]) {
  const candidatePieceCounts = productPieceCountCandidates(product);
  const sameSeriesSizeMaterials = materials.filter((material) => {
    if (seriesKey(material.sub_brand) !== seriesKey(targetMakukuSeries)) return false;
    if (seriesKey(material.sub_type) !== seriesKey(product.size)) return false;
    return true;
  });
  if (sameSeriesSizeMaterials.length === 0 || candidatePieceCounts.length === 0) {
    return { status: "not_found" as const, material: null };
  }

  const ranked = sameSeriesSizeMaterials
    .map((material) => ({
      material,
      distance: Math.min(...candidatePieceCounts.map((pieceCount) => Math.abs(Number(material.pack_count) - pieceCount))),
    }))
    .sort((left, right) => left.distance - right.distance || Number(right.material.pack_count) - Number(left.material.pack_count));
  return ranked[0]?.material ? { status: "matched" as const, material: ranked[0].material } : { status: "not_found" as const, material: null };
}

export async function applySeriesMappingRuleToGroup(
  supabase: Supabase,
  input: {
    brand_id: string;
    product_series: string | null;
    target_makuku_series: string;
    products?: CompetitorProduct[];
    materials?: MaterialMaster[];
  },
): Promise<SeriesRuleApplySummary> {
  const products = input.products ?? await loadProductsForSeries(supabase, input.brand_id, input.product_series);
  const materials = input.materials ?? await loadMaterials(supabase);
  const summary: SeriesRuleApplySummary = { total: products.length, matched: 0, manual_overrides: 0, unmatched: [] };

  for (const product of products) {
    const currentMatch = product.sku_matches?.[0] as SkuMatch | undefined;
    if (currentMatch?.match_method === "manual") {
      summary.manual_overrides += 1;
      continue;
    }
    const materialMatch = findMatchingMaterialForSeries(product, input.target_makuku_series, materials);
    if (materialMatch.status !== "matched" || !materialMatch.material) {
      summary.unmatched.push({ competitor_product_id: product.id, reason: materialMatch.status });
      continue;
    }
    const skuMasterId = await ensureSkuMasterFromMaterial(supabase, materialMatch.material.tenant_sku_code);
    await replaceSeriesRuleMatch(supabase, product.id, skuMasterId);
    summary.matched += 1;
  }

  return summary;
}

export async function applySeriesMappingRuleForProduct(supabase: Supabase, productId: string) {
  const product = await loadProduct(supabase, productId);
  if (!product) return null;
  const rule = await loadActiveRule(supabase, product.brand_id, product.product_series ?? null);
  if (!rule) return null;
  return applySeriesMappingRuleToGroup(supabase, {
    brand_id: product.brand_id,
    product_series: product.product_series ?? null,
    target_makuku_series: rule.target_makuku_series,
    products: [product],
  });
}

export async function clearSeriesRuleMatches(supabase: Supabase, brandId: string, productSeries: string | null) {
  const products = await loadProductsForSeries(supabase, brandId, productSeries);
  const ids = products.map((product) => product.id);
  if (ids.length === 0) return { cleared: 0 };
  const { error } = await supabase
    .from("sku_matches")
    .delete()
    .in("competitor_product_id", ids)
    .eq("match_method", "series_rule");
  if (error) throw new Error(error.message);
  return { cleared: ids.length };
}

async function replaceSeriesRuleMatch(supabase: Supabase, competitorProductId: string, skuMasterId: string) {
  const { error: deleteError } = await supabase
    .from("sku_matches")
    .delete()
    .eq("competitor_product_id", competitorProductId)
    .neq("match_method", "manual");
  if (deleteError) throw new Error(deleteError.message);

  const { error } = await supabase.from("sku_matches").insert({
    competitor_product_id: competitorProductId,
    sku_master_id: skuMasterId,
    match_score: 1,
    match_method: "series_rule",
    reviewed: true,
  });
  if (error) throw new Error(error.message);
}

async function loadActiveRule(supabase: Supabase, brandId: string, productSeries: string | null) {
  let query = supabase
    .from("competitor_series_mappings")
    .select("*")
    .eq("brand_id", brandId)
    .eq("active", true);
  query = productSeries ? query.ilike("product_series", productSeries) : query.is("product_series", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data as CompetitorSeriesMapping | null;
}

async function loadProduct(supabase: Supabase, productId: string) {
  const { data, error } = await supabase
    .from("competitor_products")
    .select("*, brands(id,name), sku_matches(*, sku_master(*))")
    .eq("id", productId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as CompetitorProduct | null;
}

async function loadProductsForSeries(supabase: Supabase, brandId: string, productSeries: string | null) {
  let query = supabase
    .from("competitor_products")
    .select("*, brands(id,name), sku_matches(*, sku_master(*))")
    .eq("brand_id", brandId);
  query = productSeries ? query.ilike("product_series", productSeries) : query.is("product_series", null);
  const { data, error } = await query.limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []) as CompetitorProduct[];
}

async function loadMaterials(supabase: Supabase) {
  const { data, error } = await supabase.from("material_master").select("*").limit(10000);
  if (error) throw new Error(error.message);
  return (data ?? []) as MaterialMaster[];
}

function cleanText(value: string | null | undefined) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || null;
}

function productPieceCountCandidates(product: Pick<CompetitorProduct, "size" | "piece_count" | "normalized_name" | "raw_title">) {
  const parsedCandidates = new Set<number>();

  const size = String(product.size ?? "").trim();
  if (size) {
    const escapedSize = size.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const text = `${product.normalized_name ?? ""} ${product.raw_title ?? ""}`;
    const matches = text.matchAll(new RegExp(`\\b${escapedSize}\\s*(\\d+)(?:\\s*\\+\\s*(\\d+))?\\b`, "gi"));
    for (const match of matches) {
      const base = Number(match[1]);
      const bonus = Number(match[2] ?? 0);
      if (base > 0) parsedCandidates.add(base + (bonus > 0 ? bonus : 0));
    }
  }

  if (parsedCandidates.size > 0) return Array.from(parsedCandidates);

  const candidates = new Set<number>();
  if (Number(product.piece_count) > 0) candidates.add(Number(product.piece_count));
  return Array.from(candidates);
}
