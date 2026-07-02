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

function isNearPackageAmount(perPieceNetPrice: number, pieceCount: number, packagePrice: number) {
  const reconstructedPackagePrice = perPieceNetPrice * pieceCount;
  const tolerance = Math.max(500, Math.round(packagePrice * 0.1));
  return Math.abs(reconstructedPackagePrice - packagePrice) <= tolerance;
}

export function reconcilePackagePriceMetrics({
  listPriceIdr,
  packagePriceIdr,
  netPriceIdr,
  pieceCount,
}: {
  listPriceIdr: number | null;
  packagePriceIdr: number | null;
  netPriceIdr: number | null;
  pieceCount: number | null;
}) {
  const resolvedPackagePrice = packagePriceIdr ?? listPriceIdr ?? netPriceIdr;
  const resolvedListPrice = listPriceIdr ?? resolvedPackagePrice ?? netPriceIdr;
  const resolvedNetPrice = netPriceIdr ?? resolvedPackagePrice ?? resolvedListPrice;

  if (
    resolvedPackagePrice
    && resolvedNetPrice
    && pieceCount
    && pieceCount > 1
    && resolvedNetPrice < resolvedPackagePrice
    && isNearPackageAmount(resolvedNetPrice, pieceCount, resolvedPackagePrice)
  ) {
    return {
      listPriceIdr: resolvedListPrice ?? resolvedPackagePrice,
      packagePriceIdr: resolvedPackagePrice,
      netPriceIdr: resolvedPackagePrice,
      correctedFromPerPiece: true,
      warningMessage: "AI likely divided a whole-package price by piece count. Restored whole-package IDR amount fields.",
    };
  }

  return {
    listPriceIdr: resolvedListPrice,
    packagePriceIdr: resolvedPackagePrice,
    netPriceIdr: resolvedNetPrice,
    correctedFromPerPiece: false,
    warningMessage: null,
  };
}

export function calculatePricePerPiece(packagePrice: number | null, pieceCount: number | null) {
  if (!packagePrice || !pieceCount || pieceCount <= 0) return null;
  return Number((packagePrice / pieceCount).toFixed(2));
}
