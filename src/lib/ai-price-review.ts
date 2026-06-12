import { normalizePriceSnapshot } from "@/lib/business";
import { getAiPriceReviewRule } from "@/lib/data";
import { ensureSkuMasterFromMaterial } from "@/lib/sku-master-bridge";
import type { AiPriceCandidate, AiPriceCandidateReviewMethod, AiPriceReviewRule, CompetitorProduct } from "@/lib/types";

type SupabaseServiceClient = ReturnType<typeof import("@/lib/supabase").createSupabaseServiceClient>;
type CandidateUpdatePayload = {
  status: "approved" | "rejected";
  parsed_price_idr?: number;
  reviewed_piece_count?: number;
  reviewed_price_per_piece?: number;
  price_snapshot_id?: string | null;
  rejection_reason?: string | null;
  reviewed_at: string;
  reviewed_by: string | null;
  review_job_id: string | null;
  review_method?: AiPriceCandidateReviewMethod;
};

export function candidateMatchesReviewRule(candidate: AiPriceCandidate, rule: AiPriceReviewRule) {
  if (candidate.status !== "pending") return { eligible: false, reason: "Only pending candidates can be bulk reviewed." };
  if (candidate.ai_confidence < rule.min_ai_confidence) return { eligible: false, reason: "AI confidence is below the active rule." };
  if (candidate.match_score < rule.min_match_score) return { eligible: false, reason: "Match score is below the active rule." };
  if (rule.require_matched_entity && (!candidate.matched_entity_id || candidate.matched_entity_type === "unmatched")) {
    return { eligible: false, reason: "Missing matched product or material master data." };
  }
  if (rule.require_no_warnings && (candidate.warnings ?? []).length > 0) {
    return { eligible: false, reason: "Candidate has review warnings." };
  }
  if (rule.require_price_and_piece && (!candidate.parsed_price_idr || !candidate.piece_count)) {
    return { eligible: false, reason: "Missing package price or piece count." };
  }
  return { eligible: true, reason: null };
}

export async function approveAiPriceCandidate({
  supabase,
  candidateId,
  priceIdr,
  pieceCount,
  reviewer,
  reviewJobId,
  reviewMethod = "manual",
}: {
  supabase: SupabaseServiceClient;
  candidateId: string;
  priceIdr?: number | null;
  pieceCount?: number | null;
  reviewer?: string | null;
  reviewJobId?: string | null;
  reviewMethod?: AiPriceCandidateReviewMethod;
}) {
  const { data: candidate, error } = await supabase
    .from("ai_price_candidates")
    .select("*, offline_store_visits(*)")
    .eq("id", candidateId)
    .single();
  if (error || !candidate) throw new Error(error?.message ?? "Candidate not found");

  if (candidate.status !== "pending") {
    throw new Error("Only pending candidates can be approved");
  }

  const price = Number(priceIdr ?? candidate.parsed_price_idr);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Valid price is required");
  }
  const reviewedPieceCount = Number(pieceCount ?? candidate.reviewed_piece_count ?? candidate.piece_count);
  if (!Number.isFinite(reviewedPieceCount) || reviewedPieceCount <= 0) {
    throw new Error("Valid piece count is required");
  }

  const candidateRow = candidate as AiPriceCandidate;
  let competitorProduct: CompetitorProduct | null = null;
  let skuMasterId: string | null = null;
  if (candidateRow.matched_entity_type === "material_master" && candidateRow.matched_entity_id) {
    skuMasterId = await ensureSkuMasterFromMaterial(supabase, candidateRow.matched_entity_id);
  } else if (candidateRow.matched_entity_type === "competitor_product") {
    competitorProduct = await ensureCompetitorProduct(supabase, candidate, Math.floor(reviewedPieceCount));
  } else {
    throw new Error("Unmatched candidates cannot be approved");
  }
  if (candidateRow.matched_entity_type === "competitor_product" && !competitorProduct) {
    throw new Error("Matched competitor product is required");
  }

  const normalized = normalizePriceSnapshot({
    promo_price_idr: price,
    voucher_value_idr: 0,
    shipping_subsidy_idr: 0,
    piece_count: Math.floor(reviewedPieceCount),
  });

  const visit = candidate.offline_store_visits as { store_name?: string | null; visit_date?: string | null } | null;
  const snapshotPayload = candidateRow.matched_entity_type === "material_master"
    ? {
        competitor_product_id: null,
        sku_master_id: skuMasterId,
      }
    : {
        competitor_product_id: competitorProduct!.id,
        sku_master_id: null,
      };
  const { data: snapshot, error: snapshotError } = await supabase
    .from("price_snapshots")
    .insert({
      ...snapshotPayload,
      channel: "offline",
      list_price_idr: price,
      promo_price_idr: price,
      voucher_value_idr: 0,
      shipping_subsidy_idr: 0,
      net_price_idr: normalized.net_price_idr,
      price_per_piece: normalized.price_per_piece,
      promo_type: "offline_ai_confirmed",
      captured_at: visit?.visit_date ? new Date(`${visit.visit_date}T00:00:00`).toISOString() : new Date().toISOString(),
      source: "offline_ai_confirmed",
      evidence_url: null,
    })
    .select("*")
    .single();
  if (snapshotError) throw new Error(snapshotError.message);

  const updated = await updateAiPriceCandidateWithReviewMethodFallback(supabase, candidateId, {
    status: "approved",
    parsed_price_idr: price,
    reviewed_piece_count: Math.floor(reviewedPieceCount),
    reviewed_price_per_piece: normalized.price_per_piece,
    price_snapshot_id: snapshot.id,
    reviewed_at: new Date().toISOString(),
    reviewed_by: reviewer ?? null,
    review_job_id: reviewJobId ?? null,
    review_method: reviewMethod,
    rejection_reason: null,
  });

  return { candidate: updated as AiPriceCandidate, snapshot };
}

export async function rejectAiPriceCandidate({
  supabase,
  candidateId,
  reason,
  reviewer,
  reviewJobId,
  reviewMethod = "manual",
}: {
  supabase: SupabaseServiceClient;
  candidateId: string;
  reason: string;
  reviewer?: string | null;
  reviewJobId?: string | null;
  reviewMethod?: Exclude<AiPriceCandidateReviewMethod, "auto_rule">;
}) {
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error("Rejection reason is required");

  const { data: candidate, error: lookupError } = await supabase
    .from("ai_price_candidates")
    .select("id,status")
    .eq("id", candidateId)
    .single();
  if (lookupError || !candidate) throw new Error(lookupError?.message ?? "Candidate not found");
  if (candidate.status === "approved") throw new Error("Approved candidates cannot be rejected");

  const data = await updateAiPriceCandidateWithReviewMethodFallback(supabase, candidateId, {
    status: "rejected",
    rejection_reason: cleanReason,
    reviewed_at: new Date().toISOString(),
    reviewed_by: reviewer ?? null,
    review_job_id: reviewJobId ?? null,
    review_method: reviewMethod,
  });

  return data as AiPriceCandidate;
}

export async function autoApproveAiPriceCandidatesForVisit({
  supabase,
  visitId,
  candidates,
}: {
  supabase: SupabaseServiceClient;
  visitId: string;
  candidates?: AiPriceCandidate[];
}) {
  const ruleResult = await getAiPriceReviewRule();
  if (ruleResult.error && !ruleResult.isDemo) {
    return { approvedCount: 0, failedCount: 0, skippedCount: candidates?.length ?? 0, errors: [ruleResult.error] };
  }

  let candidateRows = candidates;
  if (!candidateRows) {
    const { data, error } = await supabase
      .from("ai_price_candidates")
      .select("*, offline_store_visits(id,store_name,city,province,city_name,district,channel_type,visit_date,created_at)")
      .eq("visit_id", visitId)
      .eq("status", "pending");
    if (error) return { approvedCount: 0, failedCount: 0, skippedCount: 0, errors: [error.message] };
    candidateRows = (data ?? []) as AiPriceCandidate[];
  }

  let approvedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (const candidate of candidateRows) {
    const eligibility = candidateMatchesReviewRule(candidate, ruleResult.data);
    if (!eligibility.eligible) {
      skippedCount += 1;
      continue;
    }

    try {
      await approveAiPriceCandidate({
        supabase,
        candidateId: candidate.id,
        priceIdr: candidate.parsed_price_idr,
        pieceCount: candidate.piece_count,
        reviewer: "auto_rule",
        reviewMethod: "auto_rule",
      });
      approvedCount += 1;
    } catch (error) {
      failedCount += 1;
      errors.push(error instanceof Error ? error.message : "Unknown auto review error");
    }
  }

  return { approvedCount, failedCount, skippedCount, errors };
}

async function ensureCompetitorProduct(supabase: SupabaseServiceClient, candidate: Record<string, unknown>, pieceCount: number) {
  const reusableProduct = await findReusableMatchedCompetitorProduct(supabase, candidate);
  if (reusableProduct) return reusableProduct as CompetitorProduct;

  const brandName = String(candidate.raw_brand ?? "").trim();
  const productName = String(candidate.raw_product ?? "").trim();
  if (!brandName || !productName) {
    throw new Error("Brand and product are required to create a price monitor record");
  }

  const { data: existingBrand, error: brandLookupError } = await supabase
    .from("brands")
    .select("*")
    .ilike("name", brandName)
    .limit(1)
    .maybeSingle();
  if (brandLookupError) throw new Error(brandLookupError.message);

  let brand = existingBrand;
  if (!brand) {
    const { data: createdBrand, error: brandCreateError } = await supabase
      .from("brands")
      .insert({
        name: brandName,
        country: "Indonesia",
        is_own_brand: false,
      })
      .select("*")
      .single();
    if (brandCreateError) throw new Error(brandCreateError.message);
    brand = createdBrand;
  }

  const { data: existingProduct, error: productLookupError } = await supabase
    .from("competitor_products")
    .select("*, brands(id,name), sku_matches(*, sku_master(*))")
    .eq("brand_id", brand.id)
    .eq("channel", "offline")
    .eq("normalized_name", productName)
    .limit(1)
    .maybeSingle();
  if (productLookupError) throw new Error(productLookupError.message);
  if (existingProduct) return existingProduct as CompetitorProduct;

  const visit = candidate.offline_store_visits as { store_name?: string | null } | null;
  const { data: createdProduct, error: productCreateError } = await supabase
    .from("competitor_products")
    .insert({
      brand_id: brand.id,
      raw_title: productName,
      normalized_name: productName,
      channel: "offline",
      shop_name: visit?.store_name ?? null,
      product_url: null,
      image_url: null,
      pack_type: "unknown",
      package_type: "unknown",
      size: null,
      piece_count: pieceCount,
      segment: "unknown",
    })
    .select("*, brands(id,name), sku_matches(*, sku_master(*))")
    .single();
  if (productCreateError) throw new Error(productCreateError.message);
  return createdProduct as CompetitorProduct;
}

async function findReusableMatchedCompetitorProduct(supabase: SupabaseServiceClient, candidate: Record<string, unknown>) {
  if (candidate.matched_entity_type !== "competitor_product" || !candidate.matched_entity_id) return null;

  const { data: product, error: productError } = await supabase
    .from("competitor_products")
    .select("*, brands(id,name), sku_matches(*, sku_master(*))")
    .eq("id", candidate.matched_entity_id)
    .single();
  if (productError || !product) throw new Error(productError?.message ?? "Matched product not found");
  if (!candidateBrandMatchesProductBrand(candidate, product)) return null;
  return product;
}

function candidateBrandMatchesProductBrand(candidate: Record<string, unknown>, product: CompetitorProduct) {
  return competitorBrandsMatch(String(candidate.raw_brand ?? ""), product.brands?.name);
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

async function updateAiPriceCandidateWithReviewMethodFallback(
  supabase: SupabaseServiceClient,
  candidateId: string,
  payload: CandidateUpdatePayload,
) {
  const { data, error } = await supabase
    .from("ai_price_candidates")
    .update(payload)
    .eq("id", candidateId)
    .select("*")
    .single();
  if (!error && data) return data;

  if (!isMissingReviewMethodError(error)) {
    throw new Error(error?.message ?? "Candidate not found");
  }

  const legacyPayload = { ...payload };
  delete legacyPayload.review_method;
  const { data: legacyData, error: legacyError } = await supabase
    .from("ai_price_candidates")
    .update(legacyPayload)
    .eq("id", candidateId)
    .select("*")
    .single();
  if (legacyError || !legacyData) throw new Error(legacyError?.message ?? "Candidate not found");
  return legacyData;
}

function isMissingReviewMethodError(error: { message?: string | null } | null) {
  const message = error?.message ?? "";
  return message.includes("review_method") || message.includes("schema cache");
}
