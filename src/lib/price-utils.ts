export function parseIdrPrice(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const cleaned = raw.replace(/[^\d.,]/g, "").replace(/^[.,]+|[.,]+$/g, "");
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
const MIN_IDR_PRICE_EVIDENCE = 1000;

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
export type PriceEvidenceReasonCode =
  | "PRODUCT_PRICE_BINDING_UNCLEAR"
  | "PRICE_TAG_UNCLEAR"
  | "PIECE_COUNT_UNCLEAR"
  | "PRICE_MATH_CONFLICT"
  | "PRICE_DERIVED"
  | "LEGACY_EVIDENCE_UNAVAILABLE";

function detailNumber(detail: Record<string, unknown>, key: string) {
  const value = Number(detail[key]);
  return Number.isFinite(value) ? value : null;
}

export function derivePriceEvidenceReasonCode({
  status,
  detail,
}: {
  status: PriceEvidenceStatus | null | undefined;
  detail: Record<string, unknown> | null | undefined;
}): PriceEvidenceReasonCode | null {
  if (!status || status === "CLEAR") return null;
  if (status === "CONFLICT") return "PRICE_MATH_CONFLICT";
  if (!detail) return "LEGACY_EVIDENCE_UNAVAILABLE";

  const threshold = detailNumber(detail, "threshold") ?? PRICE_EVIDENCE_CONFIDENCE_THRESHOLD;
  const rowBindingConfidence = detailNumber(detail, "row_binding_confidence");
  const sectionBindingConfidence = detailNumber(detail, "section_binding_confidence");
  if ((rowBindingConfidence !== null && rowBindingConfidence < threshold)
    || (sectionBindingConfidence !== null && sectionBindingConfidence < threshold)) {
    return "PRODUCT_PRICE_BINDING_UNCLEAR";
  }
  if (detail.visible_piece_count_clear === false) return "PIECE_COUNT_UNCLEAR";
  if (detail.package_price_status === "DERIVED" || detail.per_piece_price_status === "DERIVED" || status === "DERIVED") {
    return "PRICE_DERIVED";
  }
  return "PRICE_TAG_UNCLEAR";
}

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

function textContainsVisiblePieceCount(text: string | number | null | undefined, pieceCount: number | null | undefined) {
  if (!pieceCount || !Number.isFinite(pieceCount) || pieceCount <= 0) return false;
  const normalizedText = String(text ?? "").trim().toUpperCase();
  if (!normalizedText) return false;
  const count = String(Math.floor(pieceCount));
  const countPattern = new RegExp(`(^|[^0-9])${count}([^0-9]|$)`);
  return countPattern.test(normalizedText);
}

function hasVisiblePieceCountEvidence({
  pieceCount,
  pieceCountText,
  skuText,
  rowAnchor,
  pieceCountConfidence,
}: {
  pieceCount: number | null;
  pieceCountText?: string | number | null;
  skuText?: string | number | null;
  rowAnchor?: string | number | null;
  pieceCountConfidence?: number | null;
}) {
  if (!pieceCount || !Number.isFinite(pieceCount) || pieceCount <= 0) return false;
  if (textContainsVisiblePieceCount(pieceCountText, pieceCount)) return true;
  if (textContainsVisiblePieceCount(rowAnchor, pieceCount)) return true;
  if (textContainsVisiblePieceCount(skuText, pieceCount)) return true;
  return (normalizeConfidence(pieceCountConfidence) ?? 0) >= PRICE_EVIDENCE_CONFIDENCE_THRESHOLD;
}

function createPriceEvidence(
  source: PriceEvidenceSource,
  textValue: string | number | null | undefined,
  numericValue: number | null | undefined,
  confidence?: number | null,
): PriceEvidence | null {
  const parsedTextValue = parseIdrPrice(textValue);
  const parsedNumericValue = typeof numericValue === "number" && Number.isFinite(numericValue) ? numericValue : null;
  const value = parsedTextValue && parsedTextValue >= MIN_IDR_PRICE_EVIDENCE
    ? parsedTextValue
    : parsedNumericValue && parsedNumericValue >= MIN_IDR_PRICE_EVIDENCE
      ? parsedNumericValue
      : null;
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
  pieceCountText,
  skuText,
  rowAnchor,
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
  pieceCountText?: string | number | null;
  skuText?: string | number | null;
  rowAnchor?: string | number | null;
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
  const visiblePieceCountClear = hasVisiblePieceCountEvidence({
    pieceCount,
    pieceCountText,
    skuText,
    rowAnchor,
    pieceCountConfidence,
  });
  const finalPackagePriceConfidence = selectedPackageEvidence
    ? minConfidence([
        selectedPackageEvidence.confidence,
        rowBindingConfidence,
        sectionBindingConfidence,
        productIdentityConfidence,
      ])
    : null;
  const finalPiecePriceConfidence = selectedPieceEvidence
    ? minConfidence([
        selectedPieceEvidence.confidence,
        rowBindingConfidence,
        sectionBindingConfidence,
        productIdentityConfidence,
      ])
    : null;
  const finalPackagePriceClear = Boolean(visiblePieceCountClear && selectedPackageEvidence && finalPackagePriceConfidence !== null && finalPackagePriceConfidence >= PRICE_EVIDENCE_CONFIDENCE_THRESHOLD);
  const finalPiecePriceClear = Boolean(visiblePieceCountClear && selectedPieceEvidence && finalPiecePriceConfidence !== null && finalPiecePriceConfidence >= PRICE_EVIDENCE_CONFIDENCE_THRESHOLD);
  const finalActualPriceClear = finalPackagePriceClear || finalPiecePriceClear;
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
  const finalActualPriceConfidence = finalPackagePriceClear && finalPiecePriceClear && priceEvidenceConfidence !== null
    ? priceEvidenceConfidence
    : finalPackagePriceClear
    ? finalPackagePriceConfidence
    : finalPiecePriceClear
      ? finalPiecePriceConfidence
      : priceEvidenceConfidence;
  const lowConfidence = !finalActualPriceClear && priceEvidenceConfidence !== null && priceEvidenceConfidence < PRICE_EVIDENCE_CONFIDENCE_THRESHOLD;
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
    : finalActualPriceClear
      ? "CLEAR"
      : !visiblePieceCountClear && Boolean(pieceCount)
        ? "REVIEW_REQUIRED"
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
    derivedFromPiece && !finalPiecePriceClear ? "DERIVED_FROM_PIECE_PRICE: no clear package price evidence; package price was derived from piece price and piece count." : null,
    reviewableDerivedFromPackage && !finalPackagePriceClear ? "DERIVED_FROM_PACKAGE: no clear piece price evidence; analysis piece price was derived from package price and piece count." : null,
    netPiecePrice ? "net_price field contains piece price evidence; kept it separate from package price." : null,
    packageFieldPiecePrice || listFieldPiecePrice ? "Package/list price field contains piece price evidence; kept it separate from package price." : null,
    visiblePieceEvidence?.role === "PACKAGE" ? "visible price per piece field contains a package-scale value; ignored as piece price field evidence." : null,
  ].filter(Boolean);
  const warnings = warningMessages.map((message) => ({ type: "PARSE_RISK", message: String(message) }));
  const reviewDecision: PriceReviewDecision = priceEvidenceStatus === "CLEAR"
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
    priceEvidenceConfidence: finalActualPriceConfidence,
    reviewDecision,
    priceEvidenceDetail: {
      package_price_confidence: resolvedPackagePriceConfidence,
      per_piece_price_confidence: resolvedPerPiecePriceConfidence,
      final_actual_price_confidence: finalActualPriceConfidence,
      visible_piece_count_clear: visiblePieceCountClear,
      piece_count_confidence: normalizeConfidence(pieceCountConfidence),
      row_binding_confidence: normalizeConfidence(rowBindingConfidence),
      section_binding_confidence: normalizeConfidence(sectionBindingConfidence),
      product_identity_confidence: normalizeConfidence(productIdentityConfidence),
      package_price_source: selectedPackageEvidence?.source ?? (derivedFromPiece ? "VISIBLE_PIECE" : null),
      per_piece_price_source: selectedPieceEvidence?.source ?? (derivedFromPackage ? selectedPackageEvidence?.source ?? null : null),
      package_price_status: derivedFromPiece ? "DERIVED" : selectedPackageEvidence ? "VISIBLE" : "MISSING",
      per_piece_price_status: derivedFromPackage ? "DERIVED" : selectedPieceEvidence ? "VISIBLE" : "MISSING",
      per_piece_derivation_basis: derivedFromPackage ? "PACKAGE_AND_PIECE_COUNT" : null,
      threshold: PRICE_EVIDENCE_CONFIDENCE_THRESHOLD,
    },
  };
}

export function calculatePricePerPiece(packagePrice: number | null, pieceCount: number | null) {
  if (!packagePrice || !pieceCount || pieceCount <= 0) return null;
  return Number((packagePrice / pieceCount).toFixed(2));
}
