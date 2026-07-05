import { requireAppSession } from "@/lib/auth-session";
import { approveAiPriceCandidate, syncCandidateMatchToPriceSnapshot, syncCandidateReviewInputToPriceSnapshot } from "@/lib/ai-price-review";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type { AiPriceCandidate, AiPriceCandidateMatchType } from "@/lib/types";

function cleanOptionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
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

    const { data: sourceCandidate, error: sourceCandidateError } = await supabase
      .from("ai_price_candidates")
      .select("*")
      .eq("id", id)
      .in("status", ["pending", "approved"])
      .maybeSingle();
    if (sourceCandidateError) throw new Error(sourceCandidateError.message);
    if (!sourceCandidate) throw new Error("Pending or approved candidate not found");

    if (action === "save_review_input") {
      const h5RowPatch = buildReviewInputPatch(body);
      if ("error" in h5RowPatch) return Response.json({ error: h5RowPatch.error }, { status: 400 });
      const { data: candidate, error } = await supabase
        .from("ai_price_candidates")
        .update(h5RowPatch.patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error || !candidate) throw new Error(error?.message ?? "Pending or approved candidate not found");
      if (candidate.price_snapshot_id) {
        await syncCandidateReviewInputToPriceSnapshot(supabase, candidate as AiPriceCandidate);
      }
      return Response.json({ candidate });
    }

    if (action === "update_match") {
      const matchPatch = await buildMatchPatch(supabase, body);
      if ("response" in matchPatch) return matchPatch.response;
      const { data: candidate, error } = await supabase
        .from("ai_price_candidates")
        .update(matchPatch.patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error || !candidate) throw new Error(error?.message ?? "Pending or approved candidate not found");
      if (candidate.price_snapshot_id) {
        await syncCandidateMatchToPriceSnapshot(supabase, candidate as AiPriceCandidate);
      }
      return Response.json({ candidate });
    }

    if (action === "save_h5_row") {
      const h5RowPatch = buildReviewInputPatch(body);
      if ("error" in h5RowPatch) return Response.json({ error: h5RowPatch.error }, { status: 400 });
      const matchPatch = await buildMatchPatch(supabase, body);
      if ("response" in matchPatch) return matchPatch.response;

      const { data: candidate, error } = await supabase
        .from("ai_price_candidates")
        .update({
          ...h5RowPatch.patch,
          ...matchPatch.patch,
        })
        .eq("id", id)
        .select("*")
        .single();
      if (error || !candidate) throw new Error(error?.message ?? "Pending or approved candidate not found");
      if (candidate.price_snapshot_id) {
        await syncCandidateReviewInputToPriceSnapshot(supabase, candidate as AiPriceCandidate);
        await syncCandidateMatchToPriceSnapshot(supabase, candidate as AiPriceCandidate);
      }
      return Response.json({ candidate });
    }

    if (action === "confirm_h5_row") {
      const candidateRow = sourceCandidate as AiPriceCandidate;
      if (candidateRow.status !== "pending") {
        return Response.json({ error: "Only pending candidates can be confirmed" }, { status: 400 });
      }
      if (candidateRow.matched_entity_type === "unmatched" || !candidateRow.matched_entity_id) {
        return Response.json({ error: "Please match a product before confirming this row" }, { status: 400 });
      }
      const price = Number(candidateRow.net_price_idr ?? candidateRow.parsed_price_idr);
      const pieceCount = Number(candidateRow.reviewed_piece_count ?? candidateRow.piece_count);
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
      });
      return Response.json(result);
    }

    return Response.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
