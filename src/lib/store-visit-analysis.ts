import { autoApproveAiPriceCandidatesForVisit } from "@/lib/ai-price-review";
import { generateAiPriceCandidates } from "@/lib/ai-price-candidates";
import { invalidateStoreVisitImagePriceImpact, invalidateStoreVisitLegacyUnscopedPriceImpact } from "@/lib/store-visit-image-maintenance";
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

export async function runStoreVisitAnalysis(input: {
  visitId: string;
  affectedImageIds?: string[];
  invalidateAffectedImageSnapshots?: boolean;
}) {
  const supabase = createSupabaseServiceClient();
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
  if (aiAnalysis.allPriceImagesFailed) {
    throw new Error("AI 暂时没有返回可用的价格解析结果，请稍后重试失败照片。");
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
  const analysisStatus = aiAnalysis.partialFailure ? "partial" : "completed";
  const partialAnalysisError = aiAnalysis.partialFailure
    ? "部分图片未解析成功，已成功解析的价格可以先复核；失败图片可稍后重试。"
    : null;

  const { data: updated, error: updateError } = await supabase
    .from("offline_store_visits")
    .update({
      ai_result: aiAnalysis.normalized,
      summary_result: {
        ai_result_card: aiAnalysis.normalized,
        raw_ai_text: aiAnalysis.rawText,
        raw_ai_parsed: aiAnalysis.parsed,
        price_image_results: aiAnalysis.price_image_results ?? [],
        analysis_partial_failures: aiAnalysis.price_image_failures ?? [],
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
      },
      analysis_status: analysisStatus,
      visit_status: "analyzed",
      analysis_error: partialAnalysisError,
    })
    .eq("id", input.visitId)
    .select("*")
    .single();

  if (updateError) throw new Error(updateError.message);

  return {
    visit: updated,
    aiResult: aiAnalysis.normalized,
    autoReviewedCount: autoReview.approvedCount,
    aiAnalysis,
  };
}
