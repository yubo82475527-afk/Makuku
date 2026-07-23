export function normalizePieceCount(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

/** Longest-first size tokens so XXL is not split into XL. */
const SIZE_PACK_SIZE_TOKEN = "XXXXL|XXXL|XXL|XL|NB-S|NB|L|M|S";

function sizePackVariantPattern() {
  return new RegExp(
    String.raw`\b(${SIZE_PACK_SIZE_TOKEN})-?\s*(\d{1,3})(?:\s*\+\s*(\d{1,3}))?(?:s\b|\b)(?!\s*-\s*\d+\s*kg\b)`,
    "gi",
  );
}

export type SizePackVariant = {
  size: string;
  pieceCount: number;
  pieceCountText: string;
  label: string;
};

/**
 * Find every distinct SIZE + pack-count variant in a product title.
 * Only SIZE bound to a pack count counts (e.g. XL 24+4); bare XL/XXL does not.
 */
export function extractSizePackVariantsFromTitle(value: string | null | undefined): SizePackVariant[] {
  const title = String(value ?? "").replace(/\([^)]*\)/g, " ");
  const seen = new Set<string>();
  const variants: SizePackVariant[] = [];

  for (const match of title.matchAll(sizePackVariantPattern())) {
    const size = String(match[1] ?? "").toUpperCase();
    const base = Number(match[2]);
    const bonus = match[3] ? Number(match[3]) : 0;
    const pieceCount = normalizePieceCount(base + bonus);
    if (!size || pieceCount === null) continue;

    const key = `${size}|${pieceCount}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const pieceCountText = match[3] ? `${base}+${bonus}` : String(base);
    variants.push({
      size,
      pieceCount,
      pieceCountText,
      label: `${size} ${pieceCountText}`,
    });
  }

  return variants;
}

/** Strip all SIZE+pack spans, then append one variant label. */
export function buildSingleVariantProductTitle(title: string, variant: SizePackVariant): string {
  const stripped = String(title ?? "")
    .replace(sizePackVariantPattern(), " ")
    .replace(/[|/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped ? `${stripped} ${variant.label}` : variant.label;
}

export function parsePieceCountText(value: string | null | undefined): number | null {
  const text = String(value ?? "");
  const bonusMatch = text.match(/\b(\d{1,3})\s*\+\s*(\d{1,3})\b/);
  if (bonusMatch) {
    return normalizePieceCount(Number(bonusMatch[1]) + Number(bonusMatch[2]));
  }

  const openBonusMatch = text.match(/\b(\d{1,3})\s*\+\b/);
  if (openBonusMatch) return normalizePieceCount(Number(openBonusMatch[1]));

  const pcsMatch = text.match(/\b(\d{1,3})\s*(?:pcs?|pieces?)\b/i);
  if (pcsMatch) return normalizePieceCount(Number(pcsMatch[1]));

  const trailingPackMatch = text.match(/\b(?:nb-s|nb|s|m|l|xl|xxl|xxxl|xxxxl)\s*(\d{1,3})(?:\s*\+\s*(\d{1,3}))?\b/i);
  if (trailingPackMatch) {
    const base = Number(trailingPackMatch[1]);
    const bonus = trailingPackMatch[2] ? Number(trailingPackMatch[2]) : 0;
    return normalizePieceCount(base + bonus);
  }

  const finalNumberMatch = text.match(/\b(\d{1,3})(?:\s*\+\s*(\d{1,3}))?\s*$/);
  if (finalNumberMatch) {
    const base = Number(finalNumberMatch[1]);
    const bonus = finalNumberMatch[2] ? Number(finalNumberMatch[2]) : 0;
    return normalizePieceCount(base + bonus);
  }

  return null;
}

export type TrustedPieceCountSource = "AI_EXTRACTED" | "TITLE_SIZE_PACK" | "LABELED_PCS" | "UNTRUSTED";

export function parsePieceCountFromProductTitle(value: string | null | undefined): number | null {
  const title = String(value ?? "").replace(/\([^)]*\)/g, " ");
  const sizePackMatch = title.match(/\b(?:nb-s|nb|s|m|l|xl|xxl|xxxl|xxxxl)-?\s*(\d{1,3})(?:\s*\+\s*(\d{1,3}))?(?:s\b|\b)(?!\s*-\s*\d+\s*kg\b)/i);
  if (!sizePackMatch) return null;
  const base = Number(sizePackMatch[1]);
  const bonus = sizePackMatch[2] ? Number(sizePackMatch[2]) : 0;
  return normalizePieceCount(base + bonus);
}

export function resolveTrustedPieceCount(input: {
  productTitle: string | null | undefined;
  extractedValue: unknown;
  extractedText?: string | null;
  sourceLabel?: string | null;
}): { pieceCount: number | null; source: TrustedPieceCountSource } {
  const extractedText = String(input.extractedText ?? "").trim();
  const hasPcsLabel = /\bpcs?\b/i.test(String(input.sourceLabel ?? ""));
  const parsedExtractedText = /\b\d{1,3}\s*\+\s*$/.test(extractedText)
    ? null
    : parsePieceCountText(extractedText);
  const extractedPieceCount = parsedExtractedText ?? (hasPcsLabel ? normalizePieceCount(input.extractedValue) : null);
  if (extractedPieceCount !== null) {
    return {
      pieceCount: extractedPieceCount,
      source: hasPcsLabel ? "LABELED_PCS" : "AI_EXTRACTED",
    };
  }

  const titlePieceCount = parsePieceCountFromProductTitle(input.productTitle);
  if (titlePieceCount !== null) return { pieceCount: titlePieceCount, source: "TITLE_SIZE_PACK" };

  return { pieceCount: null, source: "UNTRUSTED" };
}

export function normalizePieceCountFromCandidates(value: unknown, ...textCandidates: Array<string | null | undefined>) {
  const valueText = typeof value === "string" ? value : null;
  return normalizePieceCount(value) ?? [valueText, ...textCandidates].map(parsePieceCountText).find((item) => item !== null) ?? null;
}

export function normalizePieceCountFromEvidence(value: unknown, pieceCountText?: string | null, ...textCandidates: Array<string | null | undefined>) {
  const evidenceText = typeof pieceCountText === "string" ? pieceCountText.trim() : "";
  if (evidenceText) {
    if (/\b\d{1,3}\s*\+\s*$/.test(evidenceText)) return null;
    const parsedEvidence = parsePieceCountText(evidenceText);
    if (parsedEvidence !== null) return parsedEvidence;
  }
  return normalizePieceCountFromCandidates(value, ...textCandidates);
}
