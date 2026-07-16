import type {
  MatchNormalizationContext,
  MatchRuleSet,
  NormalizedMatchInput,
  NormalizedMatchMaster,
  ProductMatchEntityType,
  ProductMatchEvidence,
  ProductMatchMaster,
  ProductShape,
  SkuSignature,
} from "./product-match-engine.ts";
import { buildEvidenceSkuSignature, parseSkuSignatureFromText } from "./sku-signature.ts";
import type { ProductMatchNormalizationField, ProductMatchNormalizedValue } from "./product-match-normalizations.ts";

export const PRODUCT_MATCH_RULE_VERSION = "sku-match-v2";

const seriesAliases = new Map<string, string>([
  ["drycare", "DRY CARE"],
  ["procare", "PRO CARE"],
  ["comfortfit", "COMFORT FIT"],
  ["comfit", "COMFORT FIT"],
  ["cf", "COMFORT FIT"],
  ["skinhealth", "SKIN HEALTH"],
  ["sh", "SKIN HEALTH"],
  ["slimcare", "SLIM CARE"],
  ["slim", "SLIM"],
  ["mediumflow", "MEDIUM FLOW"],
  ["heavyflow", "HEAVY FLOW"],
  ["royalsoft", "ROYAL SOFT"],
]);

const brandAliases = new Map<string, string>([
  ["mamypoko", "MAMY POKO"],
  ["swety", "SWEETY"],
]);

const brandCategoryTokens = new Set(["PANTS", "PANT", "CELANA", "TAPE", "DIAPER", "DIAPERS", "POPOK"]);

const sizeAliases = new Map<string, string>([
  ["MEDIUM", "M"],
  ["LARGE", "L"],
  ["EXTRA LARGE", "XL"],
  ["3XL", "XXXL"],
  ["NB S", "NB-S"],
  ["NB NB S", "NB"],
]);

function cleanTokens(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function compact(value: unknown) {
  return cleanTokens(value).replace(/\s+/g, "").toLowerCase();
}

function nullable(value: string) {
  return value || null;
}

export function normalizeSeriesV2(value: unknown) {
  const tokenKey = compact(value);
  return seriesAliases.get(tokenKey) ?? nullable(cleanTokens(value));
}

export function normalizeBrandV2(value: unknown) {
  const tokenKey = compact(value);
  const exact = brandAliases.get(tokenKey);
  if (exact) return exact;

  const tokens = cleanTokens(value).split(" ").filter(Boolean);
  for (const [, standard] of [...brandAliases.entries()].sort((left, right) => right[0].length - left[0].length)) {
    const aliasTokens = cleanTokens(standard).split(" ");
    const startsWithAlias = aliasTokens.every((token, index) => tokens[index] === token);
    const suffixTokens = tokens.slice(aliasTokens.length);
    if (startsWithAlias && suffixTokens.length > 0 && suffixTokens.every((token) => brandCategoryTokens.has(token))) {
      return standard;
    }
  }

  return nullable(cleanTokens(value));
}

export function normalizeSizeV2(value: unknown) {
  const cleaned = cleanTokens(value);
  if (!cleaned) return null;
  return sizeAliases.get(cleaned) ?? cleaned.replace(/^SIZE\s+/, "");
}

export function normalizeShapeV2(value: unknown): ProductShape {
  const cleaned = cleanTokens(value);
  if (/\b(?:PANTS?|CELANA)\b/.test(cleaned)) return "PANTS";
  if (/\b(?:TAPE|POPOK PEREKAT)\b/.test(cleaned)) return "TAPE";
  return null;
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function extractSeries(text: string) {
  const compactText = compact(text);
  for (const [alias, standard] of seriesAliases) {
    if (alias.length > 2 && compactText.includes(alias)) return standard;
  }
  const tokens = cleanTokens(text);
  if (/\bCF\b/.test(tokens)) return "COMFORT FIT";
  if (/\bSH\b/.test(tokens)) return "SKIN HEALTH";
  return null;
}

function extractSize(text: string) {
  const cleaned = cleanTokens(text);
  const wordAlias = cleaned.match(/\b(EXTRA LARGE|MEDIUM|LARGE|3XL|NB S)\b/);
  if (wordAlias) return normalizeSizeV2(wordAlias[1]);
  const match = cleaned.match(/\b(NB-S|NB|XXXXL|XXXL|XXL|XL|L|M|S)(?:\s*\d{1,3})?\b/);
  return match ? normalizeSizeV2(match[1]) : null;
}

function extractRowAnchorSize(value: unknown) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return null;
  for (const part of raw.split(/[|/]/).map((item) => item.trim())) {
    if (/^(EXTRA LARGE|MEDIUM|LARGE|3XL|NB[ -]?S|NB|XXXXL|XXXL|XXL|XL|L|M|S)$/.test(part)) {
      return normalizeSizeV2(part);
    }
  }
  return null;
}

function extractVersion(text: string) {
  const rawNumericVersion = String(text ?? "").match(/\b(\d+\.\d+)\b/);
  if (rawNumericVersion) return rawNumericVersion[1];
  const cleaned = cleanTokens(text);
  if (/\bLUXURY\b/.test(cleaned) && /\bSILKY\b/.test(cleaned)) return "LUXURY SILKY";
  if (/\bSLIM\b/.test(cleaned) && !/\bSILKY\b/.test(cleaned)) return "REGULAR";
  if (/\b(?:BOY|BOYS)\b/.test(cleaned)) return "BOY";
  if (/\b(?:GIRL|GIRLS)\b/.test(cleaned)) return "GIRL";
  if (/\bCHARACTER\b/.test(cleaned)) return "CHARACTER";
  const match = cleaned.match(/\b(\d+(?:\.\d+)?)\s*(?:VERSION|V)?\b/);
  return match && text.toLowerCase().includes("version") ? match[1] : null;
}

function normalizedSignature(signature: SkuSignature | null, raw: Record<string, unknown>): SkuSignature {
  const text = [raw.productFamilyText, raw.sectionTitle, raw.sku, raw.name, raw.title].filter(Boolean).join(" ");
  const textSeries = extractSeries(text);
  return {
    brand: normalizeBrandV2(signature?.brand ?? raw.brand),
    series: extractSeries(String(signature?.series ?? "")) ?? textSeries ?? normalizeSeriesV2(signature?.series),
    packageLevel: nullable(cleanTokens(signature?.packageLevel ?? raw.packageLevel)),
    shape: normalizeShapeV2(signature?.shape ?? raw.shape ?? text),
    size: normalizeSizeV2(signature?.size) ?? extractSize(text) ?? extractRowAnchorSize(raw.rowAnchor),
    pieceCount: positiveInteger(signature?.pieceCount ?? raw.pieceCount),
    version: nullable(cleanTokens(signature?.version)) ?? extractVersion(text),
  };
}

function resolveEvidenceEntityType(brand: string | null, requested: ProductMatchEntityType | null, context: MatchNormalizationContext) {
  if (requested) return requested;
  if (!brand) return null;
  const entityTypes = context.brandEntityTypes.get(brand);
  return entityTypes?.size === 1 ? Array.from(entityTypes)[0] : null;
}

function normalizeProduct(product: ProductMatchMaster): NormalizedMatchMaster {
  const legacySignature = normalizedSignature(product.signature, product.raw);
  const textSignature = parseSkuSignatureFromText([
    product.raw.name,
    product.raw.title,
    product.raw.shape,
    product.raw.packageLevel,
  ].filter(Boolean).join(" "));
  return {
    ...product,
    code: cleanTokens(product.code),
    signature: {
      brand: legacySignature.brand ?? textSignature.brand,
      series: legacySignature.series ?? textSignature.series,
      packageLevel: legacySignature.packageLevel ?? textSignature.packageLevel,
      shape: legacySignature.shape ?? textSignature.shape,
      size: legacySignature.size ?? textSignature.size,
      pieceCount: legacySignature.pieceCount ?? textSignature.pieceCount,
      version: legacySignature.version ?? textSignature.variant,
    },
  };
}

function normalizeEvidence(evidence: ProductMatchEvidence, context: MatchNormalizationContext): NormalizedMatchInput {
  const legacySignature = normalizedSignature(evidence.signature, evidence.raw);
  const evidenceSignature = buildEvidenceSkuSignature({
    brand: evidence.signature?.brand ?? evidence.raw.brand,
    productFamilyText: evidence.raw.productFamilyText,
    sectionTitle: evidence.raw.sectionTitle,
    sku: evidence.raw.sku,
    rowAnchor: evidence.raw.rowAnchor,
    pieceCount: evidence.signature?.pieceCount ?? evidence.raw.pieceCount,
  });
  const conflictFields = new Set(evidenceSignature.conflicts.map((conflict) => conflict.field));
  const signature: SkuSignature = {
    brand: conflictFields.has("brand") ? null : evidenceSignature.signature.brand ?? legacySignature.brand,
    series: conflictFields.has("series") ? null : evidenceSignature.signature.series ?? legacySignature.series,
    packageLevel: conflictFields.has("packageLevel") ? null : evidenceSignature.signature.packageLevel ?? legacySignature.packageLevel,
    shape: conflictFields.has("shape") ? null : evidenceSignature.signature.shape ?? legacySignature.shape,
    size: conflictFields.has("size") ? null : evidenceSignature.signature.size ?? legacySignature.size,
    pieceCount: conflictFields.has("pieceCount") ? null : evidenceSignature.signature.pieceCount ?? legacySignature.pieceCount,
    version: conflictFields.has("variant") ? null : evidenceSignature.signature.variant ?? legacySignature.version,
  };
  const rawBrand = evidence.signature?.brand ?? evidence.raw.brand;
  if (signature.brand && !context.brandEntityTypes.has(signature.brand)) {
    const brandAsSeries = normalizeSeriesV2(rawBrand);
    if (brandAsSeries && context.seriesOwners.has(brandAsSeries)) {
      signature.series = signature.series ?? brandAsSeries;
      signature.brand = null;
    }
  }
  if (signature.series && (!signature.brand || !context.brandEntityTypes.has(signature.brand))) {
    const owners = context.seriesOwners.get(signature.series);
    if (owners?.size === 1) signature.brand = Array.from(owners)[0];
  }
  return {
    ...evidence,
    code: cleanTokens(evidence.code),
    entityType: resolveEvidenceEntityType(signature.brand, evidence.entityType, context),
    signature,
    conflicts: evidenceSignature.conflicts,
  };
}

function coreKey(signature: SkuSignature) {
  if (!signature.brand || !signature.series || !signature.size || !signature.pieceCount) return null;
  return [signature.brand, signature.series, signature.size, signature.pieceCount].join("|");
}

function optionalCompatible(left: string | null, right: string | null) {
  return !left || !right || left === right;
}

function isCompatible(evidence: NormalizedMatchInput, product: NormalizedMatchMaster) {
  return optionalCompatible(evidence.signature.packageLevel, product.signature.packageLevel)
    && optionalCompatible(evidence.signature.shape, product.signature.shape)
    && optionalCompatible(evidence.signature.version, product.signature.version);
}

function isFullSignature(evidence: NormalizedMatchInput, product: NormalizedMatchMaster) {
  const fields: Array<keyof SkuSignature> = ["brand", "series", "packageLevel", "shape", "size", "pieceCount", "version"];
  return fields.every((field) => evidence.signature[field] !== null && evidence.signature[field] === product.signature[field]);
}

function numericVersionRank(value: string | null) {
  if (!value) return 1;
  return /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
}

function selectPreferredCandidate(evidence: NormalizedMatchInput, products: NormalizedMatchMaster[]) {
  if (evidence.signature.version) return null;
  const ranked = products.map((product) => ({
    product,
    rank: numericVersionRank(product.signature.version),
  }));
  if (ranked.some((item) => item.rank === null)) return null;
  const maxRank = Math.max(...ranked.map((item) => item.rank ?? 0));
  const winners = ranked.filter((item) => item.rank === maxRank);
  return winners.length === 1 ? winners[0].product : null;
}

type ProductMatchNormalizations = {
  normalizeExact(field: ProductMatchNormalizationField, rawValue: unknown, brand?: string | null): ProductMatchNormalizedValue;
  findInText(field: ProductMatchNormalizationField, rawValue: unknown, brand?: string | null): ProductMatchNormalizedValue;
};

function firstNormalizedValue(
  normalizations: ProductMatchNormalizations,
  field: ProductMatchNormalizationField,
  values: unknown[],
  brand?: string | null,
) {
  for (const value of values) {
    const exact = normalizations.normalizeExact(field, value, brand);
    if (exact.value) return exact.value;
  }
  for (const value of values) {
    const found = normalizations.findInText(field, value, brand);
    if (found.value) return found.value;
  }
  return null;
}

function normalizedPieceCount(normalizations: ProductMatchNormalizations, value: unknown, brand?: string | null) {
  const normalized = normalizations.normalizeExact("piece_count", value, brand).value;
  const number = Number(normalized ?? value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function createProductMatchRulesV2(normalizations: ProductMatchNormalizations): MatchRuleSet {
  function normalizeProductWithContext(product: ProductMatchMaster): NormalizedMatchMaster {
    const legacy = normalizedSignature(product.signature, product.raw);
    const text = [product.raw.name, product.raw.title, product.raw.shape, product.raw.packageLevel].filter(Boolean).join(" ");
    const brand = firstNormalizedValue(normalizations, "brand", [product.signature?.brand, product.raw.brand, text]);
    return {
      ...product,
      code: cleanTokens(product.code),
      signature: {
        brand,
        series: firstNormalizedValue(normalizations, "series", [product.signature?.series, product.raw.name, product.raw.title, text], brand),
        packageLevel: legacy.packageLevel,
        shape: legacy.shape,
        size: firstNormalizedValue(normalizations, "size", [product.signature?.size, product.raw.name, product.raw.title, text], brand),
        pieceCount: normalizedPieceCount(normalizations, product.signature?.pieceCount ?? product.raw.pieceCount, brand),
        version: legacy.version,
      },
    };
  }

  function normalizeEvidenceWithContext(evidence: ProductMatchEvidence, context: MatchNormalizationContext): NormalizedMatchInput {
    const fallback = normalizeEvidence(evidence, context);
    const raw = evidence.raw;
    const texts = [raw.productFamilyText, raw.sectionTitle, raw.sku, raw.rowAnchor];
    const brand = firstNormalizedValue(normalizations, "brand", [evidence.signature?.brand, raw.brand, ...texts]);
    const series = firstNormalizedValue(normalizations, "series", [evidence.signature?.series, ...texts], brand);
    const size = firstNormalizedValue(normalizations, "size", [evidence.signature?.size, raw.rowAnchor, ...texts], brand);
    const pieceCount = normalizedPieceCount(normalizations, evidence.signature?.pieceCount ?? raw.pieceCount, brand);
    const entityType = resolveEvidenceEntityType(brand, evidence.entityType, context);
    return {
      ...fallback,
      entityType,
      signature: {
        ...fallback.signature,
        brand,
        series,
        size,
        pieceCount,
      },
    };
  }

  function selectPreferredWithContext(evidence: NormalizedMatchInput, products: NormalizedMatchMaster[]) {
    let candidates = products;
    for (const field of ["shape", "packageLevel", "version"] as const) {
      const value = evidence.signature[field];
      if (!value) continue;
      const matching = candidates.filter((product) => product.signature[field] === value);
      if (matching.length > 0) candidates = matching;
      if (candidates.length === 1) return candidates[0];
    }
    return selectPreferredCandidate(evidence, candidates);
  }

  return {
    version: "sku-match-v3",
    normalizeProduct: normalizeProductWithContext,
    normalizeEvidence: normalizeEvidenceWithContext,
    coreKey,
    isCompatible: () => true,
    isFullSignature,
    selectPreferredCandidate: selectPreferredWithContext,
  };
}

export const productMatchRulesV2: MatchRuleSet = {
  version: PRODUCT_MATCH_RULE_VERSION,
  normalizeProduct,
  normalizeEvidence,
  coreKey,
  isCompatible,
  isFullSignature,
  selectPreferredCandidate,
};
