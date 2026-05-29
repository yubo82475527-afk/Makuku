import { createSupabaseServiceClient } from "@/lib/supabase";
import { formReturnRedirect, readRequestBody } from "@/lib/request";

export async function POST(request: Request) {
  try {
    const { body, isForm } = await readRequestBody(request);
    const supabase = createSupabaseServiceClient();
    const { data: product, error } = await supabase
      .from("competitor_products")
      .insert({
        brand_id: body.brand_id,
        raw_title: body.raw_title,
        normalized_name: body.normalized_name,
        channel: body.channel,
        shop_name: body.shop_name || null,
        product_url: body.product_url || null,
        image_url: body.image_url || null,
        pack_type: body.pack_type,
        size: body.size,
        piece_count: Number(body.piece_count),
        segment: body.segment,
      })
      .select("*")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 400 });

    if (body.sku_master_id) {
      const { error: matchError } = await supabase.from("sku_matches").insert({
        competitor_product_id: product.id,
        sku_master_id: body.sku_master_id,
        match_score: Number(body.match_score ?? 0.85),
        match_method: body.match_method ?? "manual",
        reviewed: body.reviewed === "on" || body.reviewed === true,
      });
      if (matchError) return Response.json({ error: matchError.message }, { status: 400 });
    }

    if (isForm) return formReturnRedirect(request, body, "/competitors");
    return Response.json({ data: product });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
