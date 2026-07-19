export type SkuVariant = "REGULAR" | "LUXURY SILKY" | "BOY" | "GIRL" | "ROYAL SOFT" | `${number}.${number}` | null;
export type SkuShape = "PANTS" | "TAPE" | null;

export type NormalizedSkuSignature = {
  brand: string | null;
  series: string | null;
  shape: SkuShape;
  size: string | null;
  pieceCount: number | null;
  variant: SkuVariant;
  packageLevel: string | null;
};

export type SkuEvidenceInput = {
  brand?: unknown;
  productFamilyText?: unknown;
  sectionTitle?: unknown;
  sku?: unknown;
  rowAnchor?: unknown;
  pieceCount?: unknown;
};

export type SkuSignatureConflict = {
  field: keyof NormalizedSkuSignature;
  values: string[];
};

export function cleanSkuText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9.]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function compactSkuText(value: unknown) {
  return cleanSkuText(value).replace(/[^A-Z0-9]+/g, "");
}

export function normalizeSkuSize(value: unknown) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (/^NB\s*\/\s*NB[-\s]?S$/.test(raw)) return "NB";

  const text = cleanSkuText(value);
  if (!text) return null;
  if (text === "MEDIUM") return "M";
  if (text === "LARGE") return "L";
  if (text === "EXTRA LARGE") return "XL";
  if (text === "3XL") return "XXXL";
  if (text === "NB-S" || text === "NB S" || text === "NB NB S") return "NB";
  return text.replace(/^SIZE\s+/, "");
}

export function normalizeRowAnchorSkuSize(value: unknown) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return null;
  if (/^NB\s*\/\s*NB[-\s]?S$/.test(raw)) return "NB";
  for (const part of raw.split(/[|/]/).map((item) => item.trim())) {
    if (/^(EXTRA LARGE|MEDIUM|LARGE|3XL|NB[ -]?S|NB|XXXXL|XXXL|XXL|XL|L|M|S)$/.test(part)) {
      return normalizeSkuSize(part);
    }
  }
  return null;
}

function parseBrand(text: string) {
  if (/\bMAKUKU\b/.test(text)) return "MAKUKU";
  if (/\bMAMY\s*POKO\b/.test(text) || /\bMAMYPOKO\b/.test(text)) return "MAMY POKO";
  if (/\bSWETY\b/.test(text) || /\bSWEETY\b/.test(text)) return "SWEETY";
  if (/\bLIFREE\b/.test(text)) return "LIFREE";
  if (/\bCONFIDENCE\b/.test(text)) return "CONFIDENCE";
  if (/\bPARENTY\b/.test(text)) return "PARENTY";
  if (/\bLADIS\b/.test(text)) return "Ladis";
  if (/\bBABY\s*HAPPY\b/.test(text)) return "BABY HAPPY";
  return null;
}

function parseSeries(text: string) {
  const compact = compactSkuText(text);
  if (compact.includes("ORGANIC")) return "ORGANIC";
  if (compact.includes("PREMIUM")) return "ROYAL SOFT";
  if (compact.includes("ANTIBOCOR")) return "ANTI BOCOR";
  if (compact.includes("DAUNSIRIH")) return "DAUN SIRIH";
  if (compact.includes("CLASSICNIGHT")) return "CLASSIC NIGHT";
  if (compact.includes("CLASSICDAY") || compact.includes("CLASICDAY")) return "CLASSIC DAY";
  if (compact.includes("PROCARE")) return "PRO CARE";
  if (compact.includes("COMFORTFIT") || /\bCOMFIT\b/.test(text) || /\bCF\b/.test(text)) return "COMFORT FIT";
  if (compact.includes("DRYCARE")) return "DRY CARE";
  if (compact.includes("ROYALSOFT")) return "ROYAL SOFT";
  if (compact.includes("HEAVYFLOW")) return "Heavy Flow";
  if (compact.includes("MEDIUMFLOW")) return "Medium Flow";
  // Ladis 系列 - Dream 系列需要区分 Panties 和 Pads
  if (compact.includes("DREAMPADS")) return "Dream Pads";
  if (compact.includes("DREAMPANTIES") || (compact.includes("DREAM") && (compact.includes("PANTS") || compact.includes("CELANA") || compact.includes("MENSTRUATION")))) return "Dream Panties";
  if (compact.includes("PRINCESSLINER")) return "Princess Liner";
  if (compact.includes("PRINCESS")) return "Princess pads";
  if (compact.includes("MATERNITY")) return "Maternity";
  if (compact.includes("SLIM")) return "SLIM";
  if (compact.includes("SKINHEALTH") || /\bSH\b/.test(text)) return "SKIN HEALTH";
  if (compact.includes("SOFT")) return "Soft";
  return null;
}

function parseShape(text: string): SkuShape {
  if (/\b(?:PANTS?|CELANA)\b/.test(text)) return "PANTS";
  if (/\b(?:TAPE|PEREKAT|POPOK PEREKAT)\b/.test(text)) return "TAPE";
  return null;
}

function parseSize(text: string) {
  const wordAlias = text.match(/\b(EXTRA LARGE|MEDIUM|LARGE|3XL|NB S)\b/);
  if (wordAlias) return normalizeSkuSize(wordAlias[1]);
  const match = text.match(/\b(NB-S|NB|XXXXL|XXXL|XXL|XL|L|M|S)(?:\s*\d{1,3})?\b/);
  return match ? normalizeSkuSize(match[1]) : null;
}

function parsePieceCount(text: string) {
  const bonus = text.match(/\b(\d{1,3})\s*\+\s*(\d{1,3})\b/);
  if (bonus) return Number(bonus[1]) + Number(bonus[2]);
  const withSize = text.match(/\b(?:NB-S|NB|XXXXL|XXXL|XXL|XL|L|M|S)\s*(\d{1,3})\b/);
  if (withSize) return Number(withSize[1]);
  return null;
}

function parseVariant(raw: string, text: string): SkuVariant {
  const numericVersion = raw.match(/\b(\d+\.\d+)\b/)?.[1];
  if (numericVersion) return numericVersion as SkuVariant;
  if (/\b(?:BOY|BOYS)\b/.test(text)) return "BOY" as SkuVariant;
  if (/\b(?:GIRL|GIRLS)\b/.test(text)) return "GIRL" as SkuVariant;
  if (/\bROYAL\b/.test(text) && /\bSOFT\b/.test(text)) return "ROYAL SOFT" as SkuVariant;
  if (/\bLUXURY\b/.test(text) && /\bSILKY\b/.test(text)) return "LUXURY SILKY";
  if (/\bSLIM\b/.test(text) && !/\bSILKY\b/.test(text)) return "REGULAR";
  return null;
}

function parsePackageLevel(text: string) {
  if (/\bJUMBO\b/.test(text)) return "JUMBO";
  if (/\bREGULAR\b/.test(text)) return "REGULAR";
  return null;
}

export function parseSkuSignatureFromText(value: unknown): NormalizedSkuSignature {
  const raw = String(value ?? "");
  const text = cleanSkuText(raw);
  return {
    brand: parseBrand(text),
    series: parseSeries(text),
    shape: parseShape(text),
    size: parseSize(text),
    pieceCount: parsePieceCount(text),
    variant: parseVariant(raw, text),
    packageLevel: parsePackageLevel(text),
  };
}

function uniquePresentValues(values: Array<string | number | null | undefined>) {
  return Array.from(new Set(
    values
      .filter((value) => value !== null && value !== undefined && String(value).trim() !== "")
      .map((value) => String(value)),
  ));
}

function chooseConsistentString(
  field: keyof NormalizedSkuSignature,
  values: Array<string | null>,
  conflicts: SkuSignatureConflict[],
) {
  const unique = uniquePresentValues(values);
  if (unique.length > 1) {
    conflicts.push({ field, values: unique });
    return null;
  }
  return unique[0] ?? null;
}

function chooseConsistentNumber(
  field: keyof NormalizedSkuSignature,
  values: Array<number | null>,
  conflicts: SkuSignatureConflict[],
) {
  const unique = uniquePresentValues(values);
  if (unique.length > 1) {
    conflicts.push({ field, values: unique });
    return null;
  }
  return unique[0] ? Number(unique[0]) : null;
}

function normalizeEvidenceBrand(value: unknown, parsed: NormalizedSkuSignature[]) {
  const text = cleanSkuText(value);
  return parseBrand(text) ?? parsed.find((item) => item.brand)?.brand ?? null;
}

function normalizeEvidencePieceCount(value: unknown, parsed: NormalizedSkuSignature[]) {
  const number = Number(value);
  if (Number.isInteger(number) && number > 0) return number;
  return parsed.find((item) => item.pieceCount)?.pieceCount ?? null;
}

export function buildEvidenceSkuSignature(input: SkuEvidenceInput) {
  const parsed = [
    parseSkuSignatureFromText(input.productFamilyText),
    parseSkuSignatureFromText(input.sectionTitle),
    parseSkuSignatureFromText(input.sku),
  ];
  const conflicts: SkuSignatureConflict[] = [];
  const rowSize = normalizeRowAnchorSkuSize(input.rowAnchor);
  const explicitPieceCount = normalizeEvidencePieceCount(input.pieceCount, parsed);

  const signature: NormalizedSkuSignature = {
    brand: normalizeEvidenceBrand(input.brand, parsed),
    series: chooseConsistentString("series", parsed.map((item) => item.series), conflicts),
    shape: chooseConsistentString("shape", parsed.map((item) => item.shape), conflicts) as SkuShape,
    size: chooseConsistentString("size", [rowSize, ...parsed.map((item) => item.size)], conflicts),
    pieceCount: explicitPieceCount ?? chooseConsistentNumber("pieceCount", parsed.map((item) => item.pieceCount), conflicts),
    variant: chooseConsistentString("variant", parsed.map((item) => item.variant).filter((value) => value !== "REGULAR"), conflicts) as SkuVariant,
    packageLevel: chooseConsistentString("packageLevel", parsed.map((item) => item.packageLevel), conflicts),
  };

  return { signature, conflicts };
}
