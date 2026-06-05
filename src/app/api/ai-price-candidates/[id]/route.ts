import { revalidatePath } from "next/cache";
import { normalizePriceSnapshot } from "@/lib/business";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type { CompetitorProduct } from "@/lib/types";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "").trim();
    const reviewer = String(body.reviewer ?? "").trim() || null;
    const supabase = createSupabaseServiceClient();

    const { data: candidate, error } = await supabase
      .from("ai_price_candidates")
      .select("*, offline_store_visits(*)")
      .eq("id", id)
      .single();
    if (error || !candidate) return Response.json({ error: error?.message ?? "Candidate not found" }, { status: 404 });

    if (action !== "approve") {
      return Response.json({ error: "Unsupported action" }, { status: 400 });
    }
    if (candidate.status !== "pending") {
      return Response.json({ error: "Only pending candidates can be approved" }, { status: 400 });
    }

    const price = Number(body.price_idr ?? candidate.parsed_price_idr);
    if (!Number.isFinite(price) || price <= 0) {
      return Response.json({ error: "Valid price is required" }, { status: 400 });
    }
    const pieceCount = Number(body.piece_count ?? candidate.reviewed_piece_count ?? candidate.piece_count);
    if (!Number.isFinite(pieceCount) || pieceCount <= 0) {
      return Response.json({ error: "Valid piece count is required" }, { status: 400 });
    }

    let competitorProduct: CompetitorProduct | null = null;
    if (candidate.matched_entity_type === "competitor_product" && candidate.matched_entity_id) {
      const { data: product, error: productError } = await supabase
        .from("competitor_products")
        .select("*, brands(id,name), sku_matches(*, sku_master(*))")
        .eq("id", candidate.matched_entity_id)
        .single();
      if (productError || !product) return Response.json({ error: productError?.message ?? "Matched product not found" }, { status: 404 });
      competitorProduct = product as CompetitorProduct;
    } else {
      const brandName = String(candidate.raw_brand ?? "").trim();
      const productName = String(candidate.raw_product ?? "").trim();
      if (!brandName || !productName) {
        return Response.json({ error: "Brand and product are required to create a price monitor record" }, { status: 400 });
      }

      const { data: existingBrand, error: brandLookupError } = await supabase
        .from("brands")
        .select("*")
        .ilike("name", brandName)
        .limit(1)
        .maybeSingle();
      if (brandLookupError) return Response.json({ error: brandLookupError.message }, { status: 400 });

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
        if (brandCreateError) return Response.json({ error: brandCreateError.message }, { status: 400 });
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
      if (productLookupError) return Response.json({ error: productLookupError.message }, { status: 400 });

      competitorProduct = existingProduct as CompetitorProduct | null;
      if (!competitorProduct) {
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
            size: null,
            piece_count: Math.floor(pieceCount),
            segment: "unknown",
          })
          .select("*, brands(id,name), sku_matches(*, sku_master(*))")
          .single();
        if (productCreateError) return Response.json({ error: productCreateError.message }, { status: 400 });
        competitorProduct = createdProduct as CompetitorProduct;
      }
    }

    const normalized = normalizePriceSnapshot({
      promo_price_idr: price,
      voucher_value_idr: 0,
      shipping_subsidy_idr: 0,
      piece_count: Math.floor(pieceCount),
    });

    const visit = candidate.offline_store_visits as { store_name?: string | null; visit_date?: string | null } | null;
    const { data: snapshot, error: snapshotError } = await supabase
      .from("price_snapshots")
      .insert({
        competitor_product_id: competitorProduct.id,
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
    if (snapshotError) return Response.json({ error: snapshotError.message }, { status: 400 });

    const { data: updated, error: updateError } = await supabase
      .from("ai_price_candidates")
      .update({
        status: "approved",
        parsed_price_idr: price,
        reviewed_piece_count: Math.floor(pieceCount),
        reviewed_price_per_piece: normalized.price_per_piece,
        price_snapshot_id: snapshot.id,
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewer,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (updateError) return Response.json({ error: updateError.message }, { status: 400 });

    revalidatePath("/zh/offline-price-candidates");
    revalidatePath("/en/offline-price-candidates");
    revalidatePath("/zh/prices");
    revalidatePath("/en/prices");
    revalidatePath("/zh/competitors");
    revalidatePath("/en/competitors");
    return Response.json({ candidate: updated, snapshot });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = createSupabaseServiceClient();
    const { data: candidate, error: lookupError } = await supabase
      .from("ai_price_candidates")
      .select("id,status")
      .eq("id", id)
      .single();
    if (lookupError || !candidate) return Response.json({ error: lookupError?.message ?? "Candidate not found" }, { status: 404 });
    if (candidate.status === "approved") {
      return Response.json({ error: "Approved candidates cannot be deleted" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("ai_price_candidates")
      .delete()
      .eq("id", id)
      .select("id")
      .single();
    if (error || !data) return Response.json({ error: error?.message ?? "Candidate not found" }, { status: 404 });

    revalidatePath("/zh/offline-price-candidates");
    revalidatePath("/en/offline-price-candidates");
    return Response.json({ deleted: true, id: data.id });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
