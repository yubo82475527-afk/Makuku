import { normalizePriceSnapshot } from "@/lib/business";
import { formReturnRedirect, readRequestBody } from "@/lib/request";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/auth-session";
import type { CompetitorProduct } from "@/lib/types";

export async function POST(request: Request, ctx: RouteContext<"/api/offline-visit-images/[id]/confirm">) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;
    const { id } = await ctx.params;
    const { body, isForm } = await readRequestBody(request);
    const supabase = createSupabaseServiceClient();
    const { data: image, error: imageError } = await supabase
      .from("offline_visit_images")
      .select("*, offline_store_visits(*)")
      .eq("id", id)
      .single();
    if (imageError || !image) {
      return Response.json({ error: imageError?.message ?? "Image not found" }, { status: 404 });
    }

    const brandName = String(body.brand_name ?? "").trim();
    const productName = String(body.product_name ?? "").trim();
    const price = Number(body.promo_price_idr);
    const pieceCount = Number(body.total_piece_count || body.piece_count);
    const size = String(body.size ?? "").trim() || null;
    const packType = String(body.pack_type ?? "unknown");
    const promoMechanic = String(body.promo_mechanic ?? "offline_display");

    if (!brandName || !productName || !Number.isFinite(price) || price <= 0 || !Number.isFinite(pieceCount) || pieceCount <= 0) {
      return Response.json({ error: "Missing required confirmation fields" }, { status: 400 });
    }

    const { data: brand } = await supabase
      .from("brands")
      .select("*")
      .ilike("name", brandName)
      .limit(1)
      .maybeSingle();
    if (!brand) return Response.json({ error: `Brand not found: ${brandName}` }, { status: 404 });

    const visit = image.offline_store_visits as { store_id?: string | null; store_name: string; city: string } | null;
    const { data: existingProduct } = await supabase
      .from("competitor_products")
      .select("*, brands(id,name)")
      .eq("brand_id", brand.id)
      .eq("channel", "offline")
      .eq("normalized_name", productName)
      .limit(1)
      .maybeSingle();

    let competitorProduct = existingProduct as CompetitorProduct | null;
    if (!competitorProduct) {
      const { data: created, error: createError } = await supabase
        .from("competitor_products")
        .insert({
          brand_id: brand.id,
          raw_title: productName,
          normalized_name: productName,
          channel: "offline",
          shop_name: visit?.store_name ?? null,
          product_url: null,
          image_url: image.image_url,
          pack_type: packType,
          package_type: "unknown",
          size,
          piece_count: pieceCount,
          segment: "unknown",
        })
        .select("*, brands(id,name)")
        .single();
      if (createError) return Response.json({ error: createError.message }, { status: 400 });
      competitorProduct = created as CompetitorProduct;
    }

    const normalized = normalizePriceSnapshot({
      promo_price_idr: price,
      voucher_value_idr: 0,
      shipping_subsidy_idr: 0,
      piece_count: pieceCount,
    });

    const { data: snapshot, error: snapshotError } = await supabase
      .from("price_snapshots")
      .insert({
        competitor_product_id: competitorProduct.id,
        offline_store_id: visit?.store_id ?? null,
        channel: "offline",
        list_price_idr: Number(body.list_price_idr || price),
        package_price_idr: price,
        promo_price_idr: price,
        voucher_value_idr: 0,
        shipping_subsidy_idr: 0,
        net_price_idr: normalized.net_price_idr,
        price_per_piece: normalized.price_per_piece,
        promo_type: promoMechanic,
        captured_at: new Date().toISOString(),
        source: "offline_store_visit",
        evidence_url: image.image_url,
      })
      .select("*")
      .single();
    if (snapshotError) return Response.json({ error: snapshotError.message }, { status: 400 });

    let event = null;
    if (body.create_event === "on" || body.create_event === "true" || body.create_event === true) {
      const gap = null;
      const severity = "medium";
      const { data: createdEvent, error: eventError } = await supabase
        .from("promo_events")
        .insert({
          competitor_product_id: competitorProduct.id,
          sku_master_id: null,
          channel: "offline",
          event_type: promoMechanic === "unknown" ? "offline_display" : promoMechanic,
          event_title: `${brandName} offline promo at ${visit?.store_name ?? "store"}`,
          event_summary: `${productName} observed in ${visit?.city ?? "unknown city"} at IDR ${Math.round(normalized.price_per_piece)}/pc.`,
          old_price_per_piece: null,
          new_price_per_piece: normalized.price_per_piece,
          price_gap_vs_makuku_pct: gap,
          severity,
          city: visit?.city ?? null,
          started_at: new Date().toISOString(),
          evidence_url: image.image_url,
        })
        .select("*")
        .single();
      if (eventError) return Response.json({ error: eventError.message }, { status: 400 });
      event = createdEvent;

    }

    await supabase.from("offline_visit_images").update({ analysis_status: "reviewed" }).eq("id", id);
    await supabase.from("offline_store_visits").update({ visit_status: "reviewed" }).eq("id", image.visit_id);

    if (isForm) return formReturnRedirect(request, body, `/offline-uploads/${image.visit_id}`);
    return Response.json({ snapshot, event });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
