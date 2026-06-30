import { autoApproveAiPriceCandidatesForVisit } from "@/lib/ai-price-review";
import { generateAiPriceCandidates } from "@/lib/ai-price-candidates";
import {
  invalidateStoreVisitImagePriceImpact,
  invalidateStoreVisitLegacyUnscopedPriceImpact,
} from "@/lib/store-visit-image-maintenance";
import { runStoreVisitAiAnalysisForVisit } from "@/lib/store-visit-ai-debug";
import { createSupabaseServiceClient } from "@/lib/supabase";

function buildSourceItems(
  aiAnalysis: Awaited<ReturnType<typeof runStoreVisitAiAnalysisForVisit>>,
  affectedImageIds?: string[],
) {
  const affectedImageIdSet = affectedImageIds?.length ? new Set(affectedImageIds) : null;
  return (aiAnalysis.price_image_results ?? [])
    .filter((imageResult) => !affectedImageIdSet || affectedImageIdSet.has(imageResult.imageId))
    .flatMap((imageResult) => (
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
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function runStoreVisitAnalysis(input: {
  visitId: string;
  affectedImageIds?: string[];
  invalidateAffectedImageSnapshots?: boolean;
  visitAnalysisStartedAt?: string;
}) {
  const supabase = createSupabaseServiceClient();
  const visitAnalysisStartedAt = input.visitAnalysisStartedAt ?? new Date().toISOString();

  if (input.invalidateAffectedImageSnapshots && input.affectedImageIds?.length) {
    await invalidateStoreVisitImagePriceImpact({
      visitId: input.visitId,
      imageIds: input.affectedImageIds,
      lifecycleStatus: "reanalyzed",
      rejectionReason: "H5 re-analyze replaced the previous price result.",
      supabase,
    });
  } else {
    await invalidateStoreVisitLegacyUnscopedPriceImpact({
      visitId: input.visitId,
      lifecycleStatus: "reanalyzed",
      rejectionReason: "Visit re-analysis replaced legacy unscoped price results.",
      supabase,
    });
  }

  const aiAnalysis = await runStoreVisitAiAnalysisForVisit({ visitId: input.visitId });
  const hasRetakeRequiredImages = (aiAnalysis.price_image_retake_required ?? []).length > 0;
  const allFailuresAreRetakeRequired = Boolean(
    aiAnalysis.allPriceImagesFailed
    && hasRetakeRequiredImages
    && (aiAnalysis.price_image_failures ?? []).length === 0,
  );

  if (aiAnalysis.allPriceImagesFailed && !allFailuresAreRetakeRequired) {
    throw new Error("AI did not return a usable price-tag analysis result. Retry the failed photo later.");
  }

  const sourceItems = buildSourceItems(aiAnalysis, input.affectedImageIds);
  const candidates = await generateAiPriceCandidates({
    visitId: input.visitId,
    aiResult: aiAnalysis.normalized,
    sourceItems,
    affectedImageIds: input.affectedImageIds,
  });
  const autoReview = await autoApproveAiPriceCandidatesForVisit({
    supabase,
    visitId: input.visitId,
    candidates,
  });

  const analysisStatus = hasRetakeRequiredImages
    ? "action_required"
    : aiAnalysis.partialFailure
      ? "partial"
      : "completed";

  const partialAnalysisError = aiAnalysis.partialFailure
    ? hasRetakeRequiredImages
      ? "price_photo_retake_required: Some price-tag photos need to be re-uploaded. Parsed prices from other photos can be reviewed first."
      : "Some photos failed analysis. Parsed prices from successful photos can be reviewed first, and failed photos can be retried later."
    : null;

  const analysisError = hasRetakeRequiredImages
    ? "price_photo_retake_required: Price-tag photos need to be re-uploaded."
    : partialAnalysisError;

  const visitAnalysisCompletedAt = new Date().toISOString();
  const visitAnalysisDurationMs = Math.max(
    0,
    new Date(visitAnalysisCompletedAt).getTime() - new Date(visitAnalysisStartedAt).getTime(),
  );
  const priceImageSuccessCount = aiAnalysis.price_image_results.length;

  const { data: visitBeforeUpdate, error: visitBeforeUpdateError } = await supabase
    .from("offline_store_visits")
    .select("summary_result")
    .eq("id", input.visitId)
    .single();

  if (visitBeforeUpdateError) throw new Error(visitBeforeUpdateError.message);

  const priorSummaryResult = isRecord(visitBeforeUpdate?.summary_result) ? visitBeforeUpdate.summary_result : {};

  const { data: updated, error: updateError } = await supabase
    .from("offline_store_visits")
    .update({
      ai_result: aiAnalysis.normalized,
      summary_result: {
        ...priorSummaryResult,
        ai_result_card: aiAnalysis.normalized,
        raw_ai_text: aiAnalysis.rawText,
        raw_ai_parsed: aiAnalysis.parsed,
        price_image_results: aiAnalysis.price_image_results ?? [],
        analysis_partial_failures: aiAnalysis.price_image_failures ?? [],
        price_image_retake_required: aiAnalysis.price_image_retake_required ?? [],
        display_analysis: null,
        display_analysis_error: null,
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
        auto_reviewed_count: autoReview.approvedCount,
        auto_review_method: "auto_rule",
        auto_review_failed_count: autoReview.failedCount,
        analysis_metrics: {
          ...(isRecord(priorSummaryResult.analysis_metrics)
            ? priorSummaryResult.analysis_metrics as Record<string, unknown>
            : {}),
          visit_analysis_started_at: visitAnalysisStartedAt,
          visit_analysis_completed_at: visitAnalysisCompletedAt,
          visit_analysis_duration_ms: visitAnalysisDurationMs,
          price_image_count: aiAnalysis.price_image_results.length + aiAnalysis.price_image_failures.length,
          price_image_success_count: priceImageSuccessCount,
          price_image_failure_count: aiAnalysis.price_image_failures.length,
          price_image_retake_required_count: aiAnalysis.price_image_retake_required.length,
          price_image_parallelism: 5,
        },
      },
      analysis_status: analysisStatus,
      visit_status: "analyzed",
      analysis_error: analysisError,
    })
    .eq("id", input.visitId)
    .select("*")
    .single();

  if (updateError) throw new Error(updateError.message);

  return {
    visit: updated,
    aiResult: aiAnalysis.normalized,
    autoReviewedCount: autoReview.approvedCount,
    visitAnalysisDurationMs,
    aiAnalysis,
  };
}
