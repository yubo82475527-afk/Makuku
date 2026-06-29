import {
  analyzeStoreVisitPriceImage,
  getActiveStoreVisitAiConfig,
  normalizeAiConfig,
} from "@/lib/store-visit-ai";
import { isInactiveVisitImage } from "@/lib/store-visit-image-maintenance";
import { summarizeBrandSkuCounts } from "@/lib/store-visit-summary";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type {
  OfflineImageType,
  OfflineStoreVisit,
  OfflineVisitImage,
  StoreVisitAiResult,
  StoreVisitAiConfig,
  StoreVisitImageCategory,
  StoreVisitPriceImageAnalysis,
} from "@/lib/types";

const maxInlineImageBytes = 8 * 1024 * 1024;

async function fallbackImageUrlToDataUrl(url: string) {
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown AI analysis error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPriceImageResult(value: unknown): value is StoreVisitPriceImageAnalysis {
  return isRecord(value)
    && value.schema_version === "store_visit_price_image_v1"
    && Array.isArray(value.rows)
    && (
      value.rows.length > 0
      || (isRecord(value.photo_quality) && value.photo_quality.status === "retake_required")
    );
}

function isRetakeRequiredPriceImageResult(value: StoreVisitPriceImageAnalysis) {
  return value.photo_quality?.status === "retake_required";
}

function collectPromotionInsights(rows: StoreVisitPriceImageAnalysis["rows"]) {
  const promotions = new Map<string, StoreVisitAiResult["promotion_insights"]["competitor_promotions"][number]>();
  for (const row of rows) {
    const promoType = String(row.promo_type ?? "").trim();
    if (!promoType) continue;
    const brand = row.brand ?? "Unknown";
    const description = [row.sku, promoType, row.net_price_idr ? `Rp ${row.net_price_idr}` : null].filter(Boolean).join(" / ");
    const key = `${brand.toLowerCase()}|${promoType.toLowerCase()}|${row.sku.toLowerCase()}`;
    if (!promotions.has(key)) {
      promotions.set(key, {
        brand,
        type: "Special Offer",
        visibility: "MEDIUM",
        description,
      });
    }
  }

  return Array.from(promotions.values());
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
  const promotionItems = collectPromotionInsights(rows);

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
      competitor_promotions: promotionItems,
      promo_pressure_level: promotionItems.length > 0 ? "MEDIUM" : "LOW",
    },
    competitor_promotion: promotionItems.map((item) => ({
      brand: item.brand,
      promotion_type: item.type,
      description: item.description,
    })),
    store_summary: summarizeBrandSkuCounts(rows, "en") ?? `${rows.length} SKU row(s) parsed.`,
  };
}

export async function runStoreVisitAiAnalysisForVisit(input: {
  visitId: string;
  config?: Partial<StoreVisitAiConfig>;
}) {
  const supabase = createSupabaseServiceClient();
  const resolvedConfig = input.config ? normalizeAiConfig(input.config) : await getActiveStoreVisitAiConfig();
  const { data: visit, error } = await supabase
    .from("offline_store_visits")
    .select("*, offline_visit_images(*)")
    .eq("id", input.visitId)
    .single();

  if (error || !visit) throw new Error(error?.message ?? "Visit not found");

  const typedVisit = visit as OfflineStoreVisit;
  const tableImages = Array.isArray(typedVisit.offline_visit_images)
    ? (typedVisit.offline_visit_images as OfflineVisitImage[]).filter((image) => !isInactiveVisitImage(image))
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

  const signedImageUrls = signedEntries.map((entry) => entry.url);
  const structuredRegion = [typedVisit.province, typedVisit.city_name, typedVisit.district].filter(Boolean).join(" / ");
  const region = typedVisit.region ?? (structuredRegion || typedVisit.city);
  const channel = typedVisit.channel ?? typedVisit.channel_type;
  const promoter = typedVisit.promoter ?? typedVisit.uploader_name;

  const priceImageInputs = signedImageUrls
    .map((imageUrl, index) => ({
      imageUrl,
      imageCategory: signedEntries[index]?.imageCategory,
      tableImage: signedEntries[index]?.tableImage ?? null,
    }))
    .filter((item) => item.imageCategory === "makuku_shelf" || item.imageCategory === "competitor_shelf");

  const priceImageResults: { imageId: string; result: StoreVisitPriceImageAnalysis }[] = [];
  const priceImageFailures: { imageId: string; imagePath: string; systemErrorMessage: string }[] = [];
  for (const item of priceImageInputs) {
    const tableImage = item.tableImage;
    if (!tableImage || !item.imageCategory) continue;
    if (tableImage.analysis_status === "analyzed" && isPriceImageResult(tableImage.vision_result)) {
      priceImageResults.push({ imageId: tableImage.id, result: tableImage.vision_result });
      continue;
    }

    try {
      const result = await analyzeStoreVisitPriceImage({
        visitId: input.visitId,
        imageId: tableImage.id,
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
      await supabase
        .from("offline_visit_images")
        .update({
          analysis_status: "analyzed",
          vision_result: result.normalized,
          analysis_error: null,
          error_message: null,
        })
        .eq("id", tableImage.id);
    } catch (error) {
      const systemErrorMessage = errorMessage(error);
      const diagnostic = typeof error === "object" && error !== null
        ? {
            http_status: "httpStatus" in error ? (error as { httpStatus?: number }).httpStatus ?? null : null,
            request_url: "requestUrl" in error ? (error as { requestUrl?: string }).requestUrl ?? null : null,
            provider_request_id: "providerRequestId" in error ? (error as { providerRequestId?: string }).providerRequestId ?? null : null,
            provider_error_type: "providerErrorType" in error ? (error as { providerErrorType?: string }).providerErrorType ?? null : null,
            provider_error_code: "providerErrorCode" in error ? (error as { providerErrorCode?: string }).providerErrorCode ?? null : null,
          }
        : null;
      priceImageFailures.push({ imageId: tableImage.id, imagePath: tableImage.image_path, systemErrorMessage });
      console.error("[store-visit-ai] price image failed", {
        visit_id: input.visitId,
        image_id: tableImage.id,
        image_path: tableImage.image_path,
        error: systemErrorMessage,
        diagnostic,
      });
      await supabase
        .from("offline_visit_images")
        .update({
          analysis_status: "failed",
          vision_result: {
            ...(isRecord(tableImage.vision_result) ? tableImage.vision_result : {}),
            upload_category: item.imageCategory,
            ai_request_diagnostic: diagnostic,
          },
          analysis_error: systemErrorMessage,
          error_message: systemErrorMessage,
        })
        .eq("id", tableImage.id);
    }
  }

  const displayAnalysisError: string | null = null;
  const displayImageFailures: { imageId: string; imagePath: string; systemErrorMessage: string }[] = [];

  const acceptedPriceImageResults = priceImageResults.filter((item) => item.result.photo_quality?.status !== "retake_required");
  const priceImageRetakeRequired = priceImageResults
    .filter((item) => isRetakeRequiredPriceImageResult(item.result))
    .map((item) => ({
      imageId: item.imageId,
      message: item.result.photo_quality.message,
      reasons: item.result.photo_quality.reasons,
    }));
  const aggregatedRows = acceptedPriceImageResults.flatMap((item) => item.result.rows);
  const aiAnalysis = {
    normalized: composeStoreVisitAiResult({
      rows: aggregatedRows,
      partialFailure: (priceImageFailures.length > 0 || priceImageRetakeRequired.length > 0) && acceptedPriceImageResults.length > 0,
    }),
    rawText: "",
    parsed: {},
    metadata: {
      model: "composed",
      base_url: "",
      parse_repaired: false,
      response_format: "none",
    },
    config: resolvedConfig,
  };

  return {
    visit: typedVisit,
    image_paths: imagePaths,
    image_categories: imageCategories,
    signed_image_count: signedEntries.length,
    image_input_mode: "signed_url",
    price_image_results: priceImageResults,
    price_image_failures: priceImageFailures,
    price_image_retake_required: priceImageRetakeRequired,
    partialFailure: (priceImageFailures.length > 0 || priceImageRetakeRequired.length > 0) && acceptedPriceImageResults.length > 0,
    allPriceImagesFailed: (priceImageFailures.length > 0 || priceImageRetakeRequired.length > 0) && acceptedPriceImageResults.length === 0,
    display_analysis: null,
    display_analysis_error: displayAnalysisError,
    display_image_failures: displayImageFailures,
    fallbackImageUrlToDataUrl,
    ...aiAnalysis,
  };
}
