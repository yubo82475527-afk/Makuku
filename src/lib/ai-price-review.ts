import { normalizePriceSnapshot } from "@/lib/business";
import { getAiPriceReviewRule } from "@/lib/data";
import { ensureSkuMasterFromMaterial } from "@/lib/sku-master-bridge";
import type { AiPriceCandidate, AiPriceCandidateReviewMethod, AiPriceReviewRule, CompetitorProduct } from "@/lib/types";

type SupabaseServiceClient = ReturnType<typeof import("@/lib/supabase").createSupabaseServiceClient>;

const AUTO_REVIEW_CONCURRENCY = 10;
const MIN_MATCH_SCORE = 0.9;
const REQUIRE_MATCHED_ENTITY = true;

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
  autoApprovalWorkerId,
}: {
  supabase: SupabaseServiceClient;
  candidateId: string;
  priceIdr?: number | null;
  pieceCount?: number | null;
  reviewer?: string | null;
  reviewJobId?: string | null;
  reviewMethod?: AiPriceCandidateReviewMethod;
  promoType?: string | null;
  autoApprovalWorkerId?: string | null;
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
  const currentPrice = Number(candidate.net_price_idr ?? candidate.parsed_price_idr);
  const price = Number(priceIdr ?? currentPrice);
  if (!Number.isFinite(currentPrice) || currentPrice <= 0 || !Number.isFinite(price) || price <= 0) {
    throw new Error("Valid price is required");
  }
  const currentPieceCount = Number(candidate.reviewed_piece_count ?? candidate.piece_count);
  const reviewedPieceCount = Number(pieceCount ?? currentPieceCount);
  if (!Number.isFinite(currentPieceCount) || currentPieceCount <= 0 || !Number.isFinite(reviewedPieceCount) || reviewedPieceCount <= 0) {
    throw new Error("Valid piece count is required");
  }
  const currentPromoType = cleanCandidatePromoType(candidateRow.promo_type);
  const requestedPromoType = cleanCandidatePromoType(promoType ?? candidateRow.promo_type);
  if (
    price !== currentPrice
    || Math.floor(reviewedPieceCount) !== Math.floor(currentPieceCount)
    || requestedPromoType !== currentPromoType
  ) {
    throw new Error("Save the correction and wait for historical price re-evaluation before approving.");
  }
  if (!candidateRow.approval_input_fingerprint) {
    throw new Error("Candidate approval fingerprint is unavailable; reload after applying the quality migration.");
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
  if (competitorProduct && competitorProduct.id !== candidateRow.matched_entity_id) {
    throw new Error("Matched competitor product changed; save the match and wait for historical price re-evaluation.");
  }

  const { data: approvalRows, error: approvalError } = await supabase.rpc(
    "approve_ai_price_candidate_with_quality_gate",
    {
      p_candidate_id: candidateId,
      p_expected_approval_input_fingerprint: candidateRow.approval_input_fingerprint,
      p_price_idr: currentPrice,
      p_piece_count: Math.floor(currentPieceCount),
      p_promo_type: currentPromoType,
      p_competitor_product_id: competitorProduct?.id ?? null,
      p_sku_master_id: skuMasterId,
      p_material_sku_code: materialSkuCode,
      p_reviewer: reviewer ?? null,
      p_review_job_id: reviewJobId ?? null,
      p_review_method: reviewMethod,
      p_auto_approval_worker_id: autoApprovalWorkerId ?? null,
    },
  );
  if (approvalError) throw new Error(approvalError.message);
  const approval = Array.isArray(approvalRows)
    ? approvalRows[0] as { candidate_id?: string; snapshot_id?: string } | undefined
    : null;
  if (!approval?.candidate_id || !approval.snapshot_id) {
    throw new Error("Atomic candidate approval returned no result.");
  }

  const [{ data: updatedCandidate, error: candidateError }, { data: snapshot, error: snapshotError }] = await Promise.all([
    supabase
      .from("ai_price_candidates")
      .select("*, offline_store_visits(*)")
      .eq("id", approval.candidate_id)
      .single(),
    supabase
      .from("price_snapshots")
      .select("*")
      .eq("id", approval.snapshot_id)
      .single(),
  ]);
  if (candidateError || !updatedCandidate) throw new Error(candidateError?.message ?? "Approved candidate not found");
  if (snapshotError || !snapshot) throw new Error(snapshotError?.message ?? "Approved price snapshot not found");

  return { candidate: updatedCandidate as AiPriceCandidate, snapshot };
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

  const { data: rejectionRows, error: rejectionError } = await supabase.rpc(
    "reject_ai_price_candidate_with_quality_gate",
    {
      p_candidate_id: candidateId,
      p_reason: cleanReason,
      p_reviewer: reviewer ?? null,
      p_review_job_id: reviewJobId ?? null,
      p_review_method: reviewMethod,
    },
  );
  if (rejectionError) throw new Error(rejectionError.message);
  const rejection = Array.isArray(rejectionRows)
    ? rejectionRows[0] as { candidate_id?: string } | undefined
    : null;
  if (!rejection?.candidate_id) {
    throw new Error("Atomic candidate rejection returned no result.");
  }

  const { data, error } = await supabase
    .from("ai_price_candidates")
    .select("*")
    .eq("id", rejection.candidate_id)
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Rejected candidate not found");
  }

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
  const workerId = `price-auto-approval-${Date.now()}-${globalThis.crypto.randomUUID()}`;
  const { data, error } = await input.supabase.rpc("claim_ai_price_candidates_for_auto_approval", {
    p_worker_id: workerId,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);

  let approved = 0;
  let failed = 0;
  const claimedIds = ((data ?? []) as { candidate_id?: string }[])
    .map((row) => String(row.candidate_id ?? ""))
    .filter(Boolean);
  for (const candidateId of claimedIds) {
    try {
      await approveAiPriceCandidate({
        supabase: input.supabase,
        candidateId,
        reviewer: "auto_rule",
        reviewMethod: "auto_rule",
        autoApprovalWorkerId: workerId,
      });
      approved += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      const { error: finalizeError } = await input.supabase.rpc(
        "finalize_ai_price_candidate_auto_approval_failure",
        {
          p_candidate_id: candidateId,
          p_worker_id: workerId,
          p_error: message,
        },
      );
      console.error("[price-quality-gate] auto approval failed", {
        candidate_id: candidateId,
        error: message,
        finalize_error: finalizeError?.message ?? null,
      });
    }
  }

  return { claimed: claimedIds.length, approved, failed };
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

function normalizeCandidatePromoType(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text || /^none|no activity|no promo|normal$/i.test(text)) return "offline_ai_confirmed";
  return text;
}

function cleanCandidatePromoType(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text || null;
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
