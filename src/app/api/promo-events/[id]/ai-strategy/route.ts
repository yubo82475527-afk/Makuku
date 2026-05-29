import { generateAIStrategy } from "@/lib/business";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type { PromoEvent } from "@/lib/types";

export async function POST(_request: Request, ctx: RouteContext<"/api/promo-events/[id]/ai-strategy">) {
  try {
    const { id } = await ctx.params;
    const supabase = createSupabaseServiceClient();
    const { data: event, error } = await supabase
      .from("promo_events")
      .select("*, competitor_products(*, brands(id,name)), sku_master(*)")
      .eq("id", id)
      .single();
    if (error || !event) return Response.json({ error: error?.message ?? "Event not found" }, { status: 404 });

    const strategy = await generateAIStrategy({
      promoEvent: event as PromoEvent,
      competitorProduct: event.competitor_products,
      skuMaster: event.sku_master,
    });
    const { data, error: insertError } = await supabase
      .from("ai_strategy_recommendations")
      .insert(strategy)
      .select("*")
      .single();
    if (insertError) return Response.json({ error: insertError.message }, { status: 400 });
    return Response.json({ data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
