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

const PRICE_EVIDENCE_CONFIDENCE_THRESHOLD = 0.75;

function isNearPackageAmount(perPieceNetPrice: number, pieceCount: number, packagePrice: number) {
  const reconstructedPackagePrice = perPieceNetPrice * pieceCount;
  const tolerance = Math.max(500, Math.round(packagePrice * 0.1));
  return Math.abs(reconstructedPackagePrice - packagePrice) <= tolerance;
}

function packagePieceConflict(packagePrice: number, piecePrice: number, pieceCount: number) {
  const reconstructedPackagePrice = piecePrice * pieceCount;
  const tolerance = Math.max(1000, Math.round(packagePrice * 0.015));
  return Math.abs(reconstructedPackagePrice - packagePrice) > tolerance;
}

type PriceRole = "PACKAGE" | "PIECE" | "UNKNOWN";
type PriceEvidenceSource = "LIST" | "PACKAGE" | "NET" | "VISIBLE_PIECE";
export type PriceEvidenceStatus = "CLEAR" | "LOW_CONFIDENCE" | "DERIVED" | "CONFLICT" | "REVIEW_REQUIRED";
export type PriceReviewDecision = "AUTO_APPROVE" | "NEED_REVIEW";

type PriceEvidence = {
  source: PriceEvidenceSource;
  value: number;
  role: PriceRole;
  confidence: number | null;
};

function classifyPriceRole(value: number | null | undefined): PriceRole {
  if (!value || !Number.isFinite(value) || value <= 0) return "UNKNOWN";
  return value >= 10000 ? "PACKAGE" : "PIECE";
}

function normalizeConfidence(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(Math.max(value, 0), 1);
}

function minConfidence(values: Array<number | null | undefined>) {
  const normalized = values
    .map((value) => normalizeConfidence(value))
    .filter((value): value is number => value !== null);
  if (normalized.length === 0) return null;
  return Math.min(...normalized);
}

function createPriceEvidence(
  source: PriceEvidenceSource,
  textValue: string | number | null | undefined,
  numericValue: number | null | undefined,
  confidence?: number | null,
): PriceEvidence | null {
  const value = parseIdrPrice(textValue) ?? numericValue ?? null;
  if (!value || !Number.isFinite(value) || value <= 0) return null;
  return {
    source,
    value,
    role: classifyPriceRole(value),
    confidence: normalizeConfidence(confidence),
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
  listPriceConfidence,
  packagePriceConfidence,
  netPriceConfidence,
  visiblePricePerPieceConfidence,
  pieceCountConfidence,
  rowBindingConfidence,
  sectionBindingConfidence,
  productIdentityConfidence,
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
  listPriceConfidence?: number | null;
  packagePriceConfidence?: number | null;
  netPriceConfidence?: number | null;
  visiblePricePerPieceConfidence?: number | null;
  pieceCountConfidence?: number | null;
  rowBindingConfidence?: number | null;
  sectionBindingConfidence?: number | null;
  productIdentityConfidence?: number | null;
}) {
  const listEvidence = createPriceEvidence("LIST", listPriceText, listPriceIdr, listPriceConfidence);
  const packageEvidence = createPriceEvidence("PACKAGE", packagePriceText, packagePriceIdr, packagePriceConfidence);
  const netEvidence = createPriceEvidence("NET", netPriceText, netPriceIdr, netPriceConfidence);
  const visiblePieceEvidence = createPriceEvidence("VISIBLE_PIECE", visiblePricePerPieceText, visiblePricePerPieceIdr ?? null, visiblePricePerPieceConfidence);

  const packageListPrice = evidenceValue(listEvidence, "PACKAGE");
  const packagePackagePrice = evidenceValue(packageEvidence, "PACKAGE") ?? packageListPrice;
  const packageNetEvidencePrice = evidenceValue(netEvidence, "PACKAGE");
  const selectedPackageEvidence = packageNetEvidencePrice
    ? netEvidence
    : packagePackagePrice === evidenceValue(packageEvidence, "PACKAGE")
      ? packageEvidence
      : packageListPrice
        ? listEvidence
        : null;

  const visiblePiecePrice = evidenceValue(visiblePieceEvidence, "PIECE");
  const netPiecePrice = evidenceValue(netEvidence, "PIECE");
  const packageFieldPiecePrice = evidenceValue(packageEvidence, "PIECE");
  const listFieldPiecePrice = evidenceValue(listEvidence, "PIECE");
  const selectedPieceEvidence = visiblePiecePrice
    ? visiblePieceEvidence
    : netPiecePrice
      ? netEvidence
      : packageFieldPiecePrice
        ? packageEvidence
        : listFieldPiecePrice
          ? listEvidence
          : null;
  const selectedPiecePrice = selectedPieceEvidence?.value ?? null;
  const visiblePricePerPiece = selectedPiecePrice ?? null;

  const derivedPackageFromPiece = selectedPiecePrice && pieceCount && pieceCount > 0
    ? Math.round(selectedPiecePrice * pieceCount)
    : null;
  const dividedPackageRestoration = netPiecePrice && packagePackagePrice && pieceCount && pieceCount > 1 && isNearPackageAmount(netPiecePrice, pieceCount, packagePackagePrice)
    ? packagePackagePrice
    : null;

  const resolvedNetPrice = packageNetEvidencePrice
    ?? dividedPackageRestoration
    ?? packagePackagePrice
    ?? packageListPrice
    ?? derivedPackageFromPiece;
  const resolvedPackagePrice = packagePackagePrice
    ? dividedPackageRestoration ?? packagePackagePrice
    : dividedPackageRestoration
    ?? derivedPackageFromPiece
    ?? resolvedNetPrice;
  const resolvedListPrice = packageListPrice ?? resolvedPackagePrice ?? resolvedNetPrice;
  const pricePerPiece = selectedPiecePrice ?? calculatePricePerPiece(resolvedNetPrice ?? resolvedPackagePrice ?? null, pieceCount);
  const derivedFromPiece = !selectedPackageEvidence && Boolean(derivedPackageFromPiece);
  const derivedFromPackage = !selectedPiecePrice && Boolean(pricePerPiece) && Boolean(listPriceText || packagePriceText || netPriceText);
  const conflict = Boolean(
    resolvedNetPrice
    && selectedPiecePrice
    && pieceCount
    && pieceCount > 0
    && selectedPackageEvidence
    && selectedPieceEvidence
    && packagePieceConflict(resolvedNetPrice, selectedPiecePrice, pieceCount),
  );
  const correctedFromPerPiece = Boolean(dividedPackageRestoration || derivedFromPiece || netPiecePrice || packageFieldPiecePrice || listFieldPiecePrice || (visiblePieceEvidence?.role === "PACKAGE"));

  const aiConfidence = minConfidence(productIdentityConfidence === null || productIdentityConfidence === undefined
    ? [rowBindingConfidence, sectionBindingConfidence]
    : [rowBindingConfidence, sectionBindingConfidence, productIdentityConfidence]);
  const legacyConfidenceFallback = aiConfidence === null;
  const resolvedPackagePriceConfidence = minConfidence([
    selectedPackageEvidence?.confidence ?? (derivedFromPiece ? selectedPieceEvidence?.confidence : null),
    pieceCountConfidence,
    rowBindingConfidence,
    sectionBindingConfidence,
  ]);
  const resolvedPerPiecePriceConfidence = minConfidence([
    selectedPieceEvidence?.confidence ?? (derivedFromPackage ? selectedPackageEvidence?.confidence : null),
    pieceCountConfidence,
    rowBindingConfidence,
    sectionBindingConfidence,
  ]);
  const priceEvidenceConfidence = minConfidence([resolvedPackagePriceConfidence, resolvedPerPiecePriceConfidence]);
  const lowConfidence = priceEvidenceConfidence !== null && priceEvidenceConfidence < PRICE_EVIDENCE_CONFIDENCE_THRESHOLD;
  const packageToPieceDerivationIsClear = derivedFromPackage
    && !derivedFromPiece
    && !dividedPackageRestoration
    && !netPiecePrice
    && !packageFieldPiecePrice
    && !listFieldPiecePrice
    && visiblePieceEvidence?.role !== "PACKAGE"
    && !legacyConfidenceFallback
    && !lowConfidence;
  const reviewableDerivedFromPackage = derivedFromPackage && !packageToPieceDerivationIsClear;
  const priceEvidenceStatus: PriceEvidenceStatus = conflict
    ? "CONFLICT"
    : derivedFromPiece || reviewableDerivedFromPackage
      ? "DERIVED"
      : lowConfidence
        ? "LOW_CONFIDENCE"
        : legacyConfidenceFallback
          ? "REVIEW_REQUIRED"
          : "CLEAR";
  const conflicts = conflict
    ? [{
        type: "PACKAGE_PIECE_MISMATCH",
        message: "Visible package price and visible per-piece price are both high-confidence but do not reconcile with piece count.",
      }]
    : [];
  const warningMessages = [
    lowConfidence ? "LOW_CONFIDENCE: selected price evidence confidence is below review threshold." : null,
    dividedPackageRestoration ? "AI likely divided a whole-package price by piece count. Restored whole-package IDR amount fields." : null,
    derivedFromPiece ? "DERIVED_FROM_PIECE_PRICE: no clear package price evidence; package price was derived from piece price and piece count." : null,
    reviewableDerivedFromPackage ? "DERIVED_FROM_PACKAGE: no clear piece price evidence; analysis piece price was derived from package price and piece count." : null,
    netPiecePrice ? "net_price field contains piece price evidence; kept it separate from package price." : null,
    packageFieldPiecePrice || listFieldPiecePrice ? "Package/list price field contains piece price evidence; kept it separate from package price." : null,
    visiblePieceEvidence?.role === "PACKAGE" ? "visible price per piece field contains a package-scale value; ignored as piece price field evidence." : null,
  ].filter(Boolean);
  const warnings = warningMessages.map((message) => ({ type: "PARSE_RISK", message: String(message) }));
  const reviewDecision: PriceReviewDecision = priceEvidenceStatus === "CLEAR"
    && aiConfidence !== null
    && aiConfidence >= PRICE_EVIDENCE_CONFIDENCE_THRESHOLD
    && warnings.length === 0
    && conflicts.length === 0
      ? "AUTO_APPROVE"
      : "NEED_REVIEW";

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
        : dividedPackageRestoration
          ? "RECONCILED_PACKAGE_PRICE" as const
          : "VISIBLE_PACKAGE_PRICE" as const,
    correctedFromPerPiece,
    warnings,
    warningMessage: warningMessages.length > 0 ? warningMessages.join(" ") : null,
    conflicts,
    aiConfidence,
    legacyConfidenceFallback,
    priceEvidenceStatus,
    priceEvidenceConfidence,
    reviewDecision,
    priceEvidenceDetail: {
      package_price_confidence: resolvedPackagePriceConfidence,
      per_piece_price_confidence: resolvedPerPiecePriceConfidence,
      piece_count_confidence: normalizeConfidence(pieceCountConfidence),
      row_binding_confidence: normalizeConfidence(rowBindingConfidence),
      section_binding_confidence: normalizeConfidence(sectionBindingConfidence),
      product_identity_confidence: normalizeConfidence(productIdentityConfidence),
      package_price_source: selectedPackageEvidence?.source ?? (derivedFromPiece ? "VISIBLE_PIECE" : null),
      per_piece_price_source: selectedPieceEvidence?.source ?? (derivedFromPackage ? selectedPackageEvidence?.source ?? null : null),
      package_price_status: derivedFromPiece ? "DERIVED" : selectedPackageEvidence ? "VISIBLE" : "MISSING",
      per_piece_price_status: derivedFromPackage ? "DERIVED" : selectedPieceEvidence ? "VISIBLE" : "MISSING",
      threshold: PRICE_EVIDENCE_CONFIDENCE_THRESHOLD,
    },
  };
}

export function calculatePricePerPiece(packagePrice: number | null, pieceCount: number | null) {
  if (!packagePrice || !pieceCount || pieceCount <= 0) return null;
  return Number((packagePrice / pieceCount).toFixed(2));
}
