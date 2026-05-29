import type {
  OfflineImageType,
  OfflineImageVisionResult,
  PromoEventType,
  VisionDetectedProduct,
} from "@/lib/types";
import { createJsonChatCompletion, hasAiConfig, imageUrlPart, textPart } from "@/lib/ai-client";

const knownBrands = ["Merries", "Pampers", "MamyPoko", "Sweety", "Goo.N", "Makuku"];
const sizes = ["XXXL", "XXL", "XL", "NB", "L", "M", "S"];

function inferBrand(text: string) {
  const lower = text.toLowerCase();
  return knownBrands.find((brand) => lower.includes(brand.toLowerCase())) ?? "Merries";
}

function inferSize(text: string) {
  const upper = text.toUpperCase();
  return sizes.find((size) => upper.includes(size)) ?? "L";
}

function inferPieceCount(size: string) {
  switch (size) {
    case "NB":
      return 40;
    case "S":
      return 36;
    case "M":
      return 32;
    case "XL":
      return 28;
    case "XXL":
      return 24;
    default:
      return 30;
  }
}

function inferPromoMechanic(text: string): PromoEventType | "gift" | "cashback" {
  const lower = text.toLowerCase();
  if (lower.includes("voucher")) return "voucher";
  if (lower.includes("bundle")) return "bundle";
  if (lower.includes("cashback")) return "cashback";
  if (lower.includes("gift")) return "gift";
  if (lower.includes("buy") || lower.includes("save")) return "buy_more_save";
  return "offline_display";
}

export function buildMockVisionResult(input: {
  imageType: OfflineImageType;
  fileName: string;
  targetBrand?: string | null;
  storeName?: string | null;
  city?: string | null;
}): OfflineImageVisionResult {
  const text = `${input.fileName} ${input.storeName ?? ""} ${input.city ?? ""}`;
  const brand = input.targetBrand || (input.imageType === "own_shelf" ? "Makuku" : inferBrand(text));
  const size = inferSize(text);
  const pieceCount = inferPieceCount(size);
  const pricePerPiece = brand === "Makuku" ? 2450 : brand === "Pampers" ? 2260 : brand === "Merries" ? 2320 : 2150;
  const promoPrice = pieceCount * pricePerPiece;
  const product: VisionDetectedProduct = {
    brand_name: brand,
    product_name_raw: `${brand} Pants ${size}${pieceCount}`,
    product_name_normalized: `${brand} Pants ${size}${pieceCount}`,
    pack_type: "pants",
    size,
    piece_count: pieceCount,
    bundle_count: 1,
    total_piece_count: pieceCount,
    list_price_idr: Math.round(promoPrice * 1.12),
    promo_price_idr: promoPrice,
    promo_mechanic: inferPromoMechanic(text),
    promo_text_raw: input.imageType === "promo_tag" ? "Visible shelf promotion tag" : "Shelf observation",
    confidence: {
      brand: 0.86,
      product: 0.78,
      price: input.imageType === "own_shelf" ? 0.55 : 0.8,
      piece_count: 0.74,
    },
  };

  return {
    schema_version: "offline_image_vision_v1",
    image_type: input.imageType,
    target_brand: input.targetBrand ?? null,
    image_quality: "good",
    needs_human_review: true,
    review_reasons: input.imageType === "own_shelf"
      ? ["Own shelf image is for display review, not competitor price entry"]
      : ["Confirm product and shelf-tag price before business posting"],
    detected_products: [product],
    overall_confidence: 0.78,
  };
}

export async function analyzeOfflineImage(input: {
  imageType: OfflineImageType;
  imageUrl?: string | null;
  fileName: string;
  targetBrand?: string | null;
  storeName?: string | null;
  city?: string | null;
}) {
  if (!hasAiConfig() || !input.imageUrl) {
    return buildMockVisionResult(input);
  }

  try {
    const completion = await createJsonChatCompletion({
      messages: [
        {
          role: "user",
          content: [
            textPart([
              "You analyze diaper shelf and promotion photos for Makuku Indonesia.",
              "Return JSON only using schema_version offline_image_vision_v1.",
              "Do not invent missing values; use null and needs_human_review when unclear.",
              `Image type: ${input.imageType}`,
              `Expected target brand: ${input.targetBrand ?? "unknown"}`,
              `Store: ${input.storeName ?? "unknown"}`,
              `City: ${input.city ?? "unknown"}`,
            ].join("\n")),
            imageUrlPart(input.imageUrl),
          ],
        },
      ],
    });
    return completion.parsed as OfflineImageVisionResult;
  } catch {
    return buildMockVisionResult(input);
  }
}
