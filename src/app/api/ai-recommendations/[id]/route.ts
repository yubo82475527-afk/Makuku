import { createSupabaseServiceClient } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/auth-session";

export async function PATCH(request: Request, ctx: RouteContext<"/api/ai-recommendations/[id]">) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;
    const { id } = await ctx.params;
    const body = await request.json();
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("ai_strategy_recommendations")
      .update({
        status: body.status,
        reviewer_note: body.reviewer_note ?? null,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
