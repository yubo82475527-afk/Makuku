import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/auth-session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, ctx: RouteContext) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;
    if (!hasSupabaseServiceConfig()) {
      return Response.json({ error: "Missing Supabase service configuration" }, { status: 500 });
    }

    const { id } = await ctx.params;
    const supabase = createSupabaseServiceClient();
    const { data: target, error: targetError } = await supabase
      .from("store_visit_ai_configs")
      .select("*")
      .eq("id", id)
      .single();
    if (targetError || !target) return Response.json({ error: targetError?.message ?? "Config not found" }, { status: 404 });

    const { error: archiveError } = await supabase
      .from("store_visit_ai_configs")
      .update({ status: "archived" })
      .eq("status", "active")
      .neq("id", id);
    if (archiveError) throw new Error(archiveError.message);

    const { data, error } = await supabase
      .from("store_visit_ai_configs")
      .update({ status: "active", activated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    revalidatePath("/zh/store-visit-ai-debug");
    revalidatePath("/en/store-visit-ai-debug");
    return Response.json({ config: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
