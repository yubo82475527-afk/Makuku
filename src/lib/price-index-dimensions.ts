import type { WeeklyPriceCoefficientNodeLevel } from "./types";

export const PRICE_INDEX_DIMENSION_STORAGE_KEY = "makuku:price-index:dimension-order:v1";

export const PRICE_INDEX_DIMENSIONS = [
  "organization",
  "province",
  "city",
  "district",
  "size",
  "sku",
] as const satisfies readonly WeeklyPriceCoefficientNodeLevel[];

export type PriceIndexDimension = (typeof PRICE_INDEX_DIMENSIONS)[number];

export const DEFAULT_PRICE_INDEX_DIMENSIONS: PriceIndexDimension[] = ["organization"];

export function normalizePriceIndexDimensions(input: unknown): PriceIndexDimension[] {
  const values = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(",")
      : [];
  const allowed = new Set<string>(PRICE_INDEX_DIMENSIONS);
  const seen = new Set<string>();
  const optional = values
    .map((value) => String(value).trim())
    .filter((value): value is PriceIndexDimension => allowed.has(value) && value !== "organization")
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  return ["organization", ...optional];
}
