import { revalidatePath } from "next/cache";
import { autoApproveAiPriceCandidatesForVisit } from "@/lib/ai-price-review";
import { generateAiPriceCandidates } from "@/lib/ai-price-candidates";
import { runStoreVisitAiAnalysisForVisit } from "@/lib/store-visit-ai-debug";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { requireAppSession } from "@/lib/auth-session";
import type { OfflineStoreVisit } from "@/lib/types";

async function failVisit(visitId: string, message: string) {
  const supabase = createSupabaseServiceClient();
  await supabase
    .from("offline_store_visits")
    .update({
      analysis_status: "failed",
      visit_status: "uploaded",
      analysis_error: message,
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

    const aiAnalysis = await runStoreVisitAiAnalysisForVisit({ visitId });
    const aiResult = aiAnalysis.normalized;
    const sourceItems = (aiAnalysis.price_image_results ?? []).flatMap((imageResult) => (
      imageResult.result.rows.map((row, rowIndex) => ({
        brand: row.brand ?? "Unknown",
        product: row.sku,
        price: row.net_price_idr ? String(row.net_price_idr) : "",
        list_price: row.list_price_idr ? String(row.list_price_idr) : null,
        package_price: row.package_price_idr ? String(row.package_price_idr) : null,
        net_price: row.net_price_idr ? String(row.net_price_idr) : null,
        promo_type: row.promo_type,
        piece_count: row.piece_count,
        type: "SKU" as const,
        tag: "HERO",
        confidence: 0.9,
        source: "key_sku" as const,
        sourceImageId: imageResult.imageId,
        sourceRowIndex: rowIndex,
      }))
    ));
    const candidates = await generateAiPriceCandidates({ visitId, aiResult, sourceItems });
    const autoReview = await autoApproveAiPriceCandidatesForVisit({ supabase, visitId, candidates });
    const autoReviewedCount = autoReview.approvedCount;

    const { data: updated, error: updateError } = await supabase
      .from("offline_store_visits")
      .update({
        ai_result: aiResult,
        summary_result: {
          ai_result_card: aiResult,
          raw_ai_text: aiAnalysis.rawText,
          raw_ai_parsed: aiAnalysis.parsed,
          price_image_results: aiAnalysis.price_image_results ?? [],
          display_analysis: aiAnalysis.display_analysis ?? null,
          ai_provider_metadata: aiAnalysis.metadata,
          ai_config: {
            id: aiAnalysis.config.id,
            version_name: aiAnalysis.config.version_name,
            temperature: aiAnalysis.config.temperature,
            max_tokens: aiAnalysis.config.max_tokens,
          },
          image_paths: aiAnalysis.image_paths,
          image_categories: aiAnalysis.image_categories,
          signed_image_count: aiAnalysis.signed_image_count,
          image_input_mode: aiAnalysis.image_input_mode,
          ai_price_candidate_count: candidates.length,
          auto_reviewed_count: autoReviewedCount,
          auto_review_method: "auto_rule",
          auto_review_failed_count: autoReview.failedCount,
        },
        analysis_status: "completed",
        visit_status: "analyzed",
        analysis_error: null,
      })
      .eq("id", visitId)
      .select("*")
      .single();

    if (updateError) throw new Error(updateError.message);

    revalidatePath("/zh/mobile/offline-capture");
    revalidatePath(`/zh/mobile/offline-capture/${visitId}`);
    revalidatePath("/en/mobile/offline-capture");
    revalidatePath(`/en/mobile/offline-capture/${visitId}`);

    return Response.json({ visit: updated, visit_code: visitCode, ai_result: aiResult, auto_reviewed_count: autoReviewedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (visitId) await failVisit(visitId, message);
    return Response.json({ error: message }, { status: 500 });
  }
}
