import type { Locale } from "@/lib/i18n/config";

type BrandSkuRow = {
  brand?: string | null;
  product?: string | null;
  sku?: string | null;
};

function isAllUpperCase(value: string) {
  return value === value.toUpperCase() && value !== value.toLowerCase();
}

function shouldReplaceBrandLabel(current: string, next: string) {
  return isAllUpperCase(current) && !isAllUpperCase(next);
}

export function summarizeBrandSkuCounts(rows: BrandSkuRow[], locale: Locale = "en") {
  const brandSkuMap = new Map<string, { label: string; skus: Set<string> }>();

  for (const row of rows) {
    const brand = String(row.brand ?? "").trim();
    const sku = String(row.product ?? row.sku ?? "").trim();
    if (!brand || !sku) continue;

    const brandKey = brand.toLowerCase();
    if (!brandSkuMap.has(brandKey)) {
      brandSkuMap.set(brandKey, { label: brand, skus: new Set<string>() });
    }

    const entry = brandSkuMap.get(brandKey);
    if (!entry) continue;
    if (shouldReplaceBrandLabel(entry.label, brand)) {
      entry.label = brand;
    }
    entry.skus.add(sku);
  }

  if (brandSkuMap.size === 0) return null;

  return Array.from(brandSkuMap.values())
    .map((entry) => (locale === "zh" ? `${entry.label} ${entry.skus.size}个SKU` : `${entry.label} ${entry.skus.size} SKU`))
    .join(locale === "zh" ? "，" : ", ");
}
