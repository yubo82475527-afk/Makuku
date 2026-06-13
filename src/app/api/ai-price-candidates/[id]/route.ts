import { revalidatePath } from "next/cache";
import { approveAiPriceCandidate, ensureCompetitorProduct, rejectAiPriceCandidate } from "@/lib/ai-price-review";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/auth-session";
import type { AiPriceCandidateMatchType } from "@/lib/types";

type CompetitorProductMatchRow = {
  id: string;
  normalized_name: string;
  brands?: { id?: string; name?: string | null } | Array<{ id?: string; name?: string | null }> | null;
};

function revalidateReviewPaths() {
  revalidatePath("/zh/offline-price-candidates");
  revalidatePath("/en/offline-price-candidates");
  revalidatePath("/zh/prices");
  revalidatePath("/en/prices");
  revalidatePath("/zh/competitors");
  revalidatePath("/en/competitors");
  revalidatePath("/zh/competitor-products");
  revalidatePath("/en/competitor-products");
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "").trim();
    const reviewer = String(body.reviewer ?? "").trim() || null;
    const supabase = createSupabaseServiceClient();

    if (action === "save_review_input") {
      const price = Number(body.price_idr);
      const pieceCount = Number(body.piece_count);
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(pieceCount) || pieceCount <= 0) {
        return Response.json({ error: "Valid package price and piece count are required" }, { status: 400 });
      }

      const pricePerPiece = Math.round(price / Math.floor(pieceCount) * 100) / 100;
      const { data: candidate, error } = await supabase
        .from("ai_price_candidates")
        .update({
          parsed_price_idr: Math.round(price),
          piece_count: Math.floor(pieceCount),
          price_per_piece: pricePerPiece,
        })
        .eq("id", id)
        .eq("status", "pending")
        .select("*")
        .single();
      if (error || !candidate) throw new Error(error?.message ?? "Pending candidate not found");
      revalidateReviewPaths();
      return Response.json({ candidate });
    }

    if (action === "update_match") {
      const matchType = String(body.matched_entity_type ?? "").trim() as AiPriceCandidateMatchType;
      const matchId = String(body.matched_entity_id ?? "").trim() || null;
      let matchedLabel = String(body.matched_label ?? "").trim() || null;

      if (matchType !== "material_master" && matchType !== "competitor_product" && matchType !== "unmatched") {
        return Response.json({ error: "matched_entity_type is invalid" }, { status: 400 });
      }
      if (matchType !== "unmatched" && !matchId) {
        return Response.json({ error: "matched_entity_id is required" }, { status: 400 });
      }

      if (matchType === "material_master") {
        const { data: material, error: materialError } = await supabase
          .from("material_master")
          .select("tenant_sku_code,tenant_sku_name")
          .eq("tenant_sku_code", matchId)
          .maybeSingle();
        if (materialError || !material) return Response.json({ error: materialError?.message ?? "Makuku SKU not found" }, { status: 400 });
        matchedLabel = matchedLabel ?? `${material.tenant_sku_code} 路 ${material.tenant_sku_name}`;
      }

      if (matchType === "competitor_product") {
        const { data: product, error: productError } = await supabase
          .from("competitor_products")
          .select("id,normalized_name,brands(id,name)")
          .eq("id", matchId)
          .maybeSingle();
        if (productError || !product) return Response.json({ error: productError?.message ?? "Competitor product not found" }, { status: 400 });
        const row = product as CompetitorProductMatchRow;
        const brandName = Array.isArray(row.brands) ? row.brands[0]?.name : row.brands?.name;
        matchedLabel = matchedLabel ?? [brandName, row.normalized_name].filter(Boolean).join(" 路 ");
      }

      const { data: candidate, error } = await supabase
        .from("ai_price_candidates")
        .update({
          matched_entity_type: matchType,
          matched_entity_id: matchType === "unmatched" ? null : matchId,
          matched_label: matchType === "unmatched" ? null : matchedLabel,
          match_score: matchType === "unmatched" ? 0 : 1,
        })
        .eq("id", id)
        .eq("status", "pending")
        .select("*")
        .single();
      if (error || !candidate) throw new Error(error?.message ?? "Pending candidate not found");
      revalidateReviewPaths();
      return Response.json({ candidate });
    }

    if (action === "create_competitor_match") {
      const { data: sourceCandidate, error: sourceError } = await supabase
        .from("ai_price_candidates")
        .select("*, offline_store_visits(*)")
        .eq("id", id)
        .eq("status", "pending")
        .single();
      if (sourceError || !sourceCandidate) throw new Error(sourceError?.message ?? "Pending candidate not found");

      const pieceCount = Number(body.piece_count ?? sourceCandidate.reviewed_piece_count ?? sourceCandidate.piece_count);
      if (!Number.isFinite(pieceCount) || pieceCount <= 0) {
        return Response.json({ error: "Valid piece count is required" }, { status: 400 });
      }

      const product = await ensureCompetitorProduct(supabase, sourceCandidate, Math.floor(pieceCount));
      const matchedLabel = [product.brands?.name, product.normalized_name].filter(Boolean).join(" 路 ");
      const { data: candidate, error } = await supabase
        .from("ai_price_candidates")
        .update({
          matched_entity_type: "competitor_product",
          matched_entity_id: product.id,
          matched_label: matchedLabel,
          match_score: 1,
        })
        .eq("id", id)
        .eq("status", "pending")
        .select("*")
        .single();
      if (error || !candidate) throw new Error(error?.message ?? "Pending candidate not found");
      revalidateReviewPaths();
      return Response.json({ candidate, product });
    }

    if (action === "approve") {
      const createCompetitorIfUnmatched = Boolean(body.create_competitor_if_unmatched);
      const result = await approveAiPriceCandidate({
        supabase,
        candidateId: id,
        priceIdr: body.price_idr ? Number(body.price_idr) : null,
        pieceCount: body.piece_count ? Number(body.piece_count) : null,
        reviewer,
        reviewMethod: "manual",
        createCompetitorIfUnmatched,
      });
      revalidateReviewPaths();
      return Response.json(result);
    }

    if (action === "reject") {
      const candidate = await rejectAiPriceCandidate({
        supabase,
        candidateId: id,
        reason: String(body.reason ?? "Rejected by reviewer"),
        reviewer,
        reviewMethod: "manual",
      });
      revalidateReviewPaths();
      return Response.json({ candidate });
    }

    return Response.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;
  return Response.json({ error: "Use PATCH action=reject to keep review audit history." }, { status: 405 });
}
