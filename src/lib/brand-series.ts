import type { Brand, PriceSnapshot } from "@/lib/types";

export type BrandSeriesSplit = {
  brandName: string;
  productSeries: string | null;
};

export function splitBrandSeries(rawBrand: string, brands: Pick<Brand, "name">[]): BrandSeriesSplit {
  const brandText = cleanText(rawBrand);
  if (!brandText) return { brandName: "", productSeries: null };

  const normalizedBrandText = normalizeBrandKey(brandText);
  const parentBrand = brands
    .map((brand) => cleanText(brand.name))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .find((brand) => {
      const normalizedParent = normalizeBrandKey(brand);
      return normalizedBrandText === normalizedParent || normalizedBrandText.startsWith(`${normalizedParent} `);
    });

  if (parentBrand) {
    const normalizedParent = normalizeBrandKey(parentBrand);
    const series = normalizedBrandText === normalizedParent
      ? null
      : titleCaseWords(brandText.slice(parentBrand.length).trim());
    return { brandName: parentBrand, productSeries: series };
  }

  const [firstWord, ...rest] = brandText.split(/\s+/);
  return {
    brandName: firstWord ?? brandText,
    productSeries: rest.length > 0 ? titleCaseWords(rest.join(" ")) : null,
  };
}

export function brandSeriesLabel(brandName: string | null | undefined, productSeries: string | null | undefined) {
  return [brandName, productSeries]
    .map((value) => cleanText(value).toUpperCase())
    .filter(Boolean)
    .join(" ");
}

export function priceBrandSeriesLabel(snapshot: PriceSnapshot) {
  if ((snapshot.material_sku_code || snapshot.sku_master_id) && !snapshot.competitor_product_id) {
    const material = snapshot.material_master ?? snapshot.sku_master?.material_master;
    return brandSeriesLabel(
      material?.brand ?? "Makuku",
      material?.sub_brand ?? makukuSeriesName(snapshot.sku_master?.makuku_sku_name),
    );
  }
  return brandSeriesLabel(snapshot.competitor_products?.brands?.name, snapshot.competitor_products?.product_series);
}

function makukuSeriesName(value: string | null | undefined) {
  const text = normalizeBrandKey(value);
  if (text.includes("comfort fit") || text.includes("comfort")) return "Comfort Fit";
  if (text.includes("dry care")) return "Dry Care";
  if (text.includes("pro care")) return "Pro Care";
  if (text.includes("slim care") || text.includes("slim")) return "Slim";
  if (text.includes("value")) return "Value";
  if (text.includes("air")) return "Air";
  if (text.includes("tape")) return "Tape";
  return null;
}

function titleCaseWords(value: string) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\b[a-z0-9]/g, (char) => char.toUpperCase());
}

function cleanText(value: string | null | undefined) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeBrandKey(value: string | null | undefined) {
  return cleanText(value).toLowerCase();
}
