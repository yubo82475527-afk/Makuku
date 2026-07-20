export type PriceImageRetakeReason = "PHOTO_QUALITY" | "NO_READABLE_PRICE_ROWS";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function priceImageRetakeReason(
  result: unknown,
): PriceImageRetakeReason | null {
  if (!isRecord(result) || !isRecord(result.photo_quality)) return null;
  const photoQualityStatus = result.photo_quality.status;
  if (photoQualityStatus === "retake_required") return "PHOTO_QUALITY";
  return photoQualityStatus === "pass" && Array.isArray(result.rows) && result.rows.length === 0
    ? "NO_READABLE_PRICE_ROWS"
    : null;
}
