import { createSupabaseServiceClient } from "@/lib/supabase";
import type { PriceSnapshot } from "@/lib/types";

const csvColumns = [
  "snapshot_id",
  "captured_at",
  "brand",
  "product",
  "channel",
  "list_price_idr",
  "promo_price_idr",
  "voucher_value_idr",
  "shipping_subsidy_idr",
  "net_price_idr",
  "price_per_piece",
  "promo_type",
  "source",
  "evidence_url",
  "created_at",
];

function csvEscape(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadName() {
  const date = new Date().toISOString().slice(0, 10);
  return `price-snapshots-${date}.csv`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const brand = searchParams.get("brand");
    const channel = searchParams.get("channel");
    const sku = searchParams.get("sku");
    const supabase = createSupabaseServiceClient();

    const { data, error } = await supabase
      .from("price_snapshots")
      .select("*, competitor_products(*, brands(id,name), sku_matches(*, sku_master(*)))")
      .order("captured_at", { ascending: false })
      .limit(5000);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const snapshots = ((data ?? []) as PriceSnapshot[]).filter((snapshot) => {
      const product = snapshot.competitor_products;
      const match = product?.sku_matches?.[0];
      if (brand && product?.brand_id !== brand) return false;
      if (channel && snapshot.channel !== channel) return false;
      if (sku && match?.sku_master_id !== sku) return false;
      return true;
    });

    const rows = snapshots.map((snapshot) => [
      snapshot.id,
      snapshot.captured_at,
      snapshot.competitor_products?.brands?.name,
      snapshot.competitor_products?.normalized_name,
      snapshot.channel,
      snapshot.list_price_idr,
      snapshot.promo_price_idr,
      snapshot.voucher_value_idr,
      snapshot.shipping_subsidy_idr,
      snapshot.net_price_idr,
      snapshot.price_per_piece,
      snapshot.promo_type,
      snapshot.source,
      snapshot.evidence_url,
      snapshot.created_at,
    ].map(csvEscape).join(","));

    const csv = [csvColumns.join(","), ...rows].join("\r\n");
    return new Response(`\uFEFF${csv}`, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="${downloadName()}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Export failed" }, { status: 500 });
  }
}
