import { createSupabaseServiceClient } from "@/lib/supabase";
import { attachAiPriceCandidateMatchLabels } from "@/lib/data";
import type { AiPriceCandidate, OfflineImageType, OfflineStoreVisit, OfflineVisitImage, StoreVisitImageCategory } from "@/lib/types";
import { isInactiveVisitImage, refreshStoreVisitStoredPriceState } from "@/lib/store-visit-image-maintenance";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type StoreVisitWithPriceCandidates = OfflineStoreVisit & {
  ai_price_candidates?: AiPriceCandidate[];
};

const aiPriceCandidateSelect = "id,visit_id,candidate_key,source_image_id,source_image_path,raw_brand,raw_product,raw_price,parsed_price_idr,list_price_idr,package_price_idr,net_price_idr,raw_piece_count_text,raw_package_price_text,raw_net_price_text,raw_price_per_piece_text,visible_price_per_piece_idr,price_basis,promo_type,piece_count,price_per_piece,candidate_type,ai_confidence,matched_entity_type,matched_entity_id,matched_label,match_score,warnings,status,price_snapshot_id,reviewed_piece_count,reviewed_price_per_piece,created_at,reviewed_at,reviewed_by,rejection_reason,review_method,h5_lifecycle_status,h5_lifecycle_at";
const visitSelect = `id,visit_code,store_name,region,channel,promoter,visit_date,visit_status,analysis_status,analysis_error,summary_result,image_urls,image_categories,offline_visit_images(id,visit_id,replaces_image_id,replaced_by_image_id,deleted_at,deletion_reason,image_type,image_path,image_url,file_name,content_type,file_size,analysis_status,vision_result,analysis_error,error_message,uploaded_at,created_at),ai_price_candidates(${aiPriceCandidateSelect})`;
const legacyVisitSelect = `id,visit_code,store_name,region,channel,promoter,visit_date,visit_status,analysis_status,analysis_error,summary_result,image_urls,image_categories,offline_visit_images(id,visit_id,image_type,image_path,image_url,file_name,content_type,file_size,analysis_status,vision_result,analysis_error,error_message,uploaded_at,created_at),ai_price_candidates(${aiPriceCandidateSelect})`;

function toStoreVisitImageCategory(category: OfflineImageType | StoreVisitImageCategory | null | undefined): StoreVisitImageCategory | undefined {
  if (category === "own_shelf") return "makuku_shelf";
  if (category === "competitor_shelf") return "competitor_shelf";
  if (category === "other" || category === "promo_tag") return "storefront";
  if (category === "makuku_shelf" || category === "storefront") return category;
  return undefined;
}

async function attachSignedImageUrls(visit: OfflineStoreVisit) {
  const supabase = createSupabaseServiceClient();
  const imagePaths = Array.isArray(visit.image_urls) ? visit.image_urls : [];
  const categories = Array.isArray(visit.image_categories) ? visit.image_categories : [];
  const legacySignedImages = await Promise.all(imagePaths.map(async (path, index) => {
    const { data } = await supabase.storage.from("store-visits").createSignedUrl(path, 60 * 60);
    return { path, url: data?.signedUrl ?? null, category: toStoreVisitImageCategory(categories[index]) };
  }));
  const tableSignedImages = await Promise.all((visit.offline_visit_images ?? []).map(async (image) => {
    const category = toStoreVisitImageCategory(image.image_type);
    if (image.image_url) return { id: image.id, path: image.image_path, url: image.image_url, category };
    const { data } = await supabase.storage.from("offline-visit-images").createSignedUrl(image.image_path, 60 * 60);
    return { id: image.id, path: image.image_path, url: data?.signedUrl ?? null, category };
  }));
  return { ...visit, signed_images: [...tableSignedImages, ...legacySignedImages] };
}

function isMissingImageLifecycleColumnsError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message.includes("replaces_image_id")
    || message.includes("replaced_by_image_id")
    || message.includes("deleted_at")
    || message.includes("deletion_reason")
    || message.includes("schema cache");
}

export async function GET(_request: Request, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = createSupabaseServiceClient();
    const primaryResult = await supabase
      .from("offline_store_visits")
      .select(visitSelect)
      .eq("id", id)
      .single();
    let data: unknown = primaryResult.data;
    let error = primaryResult.error;

    if (isMissingImageLifecycleColumnsError(error)) {
      const legacyResult = await supabase
        .from("offline_store_visits")
        .select(legacyVisitSelect)
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

    if (error || !data) return Response.json({ error: error?.message ?? "Visit not found" }, { status: 404 });

    let visit = data as unknown as StoreVisitWithPriceCandidates;
    const staleAnalyzingImages = Array.isArray(visit.offline_visit_images) ? visit.offline_visit_images : [];
    const hasPendingImage = staleAnalyzingImages.some((image) => image.analysis_status === "pending" || image.analysis_status === "analyzing");
    if ((visit.analysis_status === "analyzing" || visit.visit_status === "analyzing") && !hasPendingImage) {
      visit = await refreshStoreVisitStoredPriceState({ visitId: id, supabase });
    }

    const summaryResult = typeof visit.summary_result === "object" && visit.summary_result !== null
      ? { display_analysis: (visit.summary_result as Record<string, unknown>).display_analysis ?? null }
      : null;
    const allImages = Array.isArray(visit.offline_visit_images) ? visit.offline_visit_images : [];
    const activeImages = allImages.filter((image) => !isInactiveVisitImage(image));
    const replacedImages = allImages.filter((image) => isInactiveVisitImage(image));
    const signedVisitWithAllImages = await attachSignedImageUrls({
      ...visit,
      summary_result: summaryResult,
      offline_visit_images: allImages,
    });
    const signedVisit = {
      ...signedVisitWithAllImages,
      ...visit,
      summary_result: summaryResult,
      offline_visit_images: activeImages,
    };

    return Response.json({
      visit: {
        ...signedVisit,
        ai_price_candidates: await attachAiPriceCandidateMatchLabels(supabase, signedVisit.ai_price_candidates ?? []),
        replaced_offline_visit_images: replacedImages,
        signed_images: signedVisitWithAllImages.signed_images,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
