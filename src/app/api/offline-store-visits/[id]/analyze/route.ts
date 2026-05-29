import { createSupabaseServiceClient } from "@/lib/supabase";

export async function POST(request: Request, ctx: RouteContext<"/api/offline-store-visits/[id]/analyze">) {
  try {
    const { id } = await ctx.params;
    const supabase = createSupabaseServiceClient();
    const { data: images, error } = await supabase
      .from("offline_visit_images")
      .select("id, analysis_status")
      .eq("visit_id", id)
      .in("analysis_status", ["pending", "failed"]);
    if (error) return Response.json({ error: error.message }, { status: 400 });

    const baseUrl = new URL(request.url);
    await Promise.all((images ?? []).map((image) =>
      fetch(new URL(`/api/offline-visit-images/${image.id}/analyze`, baseUrl), { method: "POST" }).catch(() => null),
    ));

    return Response.json({ queued: images?.length ?? 0 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
