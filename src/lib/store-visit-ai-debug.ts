import { analyzeStoreVisitImages } from "@/lib/store-visit-ai";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type {
  OfflineImageType,
  OfflineStoreVisit,
  OfflineVisitImage,
  StoreVisitAiConfig,
  StoreVisitImageCategory,
} from "@/lib/types";

const maxInlineImageBytes = 8 * 1024 * 1024;

async function imageUrlToDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to fetch signed image URL: ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "image/jpeg";
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > maxInlineImageBytes) {
    throw new Error("Image is too large to inline for AI analysis");
  }
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

function fromOfflineImageType(imageType: OfflineImageType): StoreVisitImageCategory {
  if (imageType === "own_shelf") return "makuku_shelf";
  if (imageType === "competitor_shelf") return "competitor_shelf";
  return "storefront";
}

export async function runStoreVisitAiAnalysisForVisit(input: {
  visitId: string;
  config?: Partial<StoreVisitAiConfig>;
}) {
  const supabase = createSupabaseServiceClient();
  const { data: visit, error } = await supabase
    .from("offline_store_visits")
    .select("*, offline_visit_images(*)")
    .eq("id", input.visitId)
    .single();

  if (error || !visit) throw new Error(error?.message ?? "Visit not found");

  const typedVisit = visit as OfflineStoreVisit;
  const tableImages = Array.isArray(typedVisit.offline_visit_images)
    ? (typedVisit.offline_visit_images as OfflineVisitImage[])
    : [];
  const tableImagePaths = tableImages.map((image) => image.image_path);
  const tableImageCategories = tableImages.map((image) => fromOfflineImageType(image.image_type));
  const legacyImagePaths = Array.isArray(typedVisit.image_urls) ? typedVisit.image_urls : [];
  const legacyImageCategories = Array.isArray(typedVisit.image_categories) ? typedVisit.image_categories : [];
  const imagePaths = [...tableImagePaths, ...legacyImagePaths];
  const imageCategories = [...tableImageCategories, ...legacyImageCategories];
  if (imagePaths.length === 0) throw new Error("No images found for this visit");

  const tableSignedUrls = await Promise.all(tableImagePaths.map(async (path) => {
    const { data } = await supabase.storage.from("offline-visit-images").createSignedUrl(path, 60 * 10);
    return data?.signedUrl ?? null;
  }));
  const legacySignedUrls = await Promise.all(legacyImagePaths.map(async (path) => {
    const { data } = await supabase.storage.from("store-visits").createSignedUrl(path, 60 * 10);
    return data?.signedUrl ?? null;
  }));
  const signedUrls = [...tableSignedUrls, ...legacySignedUrls];
  const imageUrls = signedUrls.filter((url): url is string => Boolean(url));
  if (imageUrls.length === 0) throw new Error("Unable to create signed image URLs");

  const inlineImageUrls = await Promise.all(imageUrls.map(imageUrlToDataUrl));
  const aiAnalysis = await analyzeStoreVisitImages({
    imageUrls: inlineImageUrls,
    imageCategories,
    storeName: typedVisit.store_name,
    region: typedVisit.region ?? typedVisit.city,
    channel: typedVisit.channel ?? typedVisit.channel_type,
    promoter: typedVisit.promoter ?? typedVisit.uploader_name,
    visitDate: typedVisit.visit_date,
    config: input.config,
  });

  return {
    visit: typedVisit,
    image_paths: imagePaths,
    image_categories: imageCategories,
    signed_image_count: imageUrls.length,
    image_input_mode: "data_url",
    ...aiAnalysis,
  };
}
