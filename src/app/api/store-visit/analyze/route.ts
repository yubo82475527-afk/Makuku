import { revalidatePath } from "next/cache";
import { runStoreVisitAnalysis } from "@/lib/store-visit-analysis";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { requireAppSession } from "@/lib/auth-session";
import type { OfflineStoreVisit } from "@/lib/types";

async function failVisit(visitId: string, message: string) {
  const supabase = createSupabaseServiceClient();
  const completedAt = new Date().toISOString();
  await supabase
    .from("offline_store_visits")
    .update({
      analysis_status: "failed",
      visit_status: "analyzed",
      analysis_error: message,
      summary_result: {
        analysis_metrics: {
          visit_analysis_completed_at: completedAt,
          visit_analysis_duration_ms: null,
          price_image_parallelism: 5,
        },
      },
    })
    .eq("id", visitId);
}

export async function POST(request: Request) {
  const auth = await requireAppSession(request);
  if (auth.response) return auth.response;
  let visitId = "";
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
      .select("*, offline_visit_images(id)");
    const { data: visit, error } = requestedVisitId
      ? await visitQuery.eq("id", requestedVisitId).single()
      : await visitQuery.eq("visit_code", requestedVisitCode).single();
    if (error || !visit) return Response.json({ error: error?.message ?? "Visit not found" }, { status: 404 });

    const typedVisit = visit as OfflineStoreVisit;
    visitId = typedVisit.id;
    const visitCode = typedVisit.visit_code ?? requestedVisitCode;
    const isInitialWholeVisitAnalysis = typedVisit.visit_status === "uploaded"
      && (!typedVisit.analysis_status || typedVisit.analysis_status === "pending");
    if (!isInitialWholeVisitAnalysis) {
      return Response.json(
        { error: "Please open the visit details and handle photos one by one with single-photo retake, replacement, or re-analysis." },
        { status: 400 },
      );
    }
    const legacyImageCount = Array.isArray(typedVisit.image_urls) ? typedVisit.image_urls.length : 0;
    const tableImageCount = Array.isArray(typedVisit.offline_visit_images) ? typedVisit.offline_visit_images.length : 0;
    if (legacyImageCount + tableImageCount === 0) {
      await failVisit(visitId, "No images found for this visit");
      return Response.json({ error: "No images found for this visit" }, { status: 400 });
    }

    await supabase
      .from("offline_store_visits")
      .update({
        analysis_status: "analyzing",
        visit_status: "analyzing",
        analysis_error: null,
      })
      .eq("id", visitId);

    const analysisStartedAt = new Date();
    const result = await runStoreVisitAnalysis({ visitId, visitAnalysisStartedAt: analysisStartedAt.toISOString() });

    revalidatePath("/zh/mobile/offline-capture");
    revalidatePath(`/zh/mobile/offline-capture/${visitId}`);
    revalidatePath("/en/mobile/offline-capture");
    revalidatePath(`/en/mobile/offline-capture/${visitId}`);

    return Response.json({
      visit: result.visit,
      visit_code: visitCode,
      ai_result: result.aiResult,
      auto_reviewed_count: result.autoReviewedCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (visitId) await failVisit(visitId, message);
    return Response.json({ error: message }, { status: 500 });
  }
}
