import { revalidatePath } from "next/cache";
import { runStoreVisitAnalysis } from "@/lib/store-visit-analysis";
import { requireAppSession } from "@/lib/auth-session";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { refreshStoreVisitStoredPriceState } from "@/lib/store-visit-image-maintenance";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, ctx: RouteContext) {
  const auth = await requireAppSession(request);
  if (auth.response) return auth.response;

  try {
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const affectedImageIds = Array.isArray(body.affected_image_ids)
      ? body.affected_image_ids.map((value: unknown) => String(value).trim()).filter(Boolean)
      : [];
    if (affectedImageIds.length === 0) {
      return Response.json({ error: "affected_image_ids is required" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    await supabase
      .from("offline_visit_images")
      .update({
        analysis_status: "analyzing",
        analysis_error: null,
        error_message: null,
      })
      .in("id", affectedImageIds)
      .eq("visit_id", id);

    await refreshStoreVisitStoredPriceState({
      visitId: id,
      analysisStatusOverride: "analyzing",
      analysisErrorOverride: null,
      visitStatusOverride: "analyzing",
      supabase,
    });

    revalidatePath("/zh/mobile/offline-capture");
    revalidatePath(`/zh/mobile/offline-capture/${id}`);
    revalidatePath("/en/mobile/offline-capture");
    revalidatePath(`/en/mobile/offline-capture/${id}`);

    queueMicrotask(() => {
      void (async () => {
        try {
          await runStoreVisitAnalysis({
            visitId: id,
            affectedImageIds,
            invalidateAffectedImageSnapshots: true,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          console.error("[store-visit-refresh] async refresh failed", {
            visit_id: id,
            affected_image_ids: affectedImageIds,
            error: message,
          });
          try {
            await refreshStoreVisitStoredPriceState({
              visitId: id,
              analysisStatusOverride: "failed",
              analysisErrorOverride: message,
              visitStatusOverride: "uploaded",
            });
          } catch (refreshError) {
            console.error("[store-visit-refresh] failed to persist async failure state", {
              visit_id: id,
              affected_image_ids: affectedImageIds,
              error: refreshError instanceof Error ? refreshError.message : String(refreshError),
            });
          }
          revalidatePath("/zh/mobile/offline-capture");
          revalidatePath(`/zh/mobile/offline-capture/${id}`);
          revalidatePath("/en/mobile/offline-capture");
          revalidatePath(`/en/mobile/offline-capture/${id}`);
        }
      })();
    });

    return Response.json({
      queued: true,
      visit_id: id,
      affected_image_ids: affectedImageIds,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
