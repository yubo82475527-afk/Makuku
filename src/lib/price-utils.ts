export function parseIdrPrice(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const cleaned = raw.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;

  const hasDot = cleaned.includes(".");
  const hasComma = cleaned.includes(",");
  let normalized = cleaned;

  if (hasDot && hasComma) {
    const lastDot = cleaned.lastIndexOf(".");
    const lastComma = cleaned.lastIndexOf(",");
    const decimalSeparator = lastDot > lastComma ? "." : ",";
    const thousandsSeparator = decimalSeparator === "." ? "," : ".";
    normalized = cleaned
      .replaceAll(thousandsSeparator, "")
      .replace(decimalSeparator, ".");
  } else if (hasDot || hasComma) {
    const separator = hasDot ? "." : ",";
    const parts = cleaned.split(separator);
    const lastPart = parts.at(-1) ?? "";
    const looksLikeDecimal = lastPart.length > 0 && lastPart.length !== 3;
    normalized = looksLikeDecimal
      ? parts.slice(0, -1).join("") + "." + lastPart
      : parts.join("");
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function calculatePricePerPiece(packagePrice: number | null, pieceCount: number | null) {
  if (!packagePrice || !pieceCount || pieceCount <= 0) return null;
  return Number((packagePrice / pieceCount).toFixed(2));
}
