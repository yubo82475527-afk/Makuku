import { createSupabaseServiceClient } from "@/lib/supabase";
import { formReturnRedirect, readRequestBody } from "@/lib/request";

export async function POST(request: Request) {
  try {
    const { body, isForm } = await readRequestBody(request);
    const supabase = createSupabaseServiceClient();
    const payload = {
      makuku_sku_name: body.makuku_sku_name,
      pack_type: body.pack_type,
      size: body.size,
      piece_count: Number(body.piece_count),
      segment: body.segment,
      target_price_per_piece: Number(body.target_price_per_piece),
      floor_price_per_piece: Number(body.floor_price_per_piece),
      gross_margin_rate: Number(body.gross_margin_rate),
      active: body.active !== false,
    };
    const { data, error } = await supabase.from("sku_master").insert(payload).select("*").single();
    if (error) return Response.json({ error: error.message }, { status: 400 });
    if (isForm) return formReturnRedirect(request, body, "/sku-master");
    return Response.json({ data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    if (!body.id) return Response.json({ error: "Missing id" }, { status: 400 });
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("sku_master")
      .update({
        makuku_sku_name: body.makuku_sku_name,
        pack_type: body.pack_type,
        size: body.size,
        piece_count: Number(body.piece_count),
        segment: body.segment,
        target_price_per_piece: Number(body.target_price_per_piece),
        floor_price_per_piece: Number(body.floor_price_per_piece),
        gross_margin_rate: Number(body.gross_margin_rate),
        active: body.active !== false,
      })
      .eq("id", body.id)
      .select("*")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
