import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { isAllowedAdminRole, requireAppSession } from "@/lib/auth-session";
import {
  createStoreVisitAiJob,
  triggerStoreVisitAiJobRunner,
} from "@/lib/store-visit-ai-jobs";
import type { OfflineStoreVisit } from "@/lib/types";

function revalidateVisitPaths(visitId: string) {
  revalidatePath("/zh/mobile/offline-capture");
  revalidatePath(`/zh/mobile/offline-capture/${visitId}`);
  revalidatePath("/en/mobile/offline-capture");
  revalidatePath(`/en/mobile/offline-capture/${visitId}`);
}

function activePriceImageIds(visit: OfflineStoreVisit) {
  return (visit.offline_visit_images ?? [])
    .filter((image) => (
      (image.image_type === "own_shelf" || image.image_type === "competitor_shelf")
      && !image.deleted_at
      && !image.replaced_by_image_id
    ))
    .map((image) => image.id);
}

export async function POST(request: Request) {
  const auth = await requireAppSession(request);
  if (auth.response) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const requestedVisitId = String(body.visit_id ?? "").trim();
    const requestedVisitCode = String(body.visit_code ?? "").trim();
    if (!requestedVisitId && !requestedVisitCode) {
      return Response.json({ error: "Missing visit_id or visit_code" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const visitQuery = supabase
      .from("offline_store_visits")
      .select("*, offline_visit_images(id,image_type,deleted_at,replaced_by_image_id)");
    const { data: visit, error } = requestedVisitId
      ? await visitQuery.eq("id", requestedVisitId).single()
      : await visitQuery.eq("visit_code", requestedVisitCode).single();
    if (error || !visit) return Response.json({ error: error?.message ?? "Visit not found" }, { status: 404 });

    const typedVisit = visit as OfflineStoreVisit;
    const canAnalyzeVisit = isAllowedAdminRole(auth.session.role)
      || typedVisit.user_id === auth.session.id
      || typedVisit.uploader_user_id === auth.session.id;
    if (!canAnalyzeVisit) {
      return Response.json({ error: "Visit not found" }, { status: 404 });
    }

    const visitId = typedVisit.id;
    const visitCode = typedVisit.visit_code ?? requestedVisitCode;
    const isInitialWholeVisitAnalysis = typedVisit.visit_status === "uploaded"
      && (!typedVisit.analysis_status || typedVisit.analysis_status === "pending");
    if (!isInitialWholeVisitAnalysis) {
      return Response.json(
        { error: "This visit is not waiting for initial AI analysis." },
        { status: 400 },
      );
    }

    const imageIds = activePriceImageIds(typedVisit);
    if (imageIds.length === 0) {
      return Response.json({ error: "No price-tag photos found for this visit" }, { status: 400 });
    }

    const created = await createStoreVisitAiJob({
      visitId,
      jobType: "initial_analysis",
      imageIds,
      createdBy: auth.session.id,
      requestSnapshot: {
        visit_code: visitCode,
        source: "h5_initial_analysis",
      },
      supabase,
    });

    if (created.conflict) {
      return Response.json({
        error: "Another AI analysis job is already running for this visit.",
        active_ai_job: created.summary,
      }, { status: 409 });
    }

    revalidateVisitPaths(visitId);
    after(() => triggerStoreVisitAiJobRunner({ requestUrl: request.url, jobId: created.job?.id }));

    return Response.json({
      queued: true,
      visit_id: visitId,
      visit_code: visitCode,
      job: created.job,
      active_ai_job: created.summary,
      reused: created.reused,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
