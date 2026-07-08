import { createSupabaseServiceClient } from "@/lib/supabase";
import { requireAppSession } from "@/lib/auth-session";
import { attachAiPriceCandidateMatchLabels } from "@/lib/data";
import { buildStoreVisitThumbnailPath } from "@/lib/store-visit-image-variants";
import type { AiPriceCandidate, OfflineImageType, OfflineStoreVisit, OfflineVisitImage, StoreVisitImageCategory } from "@/lib/types";
import { isInactiveVisitImage, refreshStoreVisitStoredPriceState } from "@/lib/store-visit-image-maintenance";
import { loadActiveStoreVisitAiJob, summarizeStoreVisitAiJob } from "@/lib/store-visit-ai-jobs";
import { syncStoreVisitPriceCandidatesFromImages } from "@/lib/store-visit-price-candidate-sync";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type StoreVisitWithPriceCandidates = OfflineStoreVisit & {
  ai_price_candidates?: AiPriceCandidate[];
};

type SignedVisitImage = {
  id?: string;
  path: string;
  url: string | null;
  category?: StoreVisitImageCategory;
};

class RouteError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const aiPriceCandidateSelect = "id,visit_id,candidate_key,source_image_id,source_image_path,source_row_index,raw_brand,raw_product,raw_price,parsed_price_idr,ai_list_price_idr,ai_package_price_idr,ai_net_price_idr,list_price_idr,package_price_idr,net_price_idr,raw_piece_count_text,raw_package_price_text,raw_net_price_text,raw_price_per_piece_text,visible_price_per_piece_idr,price_basis,ai_promo_type,promo_type,ai_piece_count,ai_price_per_piece,piece_count,price_per_piece,candidate_type,ai_confidence,legacy_confidence_fallback,price_evidence_status,price_evidence_confidence,price_evidence_detail,conflicts,review_decision,ai_matched_entity_type,ai_matched_entity_id,ai_matched_label,matched_entity_type,matched_entity_id,matched_label,match_score,warnings,status,price_snapshot_id,reviewed_piece_count,reviewed_price_per_piece,created_at,reviewed_at,reviewed_by,rejection_reason,review_method,h5_lifecycle_status,h5_lifecycle_at";
const visitSelect = `id,visit_code,store_name,region,channel,promoter,visit_date,visit_status,analysis_status,analysis_error,summary_result,image_urls,image_thumbnail_paths,image_categories,offline_visit_images(id,visit_id,replaces_image_id,replaced_by_image_id,deleted_at,deletion_reason,image_type,image_path,thumbnail_path,image_url,file_name,content_type,file_size,analysis_status,vision_result,analysis_error,error_message,uploaded_at,created_at),ai_price_candidates(${aiPriceCandidateSelect})`;
const legacyVisitSelect = `id,visit_code,store_name,region,channel,promoter,visit_date,visit_status,analysis_status,analysis_error,summary_result,image_urls,image_thumbnail_paths,image_categories,offline_visit_images(id,visit_id,image_type,image_path,thumbnail_path,image_url,file_name,content_type,file_size,analysis_status,vision_result,analysis_error,error_message,uploaded_at,created_at),ai_price_candidates(${aiPriceCandidateSelect})`;
const aiPriceCandidateLegacySelect = aiPriceCandidateSelect.replace("source_row_index,", "");
const visitLegacyCandidateSelect = `id,visit_code,store_name,region,channel,promoter,visit_date,visit_status,analysis_status,analysis_error,summary_result,image_urls,image_thumbnail_paths,image_categories,offline_visit_images(id,visit_id,replaces_image_id,replaced_by_image_id,deleted_at,deletion_reason,image_type,image_path,thumbnail_path,image_url,file_name,content_type,file_size,analysis_status,vision_result,analysis_error,error_message,uploaded_at,created_at),ai_price_candidates(${aiPriceCandidateLegacySelect})`;
const fullyLegacyVisitSelect = `id,visit_code,store_name,region,channel,promoter,visit_date,visit_status,analysis_status,analysis_error,summary_result,image_urls,image_thumbnail_paths,image_categories,offline_visit_images(id,visit_id,image_type,image_path,thumbnail_path,image_url,file_name,content_type,file_size,analysis_status,vision_result,analysis_error,error_message,uploaded_at,created_at),ai_price_candidates(${aiPriceCandidateLegacySelect})`;

async function createSignedThumbnailUrl(input: {
  bucket: "store-visits" | "offline-visit-images";
  thumbnailPath: string;
}) {
  const supabase = createSupabaseServiceClient();
  const signed = await supabase.storage.from(input.bucket).createSignedUrl(input.thumbnailPath, 60 * 60);
  return signed.data?.signedUrl ?? null;
}

function toStoreVisitImageCategory(category: OfflineImageType | StoreVisitImageCategory | null | undefined): StoreVisitImageCategory | undefined {
  if (category === "own_shelf") return "makuku_shelf";
  if (category === "competitor_shelf") return "competitor_shelf";
  if (category === "other" || category === "promo_tag") return "storefront";
  if (category === "makuku_shelf" || category === "storefront") return category;
  return undefined;
}

async function attachSignedImageUrls(visit: OfflineStoreVisit) {
  const imagePaths = Array.isArray(visit.image_urls) ? visit.image_urls : [];
  const imageThumbnailPaths = Array.isArray(visit.image_thumbnail_paths) ? visit.image_thumbnail_paths : [];
  const categories = Array.isArray(visit.image_categories) ? visit.image_categories : [];
  const legacySignedImages = await Promise.all(imagePaths.map(async (path, index): Promise<SignedVisitImage> => {
    const thumbnailPath = imageThumbnailPaths[index] ?? buildStoreVisitThumbnailPath(path);
    const url = await createSignedThumbnailUrl({
      bucket: "store-visits",
      thumbnailPath,
    });
    return { path, url, category: toStoreVisitImageCategory(categories[index]) };
  }));
  const tableSignedImages = await Promise.all((visit.offline_visit_images ?? []).map(async (image): Promise<SignedVisitImage> => {
    const category = toStoreVisitImageCategory(image.image_type);
    const thumbnailPath = image.thumbnail_path ?? buildStoreVisitThumbnailPath(image.image_path);
    const url = await createSignedThumbnailUrl({
      bucket: "offline-visit-images",
      thumbnailPath,
    });
    return { id: image.id, path: image.image_path, url, category };
  }));
  return {
    ...visit,
    signed_images: [...tableSignedImages, ...legacySignedImages],
    active_signed_images: [...tableSignedImages, ...legacySignedImages],
  };
}

async function signVisitImages(images: OfflineVisitImage[]) {
  const signedVisit = await attachSignedImageUrls({ offline_visit_images: images } as OfflineStoreVisit);
  return signedVisit.signed_images ?? [];
}

function isMissingImageLifecycleColumnsError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message.includes("replaces_image_id")
    || message.includes("replaced_by_image_id")
    || message.includes("deleted_at")
    || message.includes("deletion_reason")
    || message.includes("schema cache");
}

function isMissingCandidateRowColumnError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message.includes("source_row_index") || message.includes("schema cache");
}

async function loadVisitWithFallback(supabase: ReturnType<typeof createSupabaseServiceClient>, id: string) {
  const primaryResult = await supabase
    .from("offline_store_visits")
    .select(visitSelect)
    .eq("id", id)
    .single();
  let data: unknown = primaryResult.data;
  let error = primaryResult.error;

  if (isMissingCandidateRowColumnError(error)) {
    const candidateLegacyResult = await supabase
      .from("offline_store_visits")
      .select(visitLegacyCandidateSelect)
      .eq("id", id)
      .single();
    data = candidateLegacyResult.data;
    error = candidateLegacyResult.error;
  }

  if (isMissingImageLifecycleColumnsError(error)) {
    const legacyResult = await supabase
      .from("offline_store_visits")
      .select(isMissingCandidateRowColumnError(error) ? fullyLegacyVisitSelect : legacyVisitSelect)
      .eq("id", id)
      .single();
    const legacyData = legacyResult.data as (Record<string, unknown> & { offline_visit_images?: Record<string, unknown>[] | null }) | null;
    data = legacyData ? {
      ...legacyData,
      offline_visit_images: ((legacyData.offline_visit_images ?? []) as Record<string, unknown>[]).map((image) => ({
        ...image,
        replaces_image_id: null,
        replaced_by_image_id: null,
        deleted_at: null,
        deletion_reason: null,
      })) as OfflineVisitImage[],
    } : null;
    error = legacyResult.error;
  }

  if (error || !data) {
    throw new RouteError(error?.message ?? "Visit not found", 404);
  }

  return data as unknown as StoreVisitWithPriceCandidates;
}

export async function GET(request: Request, ctx: RouteContext) {
  try {
    const auth = await requireAppSession(request);
    if (auth.response) return auth.response;
    const { id } = await ctx.params;
    const supabase = createSupabaseServiceClient();
    let visit = await loadVisitWithFallback(supabase, id);
    const summaryResultRecord = typeof visit.summary_result === "object" && visit.summary_result !== null
      ? visit.summary_result as Record<string, unknown>
      : null;
    const analysisMetrics = summaryResultRecord && typeof summaryResultRecord.analysis_metrics === "object" && summaryResultRecord.analysis_metrics !== null
      ? summaryResultRecord.analysis_metrics as Record<string, unknown>
      : null;
    const hasCompletedAnalysisMetrics = typeof analysisMetrics?.visit_analysis_completed_at === "string";
    const staleAnalyzingImages = Array.isArray(visit.offline_visit_images) ? visit.offline_visit_images : [];
    const hasPendingImage = staleAnalyzingImages.some((image) => image.analysis_status === "pending" || image.analysis_status === "analyzing");
    const hasStoredImageAnalysisEvidence = staleAnalyzingImages.some((image) => {
      const visionResult = typeof image.vision_result === "object" && image.vision_result !== null
        ? image.vision_result as Record<string, unknown>
        : null;
      return Array.isArray(visionResult?.rows)
        || typeof visionResult?.photo_quality === "object"
        || image.analysis_status === "failed"
        || Boolean(image.analysis_error || image.error_message);
    });
    if (
      (visit.analysis_status === "analyzing" || visit.visit_status === "analyzing")
      && (
        !hasPendingImage
        || (hasCompletedAnalysisMetrics && hasStoredImageAnalysisEvidence)
      )
    ) {
      visit = await refreshStoreVisitStoredPriceState({ visitId: id, supabase });
    }

    const syncResult = await syncStoreVisitPriceCandidatesFromImages({ visitId: id, supabase });
    if (syncResult.inserted_count > 0) {
      visit = await loadVisitWithFallback(supabase, id);
    }

    const summaryResult = typeof visit.summary_result === "object" && visit.summary_result !== null
      ? { display_analysis: (visit.summary_result as Record<string, unknown>).display_analysis ?? null }
      : null;
    const allImages = Array.isArray(visit.offline_visit_images) ? visit.offline_visit_images : [];
    const activeImages = allImages.filter((image) => !isInactiveVisitImage(image));
    const inactiveImages = allImages.filter((image) => isInactiveVisitImage(image));
    const replacedImages = inactiveImages.filter((image) => Boolean(image.replaced_by_image_id)
      || (typeof image.vision_result === "object" && image.vision_result !== null && (image.vision_result as Record<string, unknown>).is_replaced === true));
    const signedVisitWithActiveImages = await attachSignedImageUrls({
      ...visit,
      summary_result: summaryResult,
      offline_visit_images: activeImages,
    });
    const replacedSignedImages = await signVisitImages(replacedImages);
    const signedVisit = {
      ...signedVisitWithActiveImages,
      ...visit,
      summary_result: summaryResult,
      offline_visit_images: activeImages,
    };
    const activeAi = await loadActiveStoreVisitAiJob({ visitId: id, supabase });

    return Response.json({
      visit: {
        ...signedVisit,
        ai_price_candidates: await attachAiPriceCandidateMatchLabels(supabase, signedVisit.ai_price_candidates ?? []),
        replaced_offline_visit_images: inactiveImages,
        active_signed_images: signedVisitWithActiveImages.active_signed_images,
        replaced_signed_images: replacedSignedImages,
        signed_images: signedVisitWithActiveImages.active_signed_images,
        active_ai_job: summarizeStoreVisitAiJob(activeAi.job, activeAi.items),
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: error instanceof RouteError ? error.status : 500 },
    );
  }
}
