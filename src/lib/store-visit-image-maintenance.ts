import { createSupabaseServiceClient } from "@/lib/supabase";
import { summarizeBrandSkuCounts } from "@/lib/store-visit-summary";
import type {
  OfflineStoreVisit,
  OfflineVisitImage,
  StoreVisitAiResult,
  StoreVisitAnalysisStatus,
  StoreVisitImageCategory,
  StoreVisitPriceImageAnalysis,
} from "@/lib/types";

type SupabaseServiceClient = ReturnType<typeof import("@/lib/supabase").createSupabaseServiceClient>;

type ImageLifecycleStatus = "deleted" | "replaced" | "reanalyzed";
type CandidateDisposition = "delete" | "reject";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asPriceImageAnalysis(value: unknown): StoreVisitPriceImageAnalysis | null {
  if (!isRecord(value) || value.schema_version !== "store_visit_price_image_v1" || !Array.isArray(value.rows)) {
    return null;
  }
  return value as StoreVisitPriceImageAnalysis;
}

function isRetakeRequiredResult(result: StoreVisitPriceImageAnalysis | null) {
  return result?.photo_quality?.status === "retake_required";
}

function toImageCategory(image: OfflineVisitImage): StoreVisitImageCategory {
  if (image.image_type === "own_shelf") return "makuku_shelf";
  if (image.image_type === "competitor_shelf") return "competitor_shelf";
  return "storefront";
}

function isPriceCategory(category: StoreVisitImageCategory) {
  return category === "makuku_shelf" || category === "competitor_shelf";
}

function isImageReplaced(image: OfflineVisitImage) {
  return Boolean(image.replaced_by_image_id)
    || (isRecord(image.vision_result) && (image.vision_result as Record<string, unknown>).is_replaced === true);
}

function isImageDeleted(image: OfflineVisitImage) {
  const deletedAt = image.deleted_at;
  if (deletedAt) return true;
  return isRecord(image.vision_result) && (image.vision_result as Record<string, unknown>).h5_deleted === true;
}

export function isInactiveVisitImage(image: OfflineVisitImage) {
  return isImageReplaced(image) || isImageDeleted(image);
}

function composeStoreVisitAiResult({
  rows,
  partialFailure,
}: {
  rows: StoreVisitPriceImageAnalysis["rows"];
  partialFailure: boolean;
}): StoreVisitAiResult {
  const warnings: StoreVisitAiResult["validation"]["warnings"] = rows.length > 0
    ? []
    : [{ type: "MISSING_DATA", message: "No readable price rows detected." }];
  if (partialFailure) {
    warnings.push({ type: "LOW_CONFIDENCE", message: "Some price-tag photos failed analysis and need retry." });
  }

  return {
    raw_extraction: {
      detected_items: rows.map((row) => ({
        brand: row.brand ?? "Unknown",
        product: row.sku,
        price: row.net_price_idr ? String(row.net_price_idr) : "",
        type: "SKU",
        confidence: 0.9,
      })),
    },
    validation: {
      is_valid: rows.length > 0,
      warnings,
    },
    shelf_understanding: {
      brands_present: [],
      category_coverage: "PARTIAL",
      shelf_condition: "NORMAL",
      facings_estimate: [],
    },
    price_insights: {
      brand_price_range: [],
      key_sku_prices: rows.map((row) => ({
        brand: row.brand ?? "Unknown",
        product: row.sku,
        price: row.net_price_idr ? String(row.net_price_idr) : "",
        list_price: row.list_price_idr ? String(row.list_price_idr) : null,
        package_price: row.package_price_idr ? String(row.package_price_idr) : null,
        net_price: row.net_price_idr ? String(row.net_price_idr) : null,
        promo_type: row.promo_type,
        piece_count: row.piece_count,
        tag: "HERO",
        confidence: 0.9,
      })),
    },
    price_detection: rows.map((row) => ({
      brand: row.brand ?? "Unknown",
      product: row.sku,
      price: row.net_price_idr ? String(row.net_price_idr) : "",
    })),
    stock_risk: {
      level: "Normal",
      affected_brands: [],
      reason: "Display-level stock risk is not available for this analysis.",
    },
    promotion_insights: {
      competitor_promotions: [],
      promo_pressure_level: "LOW",
    },
    competitor_promotion: [],
    store_summary: summarizeBrandSkuCounts(rows, "en") ?? `${rows.length} SKU row(s) parsed.`,
  };
}

function missingLifecycleColumns(error: { message?: string | null } | null) {
  const message = error?.message ?? "";
  return message.includes("h5_lifecycle_status") || message.includes("h5_lifecycle_at") || message.includes("schema cache");
}

function imageHasPersistedFinalEvidence(image: OfflineVisitImage) {
  return Boolean(asPriceImageAnalysis(image.vision_result))
    || Boolean(image.analysis_error || image.error_message);
}

function recoverStaleImageStatus(image: OfflineVisitImage, hasCompletedAnalysisMetrics: boolean) {
  if (!hasCompletedAnalysisMetrics) return null;
  if (image.analysis_status !== "pending" && image.analysis_status !== "analyzing") return null;
  if (!imageHasPersistedFinalEvidence(image)) return null;
  return asPriceImageAnalysis(image.vision_result) ? "analyzed" : "failed";
}

function deriveStoredAnalysisState(images: OfflineVisitImage[], currentVisitStatus?: OfflineStoreVisit["visit_status"]) {
  const priceImages = images.filter((image) => isPriceCategory(toImageCategory(image)));
  const analyzedResults = priceImages
    .map((image) => ({ image, result: asPriceImageAnalysis(image.vision_result) }))
    .filter((entry): entry is { image: OfflineVisitImage; result: StoreVisitPriceImageAnalysis } => Boolean(entry.result) && entry.image.analysis_status === "analyzed");
  const retakeRequiredImages = analyzedResults
    .filter((entry) => isRetakeRequiredResult(entry.result))
    .map((entry) => entry.image);
  const failedImages = priceImages
    .filter((image) => image.analysis_status === "failed")
    .map((image) => ({
      imageId: image.id,
      imagePath: image.image_path,
      systemErrorMessage: image.analysis_error ?? image.error_message ?? "Image analysis failed.",
    }));
  const rows = analyzedResults.flatMap((entry) => entry.result.rows);
  const partialFailure = failedImages.length > 0 && analyzedResults.length > 0;
  const anyPending = priceImages.some((image) => image.analysis_status === "pending" || image.analysis_status === "analyzing");

  let analysisStatus: StoreVisitAnalysisStatus;
  if (priceImages.length === 0) {
    analysisStatus = "pending";
  } else if (anyPending) {
    analysisStatus = "analyzing";
  } else if (retakeRequiredImages.length > 0) {
    analysisStatus = "action_required";
  } else if (analyzedResults.length > 0 && failedImages.length > 0) {
    analysisStatus = "partial";
  } else if (analyzedResults.length > 0) {
    analysisStatus = "completed";
  } else if (failedImages.length > 0) {
    analysisStatus = "failed";
  } else {
    analysisStatus = "pending";
  }

  const analysisError = analysisStatus === "partial"
    ? "Some photos were not parsed. Parsed prices can be reviewed first; failed photos can be retried later."
    : analysisStatus === "action_required"
      ? "price_photo_retake_required: Some price-tag photos must be re-uploaded."
    : analysisStatus === "failed"
      ? (failedImages[0]?.systemErrorMessage ?? "Image analysis failed.")
      : null;

  const visitStatus: OfflineStoreVisit["visit_status"] = analysisStatus === "pending"
      ? (currentVisitStatus === "draft" && images.length === 0 ? "draft" : "uploaded")
      : analysisStatus === "analyzing"
        ? "analyzing"
        : "analyzed";

  return {
    priceImages,
    analyzedResults,
    failedImages,
    rows,
    partialFailure,
    analysisStatus,
    analysisError,
    visitStatus,
    aiResult: composeStoreVisitAiResult({ rows, partialFailure }),
  };
}

export async function finalizeStoreVisitImageAnalysisStatuses(input: {
  visitId: string;
  analyzedImageIds: string[];
  failedImages: { imageId: string; systemErrorMessage: string }[];
  retakeRequiredImageIds?: string[];
  affectedImageIds?: string[];
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const analyzedImageIds = Array.from(new Set([
    ...input.analyzedImageIds,
    ...(input.retakeRequiredImageIds ?? []),
  ].map((value) => value.trim()).filter(Boolean)));
  const failedEntries = Array.from(new Map(
    input.failedImages
      .map((entry) => [entry.imageId.trim(), entry] as const)
      .filter(([imageId]) => Boolean(imageId)),
  ).values());
  const affectedImageIds = input.affectedImageIds?.length
    ? input.affectedImageIds
    : [...analyzedImageIds, ...failedEntries.map((entry) => entry.imageId)];
  const targetImageIds = Array.from(new Set(affectedImageIds.map((value) => value.trim()).filter(Boolean)));

  if (analyzedImageIds.length > 0) {
    const { error } = await supabase
      .from("offline_visit_images")
      .update({
        analysis_status: "analyzed",
        analysis_error: null,
        error_message: null,
      })
      .eq("visit_id", input.visitId)
      .in("id", analyzedImageIds);
    if (error) throw new Error(error.message);
  }

  if (failedEntries.length > 0) {
    await Promise.all(failedEntries.map(async (entry) => {
      const { error } = await supabase
        .from("offline_visit_images")
        .update({
          analysis_status: "failed",
          analysis_error: entry.systemErrorMessage,
          error_message: entry.systemErrorMessage,
        })
        .eq("visit_id", input.visitId)
        .eq("id", entry.imageId);
      if (error) throw new Error(error.message);
    }));
  }

  if (targetImageIds.length === 0) {
    return { analyzedImageIds, failedImageIds: failedEntries.map((entry) => entry.imageId), forceClosedImageIds: [] };
  }

  const { data: currentImages, error: currentImagesError } = await supabase
    .from("offline_visit_images")
    .select("id, analysis_status")
    .eq("visit_id", input.visitId)
    .in("id", targetImageIds);
  if (currentImagesError) throw new Error(currentImagesError.message);

  const successfulImageIdSet = new Set(analyzedImageIds);
  const failedImageIdSet = new Set(failedEntries.map((entry) => entry.imageId));
  const unresolvedImageIds = (currentImages ?? [])
    .map((image) => String((image as { id?: unknown }).id ?? "").trim())
    .filter((imageId) => Boolean(imageId)
      && !successfulImageIdSet.has(imageId)
      && !failedImageIdSet.has(imageId));

  if (unresolvedImageIds.length === 0) {
    return { analyzedImageIds, failedImageIds: [...failedImageIdSet], forceClosedImageIds: [] };
  }

  const finalizationError = "Image analysis finished without a persisted final status. Please retry this photo.";
  const { error: unresolvedError } = await supabase
    .from("offline_visit_images")
    .update({
      analysis_status: "failed",
      analysis_error: finalizationError,
      error_message: finalizationError,
    })
    .eq("visit_id", input.visitId)
    .in("id", unresolvedImageIds)
    .in("analysis_status", ["pending", "analyzing"]);
  if (unresolvedError) throw new Error(unresolvedError.message);

  return {
    analyzedImageIds,
    failedImageIds: [...failedImageIdSet],
    forceClosedImageIds: unresolvedImageIds,
  };
}

export async function invalidateStoreVisitImagePriceImpact(input: {
  visitId: string;
  imageIds: string[];
  lifecycleStatus: ImageLifecycleStatus;
  rejectionReason: string;
  candidateDisposition?: CandidateDisposition;
  reviewedBy?: string | null;
  supabase?: SupabaseServiceClient;
}) {
  const imageIds = Array.from(new Set(input.imageIds.map((value) => value.trim()).filter(Boolean)));
  if (imageIds.length === 0) {
    return { deletedSnapshotCount: 0, rejectedCandidateCount: 0 };
  }

  const supabase = input.supabase ?? createSupabaseServiceClient();
  const { data: deletedSnapshots, error: deleteError } = await supabase
    .from("price_snapshots")
    .delete()
    .eq("source_visit_id", input.visitId)
    .in("source_image_id", imageIds)
    .select("id");
  if (deleteError) throw new Error(deleteError.message);

  const { data: deletedLegacySnapshots, error: deleteLegacyError } = await supabase
    .from("price_snapshots")
    .delete()
    .eq("source_visit_id", input.visitId)
    .eq("source", "offline_ai_confirmed")
    .is("source_image_id", null)
    .select("id");
  if (deleteLegacyError) throw new Error(deleteLegacyError.message);

  if (input.candidateDisposition === "delete") {
    const [imageResult, legacyResult] = await Promise.all([
      supabase
        .from("ai_price_candidates")
        .delete()
        .eq("visit_id", input.visitId)
        .in("source_image_id", imageIds)
        .select("id"),
      supabase
        .from("ai_price_candidates")
        .delete()
        .eq("visit_id", input.visitId)
        .is("source_image_id", null)
        .select("id"),
    ]);
    const error = imageResult.error ?? legacyResult.error;
    if (error) throw new Error(error.message);
    return {
      deletedSnapshotCount: (deletedSnapshots?.length ?? 0) + (deletedLegacySnapshots?.length ?? 0),
      rejectedCandidateCount: (imageResult.data?.length ?? 0) + (legacyResult.data?.length ?? 0),
    };
  }

  const payload = {
    status: "rejected" as const,
    price_snapshot_id: null,
    reviewed_at: new Date().toISOString(),
    reviewed_by: input.reviewedBy ?? "h5_system",
    rejection_reason: input.rejectionReason,
    h5_lifecycle_status: input.lifecycleStatus,
    h5_lifecycle_at: new Date().toISOString(),
  };

  async function updateImpactedCandidates(useLegacyPayload: boolean) {
    const updatePayload = useLegacyPayload
      ? {
          status: "rejected" as const,
          price_snapshot_id: null,
          reviewed_at: payload.reviewed_at,
          reviewed_by: payload.reviewed_by,
          rejection_reason: payload.rejection_reason,
        }
      : payload;
    const [imageResult, legacyResult] = await Promise.all([
      supabase
        .from("ai_price_candidates")
        .update(updatePayload)
        .eq("visit_id", input.visitId)
        .in("source_image_id", imageIds)
        .select("id"),
      supabase
        .from("ai_price_candidates")
        .update(updatePayload)
        .eq("visit_id", input.visitId)
        .is("source_image_id", null)
        .select("id"),
    ]);
    return {
      data: [...(imageResult.data ?? []), ...(legacyResult.data ?? [])],
      error: imageResult.error ?? legacyResult.error,
    };
  }

  let { data: updatedCandidates, error } = await updateImpactedCandidates(false);

  if (missingLifecycleColumns(error)) {
    const legacyResult = await updateImpactedCandidates(true);
    updatedCandidates = legacyResult.data;
    error = legacyResult.error;
  }

  if (error) throw new Error(error.message);

  return {
    deletedSnapshotCount: (deletedSnapshots?.length ?? 0) + (deletedLegacySnapshots?.length ?? 0),
    rejectedCandidateCount: updatedCandidates?.length ?? 0,
  };
}

export async function invalidateStoreVisitLegacyUnscopedPriceImpact(input: {
  visitId: string;
  lifecycleStatus: ImageLifecycleStatus;
  rejectionReason: string;
  reviewedBy?: string | null;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const { data: deletedSnapshots, error: deleteError } = await supabase
    .from("price_snapshots")
    .delete()
    .eq("source_visit_id", input.visitId)
    .eq("source", "offline_ai_confirmed")
    .is("source_image_id", null)
    .select("id");
  if (deleteError) throw new Error(deleteError.message);

  const payload = {
    status: "rejected" as const,
    price_snapshot_id: null,
    reviewed_at: new Date().toISOString(),
    reviewed_by: input.reviewedBy ?? "h5_system",
    rejection_reason: input.rejectionReason,
    h5_lifecycle_status: input.lifecycleStatus,
    h5_lifecycle_at: new Date().toISOString(),
  };

  let { data: updatedCandidates, error } = await supabase
    .from("ai_price_candidates")
    .update(payload)
    .eq("visit_id", input.visitId)
    .is("source_image_id", null)
    .select("id");

  if (missingLifecycleColumns(error)) {
    const legacyResult = await supabase
      .from("ai_price_candidates")
      .update({
        status: "rejected" as const,
        price_snapshot_id: null,
        reviewed_at: payload.reviewed_at,
        reviewed_by: payload.reviewed_by,
        rejection_reason: payload.rejection_reason,
      })
      .eq("visit_id", input.visitId)
      .is("source_image_id", null)
      .select("id");
    updatedCandidates = legacyResult.data;
    error = legacyResult.error;
  }

  if (error) throw new Error(error.message);

  return {
    deletedSnapshotCount: deletedSnapshots?.length ?? 0,
    rejectedCandidateCount: updatedCandidates?.length ?? 0,
  };
}

export async function refreshStoreVisitStoredPriceState(input: {
  visitId: string;
  analysisStatusOverride?: StoreVisitAnalysisStatus | null;
  analysisErrorOverride?: string | null;
  visitStatusOverride?: OfflineStoreVisit["visit_status"];
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const { data: visit, error } = await supabase
    .from("offline_store_visits")
    .select("*, offline_visit_images(*)")
    .eq("id", input.visitId)
    .single();
  if (error || !visit) throw new Error(error?.message ?? "Visit not found");

  const typedVisit = visit as OfflineStoreVisit;
  const allImages = Array.isArray(typedVisit.offline_visit_images) ? typedVisit.offline_visit_images : [];
  const activeImages = allImages.filter((image) => !isInactiveVisitImage(image));
  const activePriceImages = activeImages.filter((image) => isPriceCategory(toImageCategory(image)));
  const summaryBase = isRecord(typedVisit.summary_result) ? typedVisit.summary_result : {};
  const analysisMetrics = isRecord(summaryBase.analysis_metrics) ? summaryBase.analysis_metrics as Record<string, unknown> : null;
  const hasCompletedAnalysisMetrics = typeof analysisMetrics?.visit_analysis_completed_at === "string";
  const staleRecoveredImages = activePriceImages
    .map((image) => {
      const recoveredStatus = recoverStaleImageStatus(image, hasCompletedAnalysisMetrics);
      return recoveredStatus ? { image, recoveredStatus } : null;
    })
    .filter((entry): entry is { image: OfflineVisitImage; recoveredStatus: "analyzed" | "failed" } => Boolean(entry));

  if (staleRecoveredImages.length > 0) {
    const recoveredAnalyzedIds = staleRecoveredImages
      .filter((entry) => entry.recoveredStatus === "analyzed")
      .map((entry) => entry.image.id);
    const recoveredFailedImages = staleRecoveredImages
      .filter((entry) => entry.recoveredStatus === "failed");

    if (recoveredAnalyzedIds.length > 0) {
      const { error: analyzedRecoveryError } = await supabase
        .from("offline_visit_images")
        .update({
          analysis_status: "analyzed",
          analysis_error: null,
          error_message: null,
        })
        .eq("visit_id", input.visitId)
        .in("id", recoveredAnalyzedIds)
        .in("analysis_status", ["pending", "analyzing"]);
      if (analyzedRecoveryError) throw new Error(analyzedRecoveryError.message);
    }

    if (recoveredFailedImages.length > 0) {
      await Promise.all(recoveredFailedImages.map(async ({ image }) => {
        const failureMessage = image.analysis_error ?? image.error_message ?? "Image analysis failed.";
        const { error: failedRecoveryError } = await supabase
          .from("offline_visit_images")
          .update({
            analysis_status: "failed",
            analysis_error: failureMessage,
            error_message: failureMessage,
          })
          .eq("visit_id", input.visitId)
          .eq("id", image.id)
          .in("analysis_status", ["pending", "analyzing"]);
        if (failedRecoveryError) throw new Error(failedRecoveryError.message);
      }));
    }
  }

  const normalizedActivePriceImages: OfflineVisitImage[] = activePriceImages.map((image) => {
    const recoveredStatus = recoverStaleImageStatus(image, hasCompletedAnalysisMetrics);
    if (!recoveredStatus) return image;
    return recoveredStatus === "analyzed"
      ? { ...image, analysis_status: "analyzed" as const, analysis_error: null, error_message: null }
      : {
          ...image,
          analysis_status: "failed" as const,
          analysis_error: image.analysis_error ?? image.error_message ?? "Image analysis failed.",
          error_message: image.error_message ?? image.analysis_error ?? "Image analysis failed.",
        };
  });
  const derived = deriveStoredAnalysisState(normalizedActivePriceImages, typedVisit.visit_status);
  const nextAnalysisStatus = input.analysisStatusOverride ?? derived.analysisStatus;
  const nextAnalysisError = input.analysisErrorOverride === undefined ? derived.analysisError : input.analysisErrorOverride;

  const retakeRequiredImages = derived.analyzedResults.filter((entry) => isRetakeRequiredResult(entry.result));
  const now = new Date().toISOString();
  const priorStartedAt = typeof analysisMetrics?.visit_analysis_started_at === "string"
    ? analysisMetrics.visit_analysis_started_at
    : null;
  const priorDurationMs = typeof analysisMetrics?.visit_analysis_duration_ms === "number"
    ? analysisMetrics.visit_analysis_duration_ms
    : null;
  const isFirstAnalysis = !priorStartedAt;
  const visitAnalysisStartedAt = priorStartedAt ?? now;
  const visitAnalysisCompletedAt = now;
  const visitAnalysisDurationMs = isFirstAnalysis
    ? Math.max(0, new Date(visitAnalysisCompletedAt).getTime() - new Date(visitAnalysisStartedAt).getTime())
    : (priorDurationMs ?? 0);

  const summaryResult = {
    ...summaryBase,
    ai_result_card: derived.aiResult,
    price_image_results: derived.analyzedResults.map((entry) => ({ imageId: entry.image.id, result: entry.result })),
    analysis_partial_failures: derived.failedImages,
    image_paths: activeImages.map((image) => image.image_path),
    image_categories: activeImages.map((image) => toImageCategory(image)),
    signed_image_count: activeImages.length,
    analysis_metrics: {
      ...(analysisMetrics ?? {}),
      visit_analysis_started_at: visitAnalysisStartedAt,
      visit_analysis_completed_at: visitAnalysisCompletedAt,
      visit_analysis_duration_ms: visitAnalysisDurationMs,
      price_image_count: derived.priceImages.length,
      price_image_success_count: derived.analyzedResults.length - retakeRequiredImages.length,
      price_image_failure_count: derived.failedImages.length,
      price_image_retake_required_count: retakeRequiredImages.length,
    },
  };

  const updatePayload: Record<string, unknown> = {
    ai_result: derived.aiResult,
    summary_result: summaryResult,
    analysis_status: nextAnalysisStatus,
    analysis_error: nextAnalysisError,
    visit_status: input.visitStatusOverride ?? derived.visitStatus,
  };

  const { data: updated, error: updateError } = await supabase
    .from("offline_store_visits")
    .update(updatePayload)
    .eq("id", input.visitId)
    .select("*")
    .single();
  if (updateError || !updated) throw new Error(updateError?.message ?? "Failed to refresh visit state");
  return updated as OfflineStoreVisit;
}
