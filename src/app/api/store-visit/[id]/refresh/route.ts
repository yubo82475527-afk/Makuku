import { revalidatePath } from "next/cache";
import { runStoreVisitAnalysis } from "@/lib/store-visit-analysis";
import { requireAppSession } from "@/lib/auth-session";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { refreshStoreVisitStoredPriceState } from "@/lib/store-visit-image-maintenance";

export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ id: string }>;
};

type RefreshImageRow = {
  id: string;
  image_type: string | null;
  deleted_at?: string | null;
  replaced_by_image_id?: string | null;
};

const priceImageTypes = ["own_shelf", "competitor_shelf"] as const;

function isActivePriceImage(image: RefreshImageRow) {
  return priceImageTypes.includes(image.image_type as (typeof priceImageTypes)[number])
    && !image.deleted_at
    && !image.replaced_by_image_id;
}

function uniqueIds(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

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
    const affectedImageIds = uniqueIds(Array.isArray(body.affected_image_ids)
      ? body.affected_image_ids.map((value: unknown) => String(value).trim()).filter(Boolean)
      : []);
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

    let refreshImageIds: string[] = [];
    if (fullVisit) {
      const { data: fullVisitImages, error: fullVisitImagesError } = await supabase
        .from("offline_visit_images")
        .select("id,image_type,deleted_at,replaced_by_image_id")
        .eq("visit_id", id)
        .in("image_type", ["own_shelf", "competitor_shelf"])
        .is("deleted_at", null)
        .is("replaced_by_image_id", null);

      if (fullVisitImagesError) {
        return Response.json({ error: fullVisitImagesError.message }, { status: 500 });
      }
      refreshImageIds = uniqueIds((fullVisitImages ?? []).map((image) => String((image as { id?: unknown }).id ?? "")));
      if (refreshImageIds.length === 0) {
        return Response.json({ error: "No price-tag photos found for full visit re-analysis" }, { status: 400 });
      }
    } else {
      const { data: affectedImages, error: affectedImagesError } = await supabase
        .from("offline_visit_images")
        .select("id,image_type,deleted_at,replaced_by_image_id")
        .eq("visit_id", id)
        .in("id", affectedImageIds);
      if (affectedImagesError) {
        return Response.json({ error: affectedImagesError.message }, { status: 500 });
      }
      const imageRows = (affectedImages ?? []) as RefreshImageRow[];
      const foundIds = new Set(imageRows.map((image) => image.id));
      const missingIds = affectedImageIds.filter((imageId) => !foundIds.has(imageId));
      if (missingIds.length > 0) {
        return Response.json({ error: "Some requested photos were not found for this visit.", missing_image_ids: missingIds }, { status: 404 });
      }
      const inactiveOrNonPriceIds = imageRows.filter((image) => !isActivePriceImage(image)).map((image) => image.id);
      if (inactiveOrNonPriceIds.length > 0) {
        return Response.json({
          error: "Only active price-tag photos can be re-analyzed.",
          invalid_image_ids: inactiveOrNonPriceIds,
        }, { status: 400 });
      }
      refreshImageIds = affectedImageIds;
    }

    const { data: analyzingImages, error: analyzingError } = await supabase
      .from("offline_visit_images")
      .update({
        analysis_status: "analyzing",
        analysis_error: null,
        error_message: null,
      })
      .in("id", refreshImageIds)
      .eq("visit_id", id)
      .select("id");
    if (analyzingError) {
      return Response.json({ error: analyzingError.message }, { status: 500 });
    }
    const analyzingImageIds = uniqueIds((analyzingImages ?? []).map((image) => String((image as { id?: unknown }).id ?? "")));
    if (analyzingImageIds.length !== refreshImageIds.length) {
      return Response.json({
        error: "Unable to mark all requested photos for re-analysis.",
        expected_image_ids: refreshImageIds,
        updated_image_ids: analyzingImageIds,
      }, { status: 500 });
    }

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
        forceAnalyzeImageIds: refreshImageIds,
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
        forced_image_ids: refreshImageIds,
        analyzed_image_ids: result.aiAnalysis.price_image_results.map((item) => item.imageId),
        failed_image_ids: result.aiAnalysis.price_image_failures.map((item) => item.imageId),
        replaced_candidate_count: result.replacedCandidateCount,
        deleted_snapshot_count: result.deletedSnapshotCount,
        forced_image_results: result.forcedImageResults.map((item) => ({
          image_id: item.imageId,
          response_id: item.responseId,
          usage_present: item.usagePresent,
          row_count: item.rowCount,
        })),
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
