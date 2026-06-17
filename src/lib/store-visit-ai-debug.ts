import {
  analyzeStoreVisitDisplayImages,
  analyzeStoreVisitPriceImage,
  analyzeStoreVisitImages,
} from "@/lib/store-visit-ai";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type {
  OfflineImageType,
  OfflineStoreVisit,
  OfflineVisitImage,
  StoreVisitAiConfig,
  StoreVisitImageCategory,
  StoreVisitPriceImageAnalysis,
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
  const signedEntries = [...tableSignedUrls, ...legacySignedUrls]
    .map((url, index) => ({
      url,
      imageCategory: imageCategories[index] as StoreVisitImageCategory | undefined,
      tableImage: index < tableImages.length ? tableImages[index] : null,
      imagePath: imagePaths[index],
    }))
    .filter((entry): entry is { url: string; imageCategory: StoreVisitImageCategory | undefined; tableImage: OfflineVisitImage | null; imagePath: string } => Boolean(entry.url));
  if (signedEntries.length === 0) throw new Error("Unable to create signed image URLs");

  const inlineImageUrls = await Promise.all(signedEntries.map((entry) => imageUrlToDataUrl(entry.url)));
  const region = typedVisit.region ?? typedVisit.city;
  const channel = typedVisit.channel ?? typedVisit.channel_type;
  const promoter = typedVisit.promoter ?? typedVisit.uploader_name;

  const priceImageInputs = inlineImageUrls
    .map((imageUrl, index) => ({
      imageUrl,
      imageCategory: signedEntries[index]?.imageCategory,
      tableImage: signedEntries[index]?.tableImage ?? null,
    }))
    .filter((item) => item.imageCategory === "makuku_shelf" || item.imageCategory === "competitor_shelf");

  const priceImageResults: { imageId: string; result: StoreVisitPriceImageAnalysis }[] = [];
  for (const item of priceImageInputs) {
    const tableImage = item.tableImage;
    if (!tableImage || !item.imageCategory) continue;
    const result = await analyzeStoreVisitPriceImage({
      imageUrl: item.imageUrl,
      imageCategory: item.imageCategory,
      storeName: typedVisit.store_name,
      region,
      channel,
      promoter,
      visitDate: typedVisit.visit_date,
      config: input.config,
    });
    priceImageResults.push({ imageId: tableImage.id, result: result.normalized });
  }

  const displayImageUrls = inlineImageUrls.filter((_, index) => signedEntries[index]?.imageCategory === "storefront");
  const displayAnalysis = await analyzeStoreVisitDisplayImages({
    imageUrls: displayImageUrls,
    storeName: typedVisit.store_name,
    region,
    channel,
    promoter,
    visitDate: typedVisit.visit_date,
    config: input.config,
  });

  if (priceImageResults.length > 0) {
    for (const item of priceImageResults) {
      await supabase
        .from("offline_visit_images")
        .update({ vision_result: item.result })
        .eq("id", item.imageId);
    }
  }

  const aggregatedRows = priceImageResults.flatMap((item) => item.result.rows);
  const aiAnalysis = await analyzeStoreVisitImages({
    imageUrls: inlineImageUrls,
    imageCategories,
    storeName: typedVisit.store_name,
    region,
    channel,
    promoter,
    visitDate: typedVisit.visit_date,
    config: input.config,
  });

  aiAnalysis.normalized.price_insights.key_sku_prices = aggregatedRows.map((row) => ({
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
  }));
  aiAnalysis.normalized.price_detection = aggregatedRows.map((row) => ({
    brand: row.brand ?? "Unknown",
    product: row.sku,
    price: row.net_price_idr ? String(row.net_price_idr) : "",
  }));
  aiAnalysis.normalized.store_summary = displayAnalysis.normalized.summary;

  return {
    visit: typedVisit,
    image_paths: imagePaths,
    image_categories: imageCategories,
    signed_image_count: signedEntries.length,
    image_input_mode: "data_url",
    price_image_results: priceImageResults,
    display_analysis: displayAnalysis.normalized,
    ...aiAnalysis,
  };
}
