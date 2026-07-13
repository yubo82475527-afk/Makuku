import { normalizePriceSnapshot } from "@/lib/business";
import { getAiPriceReviewRule } from "@/lib/data";
import { ensureSkuMasterFromMaterial } from "@/lib/sku-master-bridge";
import type { AiPriceCandidate, AiPriceCandidateReviewMethod, AiPriceReviewRule, CompetitorProduct } from "@/lib/types";

type SupabaseServiceClient = ReturnType<typeof import("@/lib/supabase").createSupabaseServiceClient>;

const AUTO_REVIEW_CONCURRENCY = 10;
const MIN_MATCH_SCORE = 0.9;
const REQUIRE_MATCHED_ENTITY = true;

type CandidateUpdatePayload = {
  status: "approved" | "rejected";
  parsed_price_idr?: number;
  reviewed_piece_count?: number;
  reviewed_price_per_piece?: number;
  price_snapshot_id?: string | null;
  matched_entity_type?: "material_master" | "competitor_product" | "unmatched";
  matched_entity_id?: string | null;
  matched_label?: string | null;
  match_score?: number;
  rejection_reason?: string | null;
  reviewed_at: string;
  reviewed_by: string | null;
  review_job_id: string | null;
  review_method?: AiPriceCandidateReviewMethod;
};

export function candidateMatchesReviewRule(candidate: AiPriceCandidate, _rule: AiPriceReviewRule) {
  void _rule;
  if (candidate.status !== "pending") return { eligible: false, reason: "Only pending candidates can be bulk reviewed." };
  if (candidate.quality_gate_status !== "PASSED") {
    return { eligible: false, reason: "Historical price quality gate has not passed." };
  }
  if (candidate.review_decision !== "AUTO_APPROVE") return { eligible: false, reason: "Candidate requires manual review." };
  if (candidate.match_score < MIN_MATCH_SCORE) return { eligible: false, reason: "Match score is below the fixed auto-approval threshold." };
  if (REQUIRE_MATCHED_ENTITY && (!candidate.matched_entity_id || candidate.matched_entity_type === "unmatched")) {
    return { eligible: false, reason: "Missing matched product or material master data." };
  }
  if ((candidate.warnings ?? []).length > 0 || (candidate.conflicts ?? []).length > 0) {
    return { eligible: false, reason: "Candidate has review warnings." };
  }
  if (!candidate.parsed_price_idr || !candidate.piece_count) {
    return { eligible: false, reason: "Missing package price or piece count." };
  }
  return { eligible: true, reason: null };
}

export function resolveCandidateReviewPricePerPiece(
  candidate: Pick<AiPriceCandidate, "visible_price_per_piece_idr" | "price_per_piece">,
  packageDerivedPricePerPiece: number,
) {
  return positiveNumberOrFallback(
    candidate.visible_price_per_piece_idr,
    positiveNumberOrFallback(candidate.price_per_piece, packageDerivedPricePerPiece),
  );
}

export async function approveAiPriceCandidate({
  supabase,
  candidateId,
  priceIdr,
  pieceCount,
  reviewer,
  reviewJobId,
  reviewMethod = "manual",
  promoType,
}: {
  supabase: SupabaseServiceClient;
  candidateId: string;
  priceIdr?: number | null;
  pieceCount?: number | null;
  reviewer?: string | null;
  reviewJobId?: string | null;
  reviewMethod?: AiPriceCandidateReviewMethod;
  promoType?: string | null;
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

  const candidateRow = candidate as AiPriceCandidate;
  const requiresPassedQualityGate = reviewMethod === "auto_rule" || reviewMethod === "bulk_manual";
  if (requiresPassedQualityGate && candidate.quality_gate_status !== "PASSED") {
    throw new Error("Historical price quality gate has not passed.");
  }
  if (reviewMethod === "manual") {
    if (candidate.quality_gate_status === "PENDING" || candidate.quality_gate_status === "PROCESSING") {
      throw new Error("Historical price quality check is still running.");
    }
    if (candidate.quality_gate_status === "FAILED" && candidate.quality_gate_attempt_count < 3) {
      throw new Error("Historical price quality check is waiting for retry.");
    }
  }
  const price = Number(priceIdr ?? candidate.net_price_idr ?? candidate.parsed_price_idr);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Valid price is required");
  }
  const listPrice = positiveNumberOrFallback(candidate.list_price_idr, price);
  const packagePrice = positiveNumberOrFallback(candidate.package_price_idr, price);
  const netPrice = positiveNumberOrFallback(candidateRow.net_price_idr, price);
  const reviewedPieceCount = Number(pieceCount ?? candidate.reviewed_piece_count ?? candidate.piece_count);
  if (!Number.isFinite(reviewedPieceCount) || reviewedPieceCount <= 0) {
    throw new Error("Valid piece count is required");
  }

  let competitorProduct: CompetitorProduct | null = null;
  let skuMasterId: string | null = null;
  let materialSkuCode: string | null = null;
  if (candidateRow.matched_entity_type === "material_master" && candidateRow.matched_entity_id) {
    materialSkuCode = candidateRow.matched_entity_id;
    skuMasterId = await ensureSkuMasterFromMaterial(supabase, materialSkuCode);
  } else if (candidateRow.matched_entity_type === "competitor_product") {
    competitorProduct = await ensureCompetitorProduct(supabase, candidate, Math.floor(reviewedPieceCount));
  } else {
    throw new Error("Please match a product before approving this candidate");
  }
  if (candidateRow.matched_entity_type === "competitor_product" && !competitorProduct) {
    throw new Error("Matched competitor product is required");
  }

  const normalized = normalizePriceSnapshot({
    promo_price_idr: packagePrice,
    voucher_value_idr: 0,
    shipping_subsidy_idr: 0,
    net_price_idr: netPrice,
    piece_count: Math.floor(reviewedPieceCount),
  });
  const reviewedPricePerPiece = resolveCandidateReviewPricePerPiece(candidateRow, normalized.price_per_piece);

  const visit = candidate.offline_store_visits as {
    store_id?: string | null;
    store_name?: string | null;
    visit_date?: string | null;
  } | null;
  const sourceVisitId = candidateRow.visit_id;
  const sourceImageId = candidateRow.source_image_id ?? null;
  if (!sourceImageId) {
    throw new Error("AI price candidate is missing source_image_id and cannot create a price snapshot");
  }
  const sourceOfflineStoreId = visit?.store_id ?? null;
  const sourceMatchedEntityType = candidateRow.matched_entity_type;
  const sourceMatchedEntityId = candidateRow.matched_entity_type === "material_master"
    ? materialSkuCode
    : competitorProduct?.id ?? candidateRow.matched_entity_id;
  const snapshotPayload = candidateRow.matched_entity_type === "material_master"
    ? {
        competitor_product_id: null,
        sku_master_id: skuMasterId,
        material_sku_code: materialSkuCode,
      }
    : {
        competitor_product_id: competitorProduct!.id,
        sku_master_id: null,
        material_sku_code: null,
      };
  const existingSnapshot = await findExistingOfflineAiSnapshot({
    supabase,
    visitId: sourceVisitId,
    sourceImageId,
    matchedEntityType: sourceMatchedEntityType,
    matchedEntityId: sourceMatchedEntityId,
    netPrice,
  });
  if (existingSnapshot) {
    const snapshotWithStore = sourceOfflineStoreId && !existingSnapshot.offline_store_id
      ? await attachOfflineStoreToSnapshot(supabase, existingSnapshot.id, sourceOfflineStoreId)
      : existingSnapshot;
    const updated = await updateAiPriceCandidateWithReviewMethodFallback(supabase, candidateId, {
      status: "approved",
      parsed_price_idr: netPrice,
      reviewed_piece_count: Math.floor(reviewedPieceCount),
      reviewed_price_per_piece: reviewedPricePerPiece,
      price_snapshot_id: snapshotWithStore.id,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewer ?? null,
      review_job_id: reviewJobId ?? null,
      review_method: reviewMethod,
      rejection_reason: null,
    });

    return { candidate: updated as AiPriceCandidate, snapshot: snapshotWithStore };
  }

  const { data: snapshot, error: snapshotError } = await supabase
    .from("price_snapshots")
    .insert({
      ...snapshotPayload,
      offline_store_id: sourceOfflineStoreId,
      channel: "offline",
      list_price_idr: listPrice,
      package_price_idr: packagePrice,
      promo_price_idr: packagePrice,
      voucher_value_idr: 0,
      shipping_subsidy_idr: 0,
      net_price_idr: normalized.net_price_idr,
      price_per_piece: reviewedPricePerPiece,
      promo_type: normalizeCandidatePromoType(promoType ?? candidateRow.promo_type),
      captured_at: visit?.visit_date ? new Date(`${visit.visit_date}T00:00:00`).toISOString() : new Date().toISOString(),
      source: "offline_ai_confirmed",
      source_visit_id: sourceVisitId,
      source_image_id: sourceImageId,
      source_matched_entity_type: sourceMatchedEntityType,
      source_matched_entity_id: sourceMatchedEntityId,
      evidence_url: null,
    })
    .select("*")
    .single();
  if (snapshotError) throw new Error(snapshotError.message);

  const updated = await updateAiPriceCandidateWithReviewMethodFallback(supabase, candidateId, {
    status: "approved",
    parsed_price_idr: netPrice,
    reviewed_piece_count: Math.floor(reviewedPieceCount),
    reviewed_price_per_piece: reviewedPricePerPiece,
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
  const eligibleCandidates: AiPriceCandidate[] = [];

  for (const candidate of candidateRows) {
    const eligibility = candidateMatchesReviewRule(candidate, ruleResult.data);
    if (!eligibility.eligible) {
      skippedCount += 1;
      continue;
    }
    eligibleCandidates.push(candidate);
  }

  let autoReviewCursor = 0;
  const autoReviewWorker = async () => {
    while (true) {
      const cursor = autoReviewCursor;
      autoReviewCursor += 1;
      const candidate = eligibleCandidates[cursor];
      if (!candidate) return;

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
  };

  const workerCount = Math.min(AUTO_REVIEW_CONCURRENCY, Math.max(eligibleCandidates.length, 1));
  await Promise.all(Array.from({ length: workerCount }, () => autoReviewWorker()));

  return { approvedCount, failedCount, skippedCount, errors };
}

export async function autoApprovePassedAiPriceCandidates(input: {
  supabase: SupabaseServiceClient;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
  const { data, error } = await input.supabase
    .from("ai_price_candidates")
    .select("*")
    .eq("status", "pending")
    .eq("quality_gate_status", "PASSED")
    .eq("review_decision", "AUTO_APPROVE")
    .order("quality_gate_evaluated_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  let approved = 0;
  let failed = 0;
  for (const candidate of (data ?? []) as AiPriceCandidate[]) {
    try {
      await approveAiPriceCandidate({
        supabase: input.supabase,
        candidateId: candidate.id,
        priceIdr: candidate.net_price_idr ?? candidate.parsed_price_idr,
        pieceCount: candidate.piece_count,
        promoType: candidate.promo_type,
        reviewer: "auto_rule",
        reviewMethod: "auto_rule",
      });
      approved += 1;
    } catch (error) {
      failed += 1;
      console.error("[price-quality-gate] auto approval failed", {
        candidate_id: candidate.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { approved, failed };
}

export async function ensureCompetitorProduct(supabase: SupabaseServiceClient, candidate: Record<string, unknown>, pieceCount: number) {
  const reusableProduct = await findReusableMatchedCompetitorProduct(supabase, candidate);
  if (reusableProduct) return reusableProduct as CompetitorProduct;

  const brandName = String(candidate.raw_brand ?? "").trim();
  const productName = String(candidate.raw_product ?? "").trim();
  const size = inferCompetitorSize(productName);
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
  if (existingProduct) {
    if (!existingProduct.size && size) {
      const { data: updatedProduct, error: updateError } = await supabase
        .from("competitor_products")
        .update({ size })
        .eq("id", existingProduct.id)
        .select("*, brands(id,name), sku_matches(*, sku_master(*))")
        .single();
      if (updateError) throw new Error(updateError.message);
      return updatedProduct as CompetitorProduct;
    }
    return existingProduct as CompetitorProduct;
  }

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
      size: inferCompetitorSize(productName),
      piece_count: pieceCount,
      segment: "unknown",
    })
    .select("*, brands(id,name), sku_matches(*, sku_master(*))")
    .single();
  if (productCreateError) throw new Error(productCreateError.message);
  return createdProduct as CompetitorProduct;
}

export function competitorLabel(product: CompetitorProduct) {
  return [product.brands?.name, product.normalized_name].filter(Boolean).join(" · ");
}

function inferCompetitorSize(productName: string) {
  const match = productName.match(/\b(nb-s|nb|s|m|l|xl|xxl|xxxl|xxxxl)(?=\s|\d|$|-)/i);
  return match ? match[1].toUpperCase() : null;
}

export async function syncCandidateMatchToPriceSnapshot(
  supabase: SupabaseServiceClient,
  candidate: AiPriceCandidate,
) {
  if (!candidate.price_snapshot_id) return null;

  const snapshotPayload = await buildSnapshotOwnerPayload(supabase, candidate, candidate.reviewed_piece_count ?? candidate.piece_count);
  const { data: snapshot, error } = await supabase
    .from("price_snapshots")
    .update(snapshotPayload)
    .eq("id", candidate.price_snapshot_id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!snapshot) throw new Error("Price snapshot not found");
  return snapshot;
}

export async function syncCandidateReviewInputToPriceSnapshot(
  supabase: SupabaseServiceClient,
  candidate: AiPriceCandidate,
) {
  if (!candidate.price_snapshot_id) return null;

  const netPrice = Number(candidate.net_price_idr ?? candidate.parsed_price_idr);
  const packagePrice = positiveNumberOrFallback(candidate.package_price_idr, netPrice);
  const pieceCount = Number(candidate.reviewed_piece_count ?? candidate.piece_count);
  if (!Number.isFinite(netPrice) || netPrice <= 0) throw new Error("Valid price is required");
  if (!Number.isFinite(pieceCount) || pieceCount <= 0) throw new Error("Valid piece count is required");

  const normalized = normalizePriceSnapshot({
    promo_price_idr: packagePrice,
    voucher_value_idr: 0,
    shipping_subsidy_idr: 0,
    net_price_idr: netPrice,
    piece_count: Math.floor(pieceCount),
  });
  const { data: snapshot, error } = await supabase
    .from("price_snapshots")
    .update({
      list_price_idr: positiveNumberOrFallback(candidate.list_price_idr, packagePrice),
      package_price_idr: packagePrice,
      promo_price_idr: packagePrice,
      net_price_idr: normalized.net_price_idr,
      price_per_piece: normalized.price_per_piece,
      promo_type: normalizeCandidatePromoType(candidate.promo_type),
    })
    .eq("id", candidate.price_snapshot_id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!snapshot) throw new Error("Price snapshot not found");
  return snapshot;
}

async function buildSnapshotOwnerPayload(
  supabase: SupabaseServiceClient,
  candidate: AiPriceCandidate,
  pieceCount: number | null | undefined,
) {
  const normalizedPieceCount = Number(pieceCount ?? 0);
  if (candidate.matched_entity_type === "material_master" && candidate.matched_entity_id) {
    const materialSkuCode = candidate.matched_entity_id;
    const skuMasterId = await ensureSkuMasterFromMaterial(supabase, materialSkuCode);
    return {
      competitor_product_id: null,
      sku_master_id: skuMasterId,
      material_sku_code: materialSkuCode,
      source_matched_entity_type: candidate.matched_entity_type,
      source_matched_entity_id: materialSkuCode,
    };
  }

  if (candidate.matched_entity_type === "competitor_product") {
    const competitorProduct = await ensureCompetitorProduct(supabase, candidate, Math.floor(normalizedPieceCount || 1));
    return {
      competitor_product_id: competitorProduct.id,
      sku_master_id: null,
      material_sku_code: null,
      source_matched_entity_type: candidate.matched_entity_type,
      source_matched_entity_id: competitorProduct.id,
    };
  }

  throw new Error("Please match a product before approving this candidate");
}

function positiveNumberOrFallback(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function attachOfflineStoreToSnapshot(
  supabase: SupabaseServiceClient,
  snapshotId: string,
  offlineStoreId: string,
) {
  const { data, error } = await supabase
    .from("price_snapshots")
    .update({ offline_store_id: offlineStoreId })
    .eq("id", snapshotId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function findExistingOfflineAiSnapshot({
  supabase,
  visitId,
  sourceImageId,
  matchedEntityType,
  matchedEntityId,
  netPrice,
}: {
  supabase: SupabaseServiceClient;
  visitId: string | null;
  sourceImageId: string | null;
  matchedEntityType: "material_master" | "competitor_product" | "unmatched";
  matchedEntityId: string | null | undefined;
  netPrice: number;
}) {
  if (!visitId || !sourceImageId || !matchedEntityId || matchedEntityType === "unmatched") return null;

  const { data, error } = await supabase
    .from("price_snapshots")
    .select("*")
    .eq("source", "offline_ai_confirmed")
    .eq("source_visit_id", visitId)
    .eq("source_image_id", sourceImageId)
    .eq("source_matched_entity_type", matchedEntityType)
    .eq("source_matched_entity_id", matchedEntityId)
    .eq("net_price_idr", netPrice)
    .limit(1)
    .maybeSingle();
  if (error && !isMissingSourceTrackingColumnError(error)) {
    throw new Error(error.message);
  }
  return data ?? null;
}

function normalizeCandidatePromoType(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text || /^none|no activity|no promo|normal$/i.test(text)) return "offline_ai_confirmed";
  return text;
}

function isMissingSourceTrackingColumnError(error: { message?: string | null } | null) {
  const message = error?.message ?? "";
  return [
    "source_visit_id",
    "source_image_id",
    "source_matched_entity_type",
    "source_matched_entity_id",
    "schema cache",
  ].some((column) => message.includes(column));
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
