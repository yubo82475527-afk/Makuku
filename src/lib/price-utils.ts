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

type PriceRole = "PACKAGE" | "PIECE" | "UNKNOWN";
type PriceEvidenceSource = "LIST" | "PACKAGE" | "NET" | "VISIBLE_PIECE";

type PriceEvidence = {
  source: PriceEvidenceSource;
  value: number;
  role: PriceRole;
};

function classifyPriceRole(value: number | null | undefined): PriceRole {
  if (!value || !Number.isFinite(value) || value <= 0) return "UNKNOWN";
  return value >= 10000 ? "PACKAGE" : "PIECE";
}

function createPriceEvidence(source: PriceEvidenceSource, textValue: string | number | null | undefined, numericValue: number | null | undefined): PriceEvidence | null {
  const value = parseIdrPrice(textValue) ?? numericValue ?? null;
  if (!value || !Number.isFinite(value) || value <= 0) return null;
  return {
    source,
    value,
    role: classifyPriceRole(value),
  };
}

function evidenceValue(evidence: PriceEvidence | null | undefined, role: PriceRole) {
  return evidence?.role === role ? evidence.value : null;
}

export function reconcilePackagePriceMetrics({
  listPriceIdr,
  packagePriceIdr,
  netPriceIdr,
  pieceCount,
  visiblePricePerPieceIdr,
  listPriceText,
  packagePriceText,
  netPriceText,
  visiblePricePerPieceText,
}: {
  listPriceIdr: number | null;
  packagePriceIdr: number | null;
  netPriceIdr: number | null;
  pieceCount: number | null;
  visiblePricePerPieceIdr?: number | null;
  listPriceText?: string | number | null;
  packagePriceText?: string | number | null;
  netPriceText?: string | number | null;
  visiblePricePerPieceText?: string | number | null;
}) {
  const listEvidence = createPriceEvidence("LIST", listPriceText, listPriceIdr);
  const packageEvidence = createPriceEvidence("PACKAGE", packagePriceText, packagePriceIdr);
  const netEvidence = createPriceEvidence("NET", netPriceText, netPriceIdr);
  const visiblePieceEvidence = createPriceEvidence("VISIBLE_PIECE", visiblePricePerPieceText, visiblePricePerPieceIdr ?? null);

  const packageListPrice = evidenceValue(listEvidence, "PACKAGE");
  const packagePackagePrice = evidenceValue(packageEvidence, "PACKAGE") ?? packageListPrice;
  const packageNetEvidencePrice = evidenceValue(netEvidence, "PACKAGE");

  const visiblePiecePrice = evidenceValue(visiblePieceEvidence, "PIECE");
  const netPiecePrice = evidenceValue(netEvidence, "PIECE");
  const packageFieldPiecePrice = evidenceValue(packageEvidence, "PIECE");
  const listFieldPiecePrice = evidenceValue(listEvidence, "PIECE");
  const selectedPiecePrice = visiblePiecePrice ?? netPiecePrice ?? packageFieldPiecePrice ?? listFieldPiecePrice;
  const visiblePricePerPiece = visiblePiecePrice ?? netPiecePrice ?? packageFieldPiecePrice ?? listFieldPiecePrice ?? null;

  const derivedPackageFromPiece = selectedPiecePrice && pieceCount && pieceCount > 0
    ? roundedWholePackageAmount(selectedPiecePrice, pieceCount)
    : null;
  const discountedPackageFromPiece = derivedPackageFromPiece
    && packageListPrice
    && derivedPackageFromPiece > selectedPiecePrice!
    && looksLikeDiscountedWholePackageAmount(derivedPackageFromPiece, packageListPrice)
      ? derivedPackageFromPiece
      : null;
  const dividedPackageRestoration = netPiecePrice && packagePackagePrice && pieceCount && pieceCount > 1 && isNearPackageAmount(netPiecePrice, pieceCount, packagePackagePrice)
    ? packagePackagePrice
    : null;

  const resolvedNetPrice = packageNetEvidencePrice
    ?? discountedPackageFromPiece
    ?? dividedPackageRestoration
    ?? packagePackagePrice
    ?? packageListPrice
    ?? derivedPackageFromPiece;
  const resolvedPackagePrice = packagePackagePrice
    ? discountedPackageFromPiece ?? dividedPackageRestoration ?? packagePackagePrice
    : discountedPackageFromPiece
    ?? dividedPackageRestoration
    ?? derivedPackageFromPiece
    ?? resolvedNetPrice;
  const resolvedListPrice = packageListPrice ?? resolvedPackagePrice ?? resolvedNetPrice;
  const pricePerPiece = selectedPiecePrice ?? calculatePricePerPiece(resolvedNetPrice ?? resolvedPackagePrice ?? null, pieceCount);
  const derivedFromPiece = !packageNetEvidencePrice && !packagePackagePrice && !packageListPrice && Boolean(derivedPackageFromPiece);
  const derivedFromPackage = !selectedPiecePrice && Boolean(pricePerPiece) && Boolean(listPriceText || packagePriceText || netPriceText);
  const correctedFromPerPiece = Boolean(dividedPackageRestoration || discountedPackageFromPiece || derivedFromPiece || netPiecePrice || packageFieldPiecePrice || listFieldPiecePrice || (visiblePieceEvidence?.role === "PACKAGE"));
  const warningMessages = [
    dividedPackageRestoration ? "AI likely divided a whole-package price by piece count. Restored whole-package IDR amount fields." : null,
    discountedPackageFromPiece ? "DERIVED_FROM_PIECE_PRICE: reconstructed discounted package price from piece price evidence and piece count." : null,
    derivedFromPiece ? "DERIVED_FROM_PIECE_PRICE: no clear package price evidence; package price was derived from piece price and piece count." : null,
    derivedFromPackage ? "DERIVED_FROM_PACKAGE: no clear piece price evidence; analysis piece price was derived from package price and piece count." : null,
    netPiecePrice ? "net_price field contains piece price evidence; kept it separate from package price." : null,
    packageFieldPiecePrice || listFieldPiecePrice ? "Package/list price field contains piece price evidence; kept it separate from package price." : null,
    visiblePieceEvidence?.role === "PACKAGE" ? "visible price per piece field contains a package-scale value; ignored as piece price field evidence." : null,
  ].filter(Boolean);

  return {
    listPriceIdr: resolvedListPrice,
    packagePriceIdr: resolvedPackagePrice,
    netPriceIdr: resolvedNetPrice,
    visiblePricePerPieceIdr: visiblePricePerPiece,
    pricePerPieceIdr: pricePerPiece,
    priceBasis: derivedFromPiece
      ? "VISIBLE_PRICE_PER_PIECE" as const
      : resolvedNetPrice && resolvedPackagePrice && resolvedNetPrice < resolvedPackagePrice
        ? "VISIBLE_PROMO_PACKAGE_PRICE" as const
        : discountedPackageFromPiece || dividedPackageRestoration
          ? "RECONCILED_PACKAGE_PRICE" as const
          : "VISIBLE_PACKAGE_PRICE" as const,
    correctedFromPerPiece,
    warningMessage: warningMessages.length > 0 ? warningMessages.join(" ") : null,
  };
}

export function calculatePricePerPiece(packagePrice: number | null, pieceCount: number | null) {
  if (!packagePrice || !pieceCount || pieceCount <= 0) return null;
  return Number((packagePrice / pieceCount).toFixed(2));
}
