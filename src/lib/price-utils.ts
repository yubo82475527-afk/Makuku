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

function roundedWholePackageAmount(perPieceNetPrice: number, pieceCount: number) {
  return Math.round((perPieceNetPrice * pieceCount) / 100) * 100;
}

function looksLikeDiscountedWholePackageAmount(reconstructedPackagePrice: number, referencePrice: number) {
  const ratio = reconstructedPackagePrice / referencePrice;
  return ratio >= 0.6 && ratio <= 0.95;
}

export function reconcilePackagePriceMetrics({
  listPriceIdr,
  packagePriceIdr,
  netPriceIdr,
  pieceCount,
  visiblePricePerPieceIdr,
}: {
  listPriceIdr: number | null;
  packagePriceIdr: number | null;
  netPriceIdr: number | null;
  pieceCount: number | null;
  visiblePricePerPieceIdr?: number | null;
}) {
  const resolvedPackagePrice = packagePriceIdr ?? listPriceIdr ?? netPriceIdr;
  const resolvedListPrice = listPriceIdr ?? resolvedPackagePrice ?? netPriceIdr;
  const resolvedNetPrice = netPriceIdr ?? resolvedPackagePrice ?? resolvedListPrice;
  const reconstructedPackagePrice = resolvedNetPrice && pieceCount && pieceCount > 1
    ? roundedWholePackageAmount(resolvedNetPrice, pieceCount)
    : null;

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
      visiblePricePerPieceIdr: visiblePricePerPieceIdr ?? null,
      priceBasis: "RECONCILED_PACKAGE_PRICE" as const,
      correctedFromPerPiece: true,
      warningMessage: "AI likely divided a whole-package price by piece count. Restored whole-package IDR amount fields.",
    };
  }

  if (
    resolvedListPrice
    && resolvedNetPrice
    && pieceCount
    && pieceCount > 1
    && resolvedNetPrice < 10000
    && reconstructedPackagePrice
    && reconstructedPackagePrice > resolvedNetPrice
    && looksLikeDiscountedWholePackageAmount(reconstructedPackagePrice, resolvedListPrice)
  ) {
    return {
      listPriceIdr: resolvedListPrice,
      packagePriceIdr: reconstructedPackagePrice,
      netPriceIdr: reconstructedPackagePrice,
      visiblePricePerPieceIdr: visiblePricePerPieceIdr ?? null,
      priceBasis: "RECONCILED_PACKAGE_PRICE" as const,
      correctedFromPerPiece: true,
      warningMessage: "AI likely used a per-piece value for a discounted whole-package price. Reconstructed the discounted whole-package IDR amount.",
    };
  }

  const visiblePerPiecePackagePrice = visiblePricePerPieceIdr && pieceCount && pieceCount > 0
    ? Math.round(visiblePricePerPieceIdr * pieceCount)
    : null;
  if (!resolvedNetPrice && !resolvedPackagePrice && !resolvedListPrice && visiblePricePerPieceIdr && visiblePerPiecePackagePrice) {
    return {
      listPriceIdr: visiblePerPiecePackagePrice,
      packagePriceIdr: visiblePerPiecePackagePrice,
      netPriceIdr: visiblePerPiecePackagePrice,
      visiblePricePerPieceIdr,
      priceBasis: "VISIBLE_PRICE_PER_PIECE" as const,
      correctedFromPerPiece: true,
      warningMessage: "Final package price was reconstructed from visible per-piece price because no whole-package price was available.",
    };
  }

  return {
    listPriceIdr: resolvedListPrice,
    packagePriceIdr: resolvedPackagePrice,
    netPriceIdr: resolvedNetPrice,
    visiblePricePerPieceIdr: visiblePricePerPieceIdr ?? null,
    priceBasis: resolvedNetPrice && resolvedPackagePrice && resolvedNetPrice < resolvedPackagePrice
      ? "VISIBLE_PROMO_PACKAGE_PRICE" as const
      : "VISIBLE_PACKAGE_PRICE" as const,
    correctedFromPerPiece: false,
    warningMessage: null,
  };
}

export function calculatePricePerPiece(packagePrice: number | null, pieceCount: number | null) {
  if (!packagePrice || !pieceCount || pieceCount <= 0) return null;
  return Number((packagePrice / pieceCount).toFixed(2));
}
