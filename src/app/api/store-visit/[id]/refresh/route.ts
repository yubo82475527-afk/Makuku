import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { isAllowedAdminRole, requireAppSession } from "@/lib/auth-session";
import { isSupportedStoreVisitImageFile, unsupportedStoreVisitImageFormatMessage } from "@/lib/store-visit-image-errors";
import { createSupabaseServiceClient } from "@/lib/supabase";
import {
  createStoreVisitAiJob,
  triggerStoreVisitAiJobRunner,
} from "@/lib/store-visit-ai-jobs";
import { syncStoreVisitPriceCandidatesFromImages } from "@/lib/store-visit-price-candidate-sync";

export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ id: string }>;
};

type RefreshImageRow = {
  id: string;
  image_type: string | null;
  content_type?: string | null;
  file_name?: string | null;
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

function revalidateVisitPaths(visitId: string) {
  revalidatePath("/zh/mobile/offline-capture");
  revalidatePath(`/zh/mobile/offline-capture/${visitId}`);
  revalidatePath("/en/mobile/offline-capture");
  revalidatePath(`/en/mobile/offline-capture/${visitId}`);
}

async function loadVisitAccessRow(supabase: ReturnType<typeof createSupabaseServiceClient>, visitId: string) {
  const current = await supabase
    .from("offline_store_visits")
    .select("id,analysis_status,user_id,uploader_user_id")
    .eq("id", visitId)
    .single();
  if (!current.error || !current.error.message.includes("user_id")) return current;

  const legacy = await supabase
    .from("offline_store_visits")
    .select("id,analysis_status,uploader_user_id")
    .eq("id", visitId)
    .single();
  return {
    data: legacy.data ? { ...legacy.data, user_id: null } : legacy.data,
    error: legacy.error,
  };
}

export async function POST(request: Request, ctx: RouteContext) {
  const auth = await requireAppSession(request);
  if (auth.response) return auth.response;

  try {
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const fullVisit = body.full_visit === true;
    if (fullVisit && auth.session.role !== "admin") {
      return Response.json({ error: "Full visit AI analysis requires admin account" }, { status: 403 });
    }

    const affectedImageIds = uniqueIds(Array.isArray(body.affected_image_ids)
      ? body.affected_image_ids.map((value: unknown) => String(value).trim()).filter(Boolean)
      : []);
    if (!fullVisit && affectedImageIds.length === 0) {
      return Response.json({ error: "affected_image_ids is required" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const { data: visit, error: visitError } = await loadVisitAccessRow(supabase, id);
    if (visitError || !visit) return Response.json({ error: visitError?.message ?? "Visit not found" }, { status: 404 });
    const visitRow = visit as { user_id?: string | null; uploader_user_id?: string | null };
    const canRefreshVisit = isAllowedAdminRole(auth.session.role)
      || visitRow.user_id === auth.session.id
      || visitRow.uploader_user_id === auth.session.id;
    if (!canRefreshVisit) {
      return Response.json({ error: "Visit not found" }, { status: 404 });
    }

    let refreshImageIds: string[] = [];
    let refreshImages: RefreshImageRow[] = [];
    if (fullVisit) {
      const { data: fullVisitImages, error: fullVisitImagesError } = await supabase
        .from("offline_visit_images")
        .select("id,image_type,file_name,content_type,deleted_at,replaced_by_image_id")
        .eq("visit_id", id)
        .in("image_type", ["own_shelf", "competitor_shelf"])
        .is("deleted_at", null)
        .is("replaced_by_image_id", null);
      if (fullVisitImagesError) return Response.json({ error: fullVisitImagesError.message }, { status: 500 });
      refreshImages = (fullVisitImages ?? []) as RefreshImageRow[];
      refreshImageIds = uniqueIds((fullVisitImages ?? []).map((image) => String((image as { id?: unknown }).id ?? "")));
      if (refreshImageIds.length === 0) {
        return Response.json({ error: "No price-tag photos found for full visit AI analysis" }, { status: 400 });
      }
    } else {
      const { data: affectedImages, error: affectedImagesError } = await supabase
        .from("offline_visit_images")
        .select("id,image_type,file_name,content_type,deleted_at,replaced_by_image_id")
        .eq("visit_id", id)
        .in("id", affectedImageIds);
      if (affectedImagesError) return Response.json({ error: affectedImagesError.message }, { status: 500 });

      refreshImages = (affectedImages ?? []) as RefreshImageRow[];
      const foundIds = new Set(refreshImages.map((image) => image.id));
      const missingIds = affectedImageIds.filter((imageId) => !foundIds.has(imageId));
      if (missingIds.length > 0) {
        return Response.json({ error: "Some requested photos were not found for this visit.", missing_image_ids: missingIds }, { status: 404 });
      }

      const inactiveOrNonPriceIds = refreshImages.filter((image) => !isActivePriceImage(image)).map((image) => image.id);
      if (inactiveOrNonPriceIds.length > 0) {
        return Response.json({
          error: "Only active price-tag photos can be Analyzed.",
          invalid_image_ids: inactiveOrNonPriceIds,
        }, { status: 400 });
      }
      refreshImageIds = affectedImageIds;
    }

    const unsupportedImage = refreshImages
      .find((image) => !isSupportedStoreVisitImageFile({ contentType: image.content_type, fileName: image.file_name }));
    if (unsupportedImage) {
      return Response.json({
        error: unsupportedStoreVisitImageFormatMessage(unsupportedImage.file_name),
        invalid_image_ids: [unsupportedImage.id],
      }, { status: 400 });
    }

    const created = await createStoreVisitAiJob({
      visitId: id,
      jobType: fullVisit ? "full_visit_reanalysis" : "single_image_reanalysis",
      imageIds: refreshImageIds,
      createdBy: auth.session.id,
      requestSnapshot: {
        full_visit: fullVisit,
        affected_image_ids: refreshImageIds,
        requester_role: auth.session.role,
      },
      supabase,
    });

    if (created.conflict) {
      return Response.json({
        error: "Another AI analysis job is already running for this visit.",
        active_ai_job: created.summary,
      }, { status: 409 });
    }

    revalidateVisitPaths(id);
    after(() => triggerStoreVisitAiJobRunner({ requestUrl: request.url, jobId: created.job?.id }));
    const syncResult = await syncStoreVisitPriceCandidatesFromImages({
      visitId: id,
      imageIds: refreshImageIds,
      supabase,
    });

    return Response.json({
      queued: true,
      visit_id: id,
      affected_image_ids: refreshImageIds,
      full_visit: fullVisit,
      job: created.job,
      active_ai_job: created.summary,
      reused: created.reused,
      candidate_sync: syncResult,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
