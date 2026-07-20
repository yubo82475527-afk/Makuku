export type PriceImageRetakeReason = "PHOTO_QUALITY" | "NO_READABLE_PRICE_ROWS";

type PriceImageResult = {
  photo_quality?: { status?: string | null } | null;
  rows?: unknown[] | null;
};

export function priceImageRetakeReason(
  result: PriceImageResult | null | undefined,
): PriceImageRetakeReason | null {
  if (!result) return null;
  if (result.photo_quality?.status === "retake_required") return "PHOTO_QUALITY";
  return result.photo_quality?.status === "pass" && Array.isArray(result.rows) && result.rows.length === 0
    ? "NO_READABLE_PRICE_ROWS"
    : null;
}
