import { revalidatePath } from "next/cache";
import { normalizePriceSnapshot } from "@/lib/business";
import { createSupabaseServiceClient } from "@/lib/supabase";

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

    if (action === "reject") {
      const { data, error: updateError } = await supabase
        .from("ai_price_candidates")
        .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: reviewer })
        .eq("id", id)
        .select("*")
        .single();
      if (updateError) return Response.json({ error: updateError.message }, { status: 400 });
      revalidatePath("/zh/offline-price-candidates");
      revalidatePath("/en/offline-price-candidates");
      return Response.json({ candidate: data });
    }

    if (action !== "approve") {
      return Response.json({ error: "Unsupported action" }, { status: 400 });
    }

    if (candidate.matched_entity_type !== "competitor_product" || !candidate.matched_entity_id) {
      return Response.json({ error: "Only matched competitor products can be approved into price monitor in v1." }, { status: 400 });
    }
    const price = Number(body.price_idr ?? candidate.parsed_price_idr);
    if (!Number.isFinite(price) || price <= 0) {
      return Response.json({ error: "Valid price is required" }, { status: 400 });
    }
    const pieceCount = Number(body.piece_count ?? candidate.reviewed_piece_count ?? candidate.piece_count);
    if (!Number.isFinite(pieceCount) || pieceCount <= 0) {
      return Response.json({ error: "Valid piece count is required" }, { status: 400 });
    }

    const { data: product, error: productError } = await supabase
      .from("competitor_products")
      .select("*")
      .eq("id", candidate.matched_entity_id)
      .single();
    if (productError || !product) return Response.json({ error: productError?.message ?? "Matched product not found" }, { status: 404 });

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
        competitor_product_id: product.id,
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
    return Response.json({ candidate: updated, snapshot });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
