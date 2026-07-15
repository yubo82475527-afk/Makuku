import { normalizePriceSnapshot } from "@/lib/business";
import { formReturnRedirect, readRequestBody } from "@/lib/request";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/auth-session";
import type { CompetitorProduct } from "@/lib/types";

export async function POST(request: Request, ctx: RouteContext<"/api/offline-uploads/[id]/confirm">) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;
    const { id } = await ctx.params;
    const { body, isForm } = await readRequestBody(request);
    const supabase = createSupabaseServiceClient();

    const { data: upload, error: uploadError } = await supabase
      .from("offline_uploads")
      .select("*, offline_ocr_results(*)")
      .eq("id", id)
      .single();
    if (uploadError || !upload) {
      return Response.json({ error: uploadError?.message ?? "Upload not found" }, { status: 404 });
    }

    const ocr = upload.offline_ocr_results?.[0];
    if (!ocr) return Response.json({ error: "OCR result not found" }, { status: 404 });

    const brandName = body.corrected_brand || ocr.detected_brand;
    const productName = body.corrected_product || ocr.detected_product;
    const price = Number(body.corrected_price_idr || ocr.detected_price_idr);
    const pieceCount = Number(body.corrected_piece_count || ocr.detected_piece_count);

    await supabase
      .from("offline_ocr_results")
      .update({
        reviewed: true,
        corrected_brand: brandName,
        corrected_product: productName,
        corrected_price_idr: price,
        corrected_piece_count: pieceCount,
      })
      .eq("id", ocr.id);

    const { data: brand } = await supabase.from("brands").select("*").ilike("name", brandName).limit(1).maybeSingle();
    if (!brand) return Response.json({ error: `Brand not found: ${brandName}` }, { status: 404 });

    const { data: product } = await supabase
      .from("competitor_products")
      .select("*, brands(id,name)")
      .eq("brand_id", brand.id)
      .eq("channel", "offline")
      .eq("size", body.size || null)
      .limit(1)
      .maybeSingle();

    let competitorProduct = product as CompetitorProduct | null;
    if (!competitorProduct) {
      const { data: created, error: createError } = await supabase
        .from("competitor_products")
        .insert({
          brand_id: brand.id,
          raw_title: productName,
          normalized_name: productName,
          channel: "offline",
          shop_name: upload.store_name,
          product_url: null,
          image_url: upload.image_url,
          pack_type: "pants",
          package_type: "unknown",
          size: body.size || null,
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
        channel: "offline",
        list_price_idr: price,
        package_price_idr: price,
        promo_price_idr: price,
        voucher_value_idr: 0,
        shipping_subsidy_idr: 0,
        net_price_idr: normalized.net_price_idr,
        price_per_piece: normalized.price_per_piece,
        promo_type: ocr.detected_promo_text || "offline_display",
        captured_at: new Date().toISOString(),
        source: "offline_upload",
        evidence_url: upload.image_url,
      })
      .select("*")
      .single();
    if (snapshotError) return Response.json({ error: snapshotError.message }, { status: 400 });

    const gap = null;
    const severity = "medium";

    const { data: event, error: eventError } = await supabase
      .from("promo_events")
      .insert({
        competitor_product_id: competitorProduct.id,
        sku_master_id: null,
        channel: "offline",
        event_type: "offline_display",
        event_title: `${brandName} offline promo at ${upload.store_name}`,
        event_summary: `${productName} observed in ${upload.city} at IDR ${Math.round(normalized.price_per_piece)}/pc.`,
        old_price_per_piece: null,
        new_price_per_piece: normalized.price_per_piece,
        price_gap_vs_makuku_pct: gap,
        severity,
        city: upload.city,
        started_at: new Date().toISOString(),
        evidence_url: upload.image_url,
      })
      .select("*")
      .single();
    if (eventError) return Response.json({ error: eventError.message }, { status: 400 });

    await supabase.from("offline_uploads").update({ upload_status: "reviewed" }).eq("id", id);
    if (isForm) return formReturnRedirect(request, body, "/offline-uploads");
    return Response.json({ snapshot, event });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
