import { autoApproveAiPriceCandidatesForVisit } from "@/lib/ai-price-review";
import { generateAiPriceCandidates } from "@/lib/ai-price-candidates";
import {
  finalizeStoreVisitImageAnalysisStatuses,
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
        raw_piece_count_text: row.piece_count_text,
        raw_package_price_text: row.package_price_text,
        raw_net_price_text: row.net_price_text,
        raw_price_per_piece_text: row.visible_price_per_piece_text,
        visible_price_per_piece_idr: row.visible_price_per_piece_idr,
        price_basis: row.price_basis,
        legacy_confidence_fallback: row.legacy_confidence_fallback,
        price_evidence_status: row.price_evidence_status,
        price_evidence_confidence: row.price_evidence_confidence,
        price_evidence_detail: row.price_evidence_detail,
        review_decision: row.review_decision,
        conflicts: row.conflicts,
        type: "SKU" as const,
        tag: "HERO",
        confidence: row.ai_confidence ?? null,
        source: "key_sku" as const,
        sourceImageId: imageResult.imageId,
        sourceRowIndex: rowIndex,
      }))
    ));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function runStoreVisitAnalysis(input: {
  visitId: string;
  affectedImageIds?: string[];
  invalidateAffectedImageSnapshots?: boolean;
  forceAnalyzeImageIds?: string[];
  visitAnalysisStartedAt?: string;
}) {
  const supabase = createSupabaseServiceClient();
  const visitAnalysisStartedAt = input.visitAnalysisStartedAt ?? new Date().toISOString();

  const aiAnalysis = await runStoreVisitAiAnalysisForVisit({
    visitId: input.visitId,
    forceAnalyzeImageIds: input.forceAnalyzeImageIds,
  });
  await finalizeStoreVisitImageAnalysisStatuses({
    visitId: input.visitId,
    analyzedImageIds: aiAnalysis.price_image_results.map((item) => item.imageId),
    failedImages: aiAnalysis.price_image_failures ?? [],
    retakeRequiredImageIds: (aiAnalysis.price_image_retake_required ?? []).map((item) => item.imageId),
    affectedImageIds: input.affectedImageIds,
    supabase,
  });
  const hasRetakeRequiredImages = (aiAnalysis.price_image_retake_required ?? []).length > 0;
  const allFailuresAreRetakeRequired = Boolean(
    aiAnalysis.allPriceImagesFailed
    && hasRetakeRequiredImages
    && (aiAnalysis.price_image_failures ?? []).length === 0,
  );

  if (aiAnalysis.allPriceImagesFailed && !allFailuresAreRetakeRequired) {
    throw new Error("AI did not return a usable price-tag analysis result. Retry the failed photo later.");
  }

  const forcedImageIdSet = new Set((input.forceAnalyzeImageIds ?? []).map((value) => value.trim()).filter(Boolean));
  const retakeRequiredImageIdSet = new Set((aiAnalysis.price_image_retake_required ?? []).map((item) => item.imageId));
  const successfulForcedImageIds = (aiAnalysis.price_image_results ?? [])
    .map((item) => item.imageId)
    .filter((imageId) => forcedImageIdSet.has(imageId) && !retakeRequiredImageIdSet.has(imageId));

  let replacedCandidateCount = 0;
  let deletedSnapshotCount = 0;
  if (input.invalidateAffectedImageSnapshots && successfulForcedImageIds.length > 0) {
    const invalidation = await invalidateStoreVisitImagePriceImpact({
      visitId: input.visitId,
      imageIds: successfulForcedImageIds,
      lifecycleStatus: "reanalyzed",
      rejectionReason: "H5 re-analyze replaced the previous price result.",
      supabase,
    });
    replacedCandidateCount = invalidation.rejectedCandidateCount;
    deletedSnapshotCount = invalidation.deletedSnapshotCount;
  } else if (!input.invalidateAffectedImageSnapshots) {
    const invalidation = await invalidateStoreVisitLegacyUnscopedPriceImpact({
      visitId: input.visitId,
      lifecycleStatus: "reanalyzed",
      rejectionReason: "Visit re-analysis replaced legacy unscoped price results.",
      supabase,
    });
    replacedCandidateCount = invalidation.rejectedCandidateCount;
    deletedSnapshotCount = invalidation.deletedSnapshotCount;
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
  const priorAnalysisMetrics = isRecord(priorSummaryResult.analysis_metrics)
    ? priorSummaryResult.analysis_metrics as Record<string, unknown>
    : {};
  const firstVisitAnalysisStartedAt = typeof priorAnalysisMetrics.visit_analysis_started_at === "string"
    ? priorAnalysisMetrics.visit_analysis_started_at
    : visitAnalysisStartedAt;
  const firstVisitAnalysisCompletedAt = typeof priorAnalysisMetrics.visit_analysis_completed_at === "string"
    ? priorAnalysisMetrics.visit_analysis_completed_at
    : visitAnalysisCompletedAt;
  const firstVisitAnalysisDurationMs = isFiniteNumber(priorAnalysisMetrics.visit_analysis_duration_ms)
    ? priorAnalysisMetrics.visit_analysis_duration_ms
    : Math.max(
        0,
        new Date(firstVisitAnalysisCompletedAt).getTime() - new Date(firstVisitAnalysisStartedAt).getTime(),
      );

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
          ...priorAnalysisMetrics,
          visit_analysis_started_at: firstVisitAnalysisStartedAt,
          visit_analysis_completed_at: firstVisitAnalysisCompletedAt,
          visit_analysis_duration_ms: firstVisitAnalysisDurationMs,
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
    replacedCandidateCount,
    deletedSnapshotCount,
    forcedImageResults: successfulForcedImageIds.map((imageId) => {
      const result = aiAnalysis.price_image_results.find((item) => item.imageId === imageId);
      const metadata = result?.metadata && typeof result.metadata === "object" ? result.metadata as Record<string, unknown> : {};
      return {
        imageId,
        responseId: typeof metadata.response_id === "string"
          ? metadata.response_id
          : typeof metadata.provider_request_id === "string"
            ? metadata.provider_request_id
            : null,
        usagePresent: metadata.usage != null,
        rowCount: result?.result.rows.length ?? 0,
      };
    }),
  };
}
