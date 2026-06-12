import {
  calculatePriceGapVsMakuku,
  detectPromoEvent,
  normalizePriceSnapshot,
  shouldCreateAlertFromPromoEvent,
} from "@/lib/business";
import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { formReturnRedirect, readRequestBody } from "@/lib/request";
import { requireAdminSession } from "@/lib/auth-session";
import { ensureSkuMasterFromMaterial } from "@/lib/sku-master-bridge";
import type { CompetitorProduct, PriceSnapshot, PromoEvent, SkuMatch, SkuMaster } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;
    const { body, isForm } = await readRequestBody(request);
    const supabase = createSupabaseServiceClient();

    const { data: product, error: productError } = await supabase
      .from("competitor_products")
      .select("*, brands(id,name), sku_matches(*, sku_master(*))")
      .eq("id", body.competitor_product_id)
      .single();
    if (productError || !product) {
      return Response.json({ error: productError?.message ?? "Product not found" }, { status: 404 });
    }

    const competitorProduct = product as CompetitorProduct;
    const pieceCount = competitorProduct.piece_count ?? Number(body.piece_count ?? 0);
    const normalized = normalizePriceSnapshot({
      promo_price_idr: Number(body.promo_price_idr),
      voucher_value_idr: Number(body.voucher_value_idr ?? 0),
      shipping_subsidy_idr: Number(body.shipping_subsidy_idr ?? 0),
      piece_count: pieceCount,
    });

    const { data: snapshot, error: snapshotError } = await supabase
      .from("price_snapshots")
      .insert({
        competitor_product_id: competitorProduct.id,
        sku_master_id: null,
        channel: body.channel ?? competitorProduct.channel,
        list_price_idr: Number(body.list_price_idr),
        promo_price_idr: Number(body.promo_price_idr),
        voucher_value_idr: Number(body.voucher_value_idr ?? 0),
        shipping_subsidy_idr: Number(body.shipping_subsidy_idr ?? 0),
        net_price_idr: normalized.net_price_idr,
        price_per_piece: normalized.price_per_piece,
        promo_type: body.promo_type || null,
        captured_at: body.captured_at || new Date().toISOString(),
        source: body.source || "manual",
        evidence_url: body.evidence_url || competitorProduct.product_url,
      })
      .select("*")
      .single();
    if (snapshotError) return Response.json({ error: snapshotError.message }, { status: 400 });

    const { data: previous } = await supabase
      .from("price_snapshots")
      .select("*")
      .eq("competitor_product_id", competitorProduct.id)
      .neq("id", snapshot.id)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const skuMatch = competitorProduct.sku_matches?.[0] as SkuMatch | undefined;
    const skuMaster = skuMatch?.sku_master as SkuMaster | undefined;
    const eventPayload = detectPromoEvent({
      priceSnapshot: snapshot as PriceSnapshot,
      previousSnapshot: previous as PriceSnapshot | null,
      competitorProduct,
      skuMaster,
    });

    let promoEvent: PromoEvent | null = null;
    if (eventPayload) {
      const { data: insertedEvent, error: eventError } = await supabase
        .from("promo_events")
        .insert(eventPayload)
        .select("*")
        .single();
      if (eventError) return Response.json({ error: eventError.message }, { status: 400 });
      promoEvent = insertedEvent as PromoEvent;

      if (shouldCreateAlertFromPromoEvent(promoEvent)) {
        await supabase.from("alerts").insert({
          promo_event_id: promoEvent.id,
          title: promoEvent.severity === "critical" ? "Critical competitor price alert" : "High risk competitor promo",
          message: `${promoEvent.event_title} (${calculatePriceGapVsMakuku(promoEvent.new_price_per_piece ?? 0, skuMaster?.target_price_per_piece ?? 1)}% vs Makuku target).`,
          severity: promoEvent.severity,
        });
      }
    }

    if (isForm) return formReturnRedirect(request, body, "/prices");
    return Response.json({ data: snapshot, promo_event: promoEvent });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;

    const body = await request.json().catch(() => ({}));
    const snapshotId = String(body.id ?? "").trim();
    const ownerType = String(body.owner_type ?? body.ownerType ?? "").trim();
    const competitorProductId = String(body.competitor_product_id ?? "").trim();
    const materialSkuCode = body.material_sku_code !== null && body.material_sku_code !== undefined
      ? String(body.material_sku_code).trim()
      : "";

    if (!snapshotId || !["competitor", "makuku"].includes(ownerType)) {
      return Response.json({ error: "id and owner_type are required" }, { status: 400 });
    }
    if (ownerType === "competitor" && !competitorProductId) {
      return Response.json({ error: "competitor_product_id is required for competitor snapshots" }, { status: 400 });
    }
    if (ownerType === "makuku" && !materialSkuCode) {
      return Response.json({ error: "material_sku_code is required for Makuku snapshots" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    let competitorProduct: CompetitorProduct | null = null;
    let skuMasterId: string | null = null;

    if (ownerType === "competitor") {
      const { data: product, error: productError } = await supabase
        .from("competitor_products")
        .select("*, brands(id,name), sku_matches(*, sku_master(*))")
        .eq("id", competitorProductId)
        .single();
      if (productError || !product) {
        return Response.json({ error: productError?.message ?? "Product not found" }, { status: 404 });
      }
      competitorProduct = product as CompetitorProduct;
    } else {
      skuMasterId = await ensureSkuMasterFromMaterial(supabase, materialSkuCode);
    }

    const { data: snapshot, error: snapshotError } = await supabase
      .from("price_snapshots")
      .select("*")
      .eq("id", snapshotId)
      .single();
    if (snapshotError || !snapshot) {
      return Response.json({ error: snapshotError?.message ?? "Price snapshot not found" }, { status: 404 });
    }

    const pieceCount = ownerType === "competitor"
      ? Number(competitorProduct?.piece_count ?? 0)
      : await getSkuMasterPieceCount(supabase, skuMasterId);
    if (ownerType === "competitor" && !competitorProduct) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }
    const normalized = normalizePriceSnapshot({
      promo_price_idr: Number(snapshot.promo_price_idr ?? 0),
      voucher_value_idr: Number(snapshot.voucher_value_idr ?? 0),
      shipping_subsidy_idr: Number(snapshot.shipping_subsidy_idr ?? 0),
      piece_count: pieceCount,
    });

    const { data: updated, error: updateError } = await supabase
      .from("price_snapshots")
      .update({
        competitor_product_id: ownerType === "competitor" ? competitorProduct!.id : null,
        sku_master_id: ownerType === "makuku" ? skuMasterId : null,
        net_price_idr: normalized.net_price_idr,
        price_per_piece: normalized.price_per_piece,
      })
      .eq("id", snapshotId)
      .select("*, sku_master(*), competitor_products(*, brands(id,name), sku_matches(*, sku_master(*)))")
      .single();
    if (updateError) return Response.json({ error: updateError.message }, { status: 400 });

    revalidatePriceSnapshotPages();
    return Response.json({ data: updated });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Update failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;
    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body.ids)
      ? body.ids.map((id: unknown) => String(id).trim()).filter(Boolean)
      : [];

    if (ids.length === 0) {
      return Response.json({ error: "No price snapshots selected" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("price_snapshots")
      .delete()
      .in("id", ids)
      .select("id");

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    revalidatePath("/zh/prices");
    revalidatePath("/en/prices");
    revalidatePath("/zh/dashboard");
    revalidatePath("/en/dashboard");

    return Response.json({ deleted_count: data?.length ?? ids.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Delete failed" }, { status: 500 });
  }
}

function revalidatePriceSnapshotPages() {
  revalidatePath("/zh/prices");
  revalidatePath("/en/prices");
  revalidatePath("/zh/dashboard");
  revalidatePath("/en/dashboard");
}

async function getSkuMasterPieceCount(supabase: ReturnType<typeof createSupabaseServiceClient>, skuMasterId: string | null) {
  if (!skuMasterId) return 0;
  const { data, error } = await supabase
    .from("sku_master")
    .select("piece_count")
    .eq("id", skuMasterId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "SKU master not found");
  return Number(data.piece_count ?? 0);
}
