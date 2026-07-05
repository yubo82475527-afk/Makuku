import { revalidatePath } from "next/cache";
import { runStoreVisitAnalysis } from "@/lib/store-visit-analysis";
import { requireAppSession } from "@/lib/auth-session";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { refreshStoreVisitStoredPriceState } from "@/lib/store-visit-image-maintenance";

export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, ctx: RouteContext) {
  const auth = await requireAppSession(request);
  if (auth.response) return auth.response;

  try {
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const fullVisit = body.full_visit === true;
    if (fullVisit && auth.session.role !== "admin") {
      return Response.json({ error: "Full visit re-analysis requires admin account" }, { status: 403 });
    }
    const affectedImageIds = Array.isArray(body.affected_image_ids)
      ? body.affected_image_ids.map((value: unknown) => String(value).trim()).filter(Boolean)
      : [];
    if (!fullVisit && affectedImageIds.length === 0) {
      return Response.json({ error: "affected_image_ids is required" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const { data: typedVisit, error: visitError } = await supabase
      .from("offline_store_visits")
      .select("analysis_status")
      .eq("id", id)
      .single();

    if (visitError) {
      return Response.json({ error: visitError.message }, { status: 500 });
    }

    if (typedVisit?.analysis_status === "analyzing") {
      return Response.json({
        error: "Another photo in this visit is still analyzing. Please wait for it to finish before updating the next photo.",
      }, { status: 409 });
    }

    let fullVisitImageIds: string[] = [];
    if (fullVisit) {
      const { data: fullVisitImages, error: fullVisitImagesError } = await supabase
        .from("offline_visit_images")
        .select("id")
        .eq("visit_id", id)
        .in("image_type", ["own_shelf", "competitor_shelf"])
        .is("deleted_at", null);

      if (fullVisitImagesError) {
        return Response.json({ error: fullVisitImagesError.message }, { status: 500 });
      }
      fullVisitImageIds = (fullVisitImages ?? [])
        .map((image) => String((image as { id?: unknown }).id ?? "").trim())
        .filter(Boolean);
      if (fullVisitImageIds.length === 0) {
        return Response.json({ error: "No price-tag photos found for full visit re-analysis" }, { status: 400 });
      }
    }

    const refreshImageIds = fullVisit ? fullVisitImageIds : affectedImageIds;

    await supabase
      .from("offline_visit_images")
      .update({
        analysis_status: "analyzing",
        vision_result: null,
        analysis_error: null,
        error_message: null,
      })
      .in("id", refreshImageIds)
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

    try {
      const result = await runStoreVisitAnalysis({
        visitId: id,
        affectedImageIds: refreshImageIds,
        invalidateAffectedImageSnapshots: true,
      });

      revalidatePath("/zh/mobile/offline-capture");
      revalidatePath(`/zh/mobile/offline-capture/${id}`);
      revalidatePath("/en/mobile/offline-capture");
      revalidatePath(`/en/mobile/offline-capture/${id}`);

      return Response.json({
        queued: false,
        visit_id: id,
        affected_image_ids: refreshImageIds,
        full_visit: fullVisit,
        visit: result.visit,
        ai_result: result.aiResult,
        auto_reviewed_count: result.autoReviewedCount,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[store-visit-refresh] analysis failed", {
        visit_id: id,
        affected_image_ids: refreshImageIds,
        error: message,
      });
      try {
        await supabase
          .from("offline_visit_images")
          .update({
            analysis_status: "failed",
            analysis_error: message,
            error_message: message,
          })
          .eq("visit_id", id)
          .in("id", refreshImageIds)
          .in("analysis_status", ["pending", "analyzing"]);

        await refreshStoreVisitStoredPriceState({
          visitId: id,
          analysisStatusOverride: "failed",
          analysisErrorOverride: message,
          visitStatusOverride: "analyzed",
          supabase,
        });
      } catch (refreshError) {
        console.error("[store-visit-refresh] failed to persist failure state", {
          visit_id: id,
          affected_image_ids: refreshImageIds,
          error: refreshError instanceof Error ? refreshError.message : String(refreshError),
        });
      }

      revalidatePath("/zh/mobile/offline-capture");
      revalidatePath(`/zh/mobile/offline-capture/${id}`);
      revalidatePath("/en/mobile/offline-capture");
      revalidatePath(`/en/mobile/offline-capture/${id}`);
      return Response.json({ error: message }, { status: 500 });
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
