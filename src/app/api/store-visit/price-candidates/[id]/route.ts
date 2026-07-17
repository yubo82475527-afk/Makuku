import { requireAppSession } from "@/lib/auth-session";
import { approveAiPriceCandidate } from "@/lib/ai-price-review";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type { AiPriceCandidate, AiPriceCandidateMatchType } from "@/lib/types";

function cleanOptionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function withHiddenPriceRow(visionResult: unknown, rowIndex: number) {
  const current = isRecord(visionResult) ? visionResult : {};
  const hiddenRows = Array.isArray(current.h5_hidden_price_row_indexes)
    ? current.h5_hidden_price_row_indexes.map(Number).filter((value) => Number.isInteger(value) && value >= 0)
    : [];
  return {
    ...current,
    h5_hidden_price_row_indexes: Array.from(new Set([...hiddenRows, rowIndex])).sort((left, right) => left - right),
  };
}

function candidateMutationErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const stalePatterns = [
    /candidate not found/i,
    /only pending candidates/i,
    /inactive candidates/i,
    /candidate inputs changed/i,
    /candidate quality result is stale/i,
    /candidate is not ready for operator review/i,
    /approval fingerprint is unavailable/i,
  ];
  if (stalePatterns.some((pattern) => pattern.test(message))) {
    return Response.json({ code: "CANDIDATE_STALE", error: "This price row has changed. Reload the latest result." }, { status: 409 });
  }
  const validationPatterns = [
    /review token is required/i,
    /valid price/i,
    /valid piece count/i,
    /please match a product/i,
    /product match is already confident/i,
    /matched product not found/i,
  ];
  if (validationPatterns.some((pattern) => pattern.test(message))) {
    return Response.json({ error: message }, { status: 400 });
  }
  return Response.json({ error: message }, { status: 500 });
}

function buildReviewInputPatch(body: Record<string, unknown>) {
  const price = Number(body.net_price_idr ?? body.price_idr);
  const pieceCount = Number(body.piece_count);
  const promoType = cleanOptionalText(body.promo_type);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(pieceCount) || pieceCount <= 0) {
    return { error: "Valid package price and piece count are required" as const };
  }

  const normalizedPrice = Math.round(price);
  const normalizedPieceCount = Math.floor(pieceCount);
  const pricePerPiece = Math.round((normalizedPrice / normalizedPieceCount) * 100) / 100;
  return {
    patch: {
      parsed_price_idr: normalizedPrice,
      list_price_idr: normalizedPrice,
      package_price_idr: normalizedPrice,
      net_price_idr: normalizedPrice,
      promo_type: promoType,
      piece_count: normalizedPieceCount,
      price_per_piece: pricePerPiece,
      reviewed_piece_count: normalizedPieceCount,
      reviewed_price_per_piece: pricePerPiece,
    },
  };
}

async function buildMatchPatch(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  body: Record<string, unknown>,
) {
  const matchType = String(body.matched_entity_type ?? "").trim() as AiPriceCandidateMatchType;
  const matchId = String(body.matched_entity_id ?? "").trim() || null;
  let matchedLabel = String(body.matched_label ?? "").trim() || null;

  if (matchType !== "material_master" && matchType !== "competitor_product" && matchType !== "unmatched") {
    return { response: Response.json({ error: "matched_entity_type is invalid" }, { status: 400 }) };
  }
  if (matchType !== "unmatched" && !matchId) {
    return { response: Response.json({ error: "matched_entity_id is required" }, { status: 400 }) };
  }

  if (matchType === "material_master") {
    const { data: material, error: materialError } = await supabase
      .from("material_master")
      .select("tenant_sku_code,tenant_sku_name")
      .eq("tenant_sku_code", matchId)
      .maybeSingle();
    if (materialError || !material) {
      return { response: Response.json({ error: materialError?.message ?? "Makuku SKU not found" }, { status: 400 }) };
    }
    matchedLabel = matchedLabel ?? `${material.tenant_sku_code} / ${material.tenant_sku_name}`;
  }

  if (matchType === "competitor_product") {
    const { data: product, error: productError } = await supabase
      .from("competitor_products")
      .select("id,normalized_name,brands(id,name)")
      .eq("id", matchId)
      .maybeSingle();
    if (productError || !product) {
      return { response: Response.json({ error: productError?.message ?? "Competitor product not found" }, { status: 400 }) };
    }
    const productRow = product as {
      normalized_name: string;
      brands?: { name?: string | null } | Array<{ name?: string | null }> | null;
    };
    const brandName = Array.isArray(productRow.brands) ? productRow.brands[0]?.name : productRow.brands?.name;
    matchedLabel = matchedLabel ?? [brandName, productRow.normalized_name].filter(Boolean).join(" / ");
  }

  return {
    patch: {
      matched_entity_type: matchType,
      matched_entity_id: matchType === "unmatched" ? null : matchId,
      matched_label: matchType === "unmatched" ? null : matchedLabel,
      match_score: matchType === "unmatched" ? 0 : 1,
    },
  };
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAppSession(request);
    if (auth.response) return auth.response;

    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "").trim();
    const supabase = createSupabaseServiceClient();
    const candidateStatuses = ["pending"];

    const { data: sourceCandidate, error: sourceCandidateError } = await supabase
      .from("ai_price_candidates")
      .select("*")
      .eq("id", id)
      .in("status", candidateStatuses)
      .maybeSingle();
    if (sourceCandidateError) throw new Error(sourceCandidateError.message);
    if (!sourceCandidate) {
      return Response.json({ code: "CANDIDATE_STALE", error: "This price row has changed. Reload the latest result." }, { status: 409 });
    }

    if (action === "save_review_input") {
      const h5RowPatch = buildReviewInputPatch(body);
      if ("error" in h5RowPatch) return Response.json({ error: h5RowPatch.error }, { status: 400 });
      const { data: candidate, error } = await supabase
        .from("ai_price_candidates")
        .update(h5RowPatch.patch)
        .eq("id", id)
        .eq("status", "pending")
        .select("*")
        .single();
      if (error || !candidate) throw new Error(error?.message ?? "Pending candidate not found");
      return Response.json({ candidate });
    }

    if (action === "update_match") {
      const matchPatch = await buildMatchPatch(supabase, body);
      if ("response" in matchPatch) return matchPatch.response;
      const { data: candidate, error } = await supabase
        .from("ai_price_candidates")
        .update(matchPatch.patch)
        .eq("id", id)
        .eq("status", "pending")
        .select("*")
        .single();
      if (error || !candidate) throw new Error(error?.message ?? "Pending candidate not found");
      return Response.json({ candidate });
    }

    if (action === "confirm_h5_row_edit") {
      const candidateRow = sourceCandidate as AiPriceCandidate;
      const reviewInput = buildReviewInputPatch(body);
      if ("error" in reviewInput) return Response.json({ error: reviewInput.error }, { status: 400 });
      const matchPatch = await buildMatchPatch(supabase, body);
      if ("response" in matchPatch) return matchPatch.response;
      const price = reviewInput.patch.net_price_idr;
      const pieceCount = reviewInput.patch.piece_count;
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(pieceCount) || pieceCount <= 0) {
        return Response.json({ error: "Valid package price and piece count are required" }, { status: 400 });
      }

      const result = await approveAiPriceCandidate({
        supabase,
        candidateId: id,
        priceIdr: price,
        pieceCount,
        reviewer: auth.session.id,
        reviewMethod: "manual",
        promoType: candidateRow.promo_type,
        reviewToken: cleanOptionalText(body.review_token),
        matchedEntityType: matchPatch.patch.matched_entity_type,
        matchedEntityId: matchPatch.patch.matched_entity_id,
        matchedLabel: matchPatch.patch.matched_label,
      });
      return Response.json(result);
    }

    if (action === "delete_h5_row") {
      const sourceImageId = cleanOptionalText(sourceCandidate.source_image_id);
      const sourceRowIndex = Number(sourceCandidate.source_row_index);
      if (!sourceImageId || !Number.isInteger(sourceRowIndex) || sourceRowIndex < 0) {
        return Response.json({ error: "This candidate is not bound to a current image row." }, { status: 400 });
      }
      const { data: sourceImage, error: sourceImageError } = await supabase
        .from("offline_visit_images")
        .select("id,vision_result")
        .eq("id", sourceImageId)
        .maybeSingle();
      if (sourceImageError) throw new Error(sourceImageError.message);
      if (!sourceImage) {
        return Response.json({ code: "CANDIDATE_STALE", error: "This price row has changed. Reload the latest result." }, { status: 409 });
      }

      const { data: deleted, error: deleteError } = await supabase
        .from("ai_price_candidates")
        .delete()
        .eq("id", id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (deleteError) throw new Error(deleteError.message);
      if (!deleted) {
        return Response.json({ code: "CANDIDATE_STALE", error: "This price row has changed. Reload the latest result." }, { status: 409 });
      }
      const { data: updatedImage, error: imageUpdateError } = await supabase
        .from("offline_visit_images")
        .update({ vision_result: withHiddenPriceRow(sourceImage.vision_result, sourceRowIndex) })
        .eq("id", sourceImageId)
        .select("id")
        .maybeSingle();
      if (imageUpdateError || !updatedImage) throw new Error(imageUpdateError?.message ?? "Source image not found");
      return Response.json({ deleted_candidate_id: deleted.id, deleted_snapshot: false });
    }

    return Response.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return candidateMutationErrorResponse(error);
  }
}
