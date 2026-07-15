import type { CompetitorProduct, MaterialMaster, PackType, PriceSnapshot, Segment } from "@/lib/types";

type SnapshotWithBenchmark = Pick<PriceSnapshot, "sku_master"> & {
  material_master?: MaterialMaster | null;
  competitor_products?: Pick<
    CompetitorProduct,
    "segment" | "size" | "raw_title" | "normalized_name" | "pack_type"
  > | null;
};

export function priceSnapshotBenchmarkSku(snapshot: SnapshotWithBenchmark) {
  return snapshot.sku_master ?? null;
}

export function priceSnapshotBenchmarkMaterial(snapshot: SnapshotWithBenchmark) {
  return snapshot.material_master
    ?? snapshot.sku_master?.material_master
    ?? priceSnapshotBenchmarkSku(snapshot)?.material_master
    ?? null;
}

export function priceSnapshotBusinessSegment(snapshot: SnapshotWithBenchmark): Segment {
  return priceSnapshotBenchmarkSku(snapshot)?.segment
    ?? snapshot.competitor_products?.segment
    ?? "unknown";
}

export function priceSnapshotBusinessSize(snapshot: SnapshotWithBenchmark) {
  const product = snapshot.competitor_products;
  return priceSnapshotBenchmarkMaterial(snapshot)?.sub_type
    ?? priceSnapshotBenchmarkSku(snapshot)?.size
    ?? product?.size
    ?? inferProductSize(product?.normalized_name || product?.raw_title)
    ?? "Unknown";
}

export function priceSnapshotBusinessLine(snapshot: SnapshotWithBenchmark) {
  const material = priceSnapshotBenchmarkMaterial(snapshot);
  if (material) return materialPackTypeLabel(material);

  const benchmarkSku = priceSnapshotBenchmarkSku(snapshot);
  if (benchmarkSku) return packTypeLabel(benchmarkSku.pack_type);

  const product = snapshot.competitor_products;
  if (!product) return "Unknown";
  return product.pack_type === "unknown"
    ? inferProductLine(product.normalized_name || product.raw_title)
    : packTypeLabel(product.pack_type);
}

export function priceSnapshotMakukuMaterialCode(snapshot: SnapshotWithBenchmark) {
  return cleanDisplayText(priceSnapshotBenchmarkMaterial(snapshot)?.tenant_sku_code)
    ?? cleanDisplayText(priceSnapshotBenchmarkSku(snapshot)?.material_sku_code)
    ?? "-";
}

function materialPackTypeLabel(material: MaterialMaster) {
  const value = `${material.type ?? ""} ${material.sub_category ?? ""}`.toLowerCase();
  if (value.includes("pants")) return "Pants";
  if (value.includes("tape") || value.includes("diaper")) return "Tape";
  return "Unknown";
}

function packTypeLabel(value: PackType | string) {
  if (value === "pants") return "Pants";
  if (value === "tape") return "Tape";
  return "Unknown";
}

function inferProductLine(value: string | null | undefined) {
  const text = (value ?? "").toLowerCase();
  if (text.includes("tape")) return "Tape";
  if (text.includes("pants") || text.includes("pant")) return "Pants";
  return "Pants";
}

function inferProductSize(value: string | null | undefined) {
  const text = (value ?? "").toUpperCase();
  const match = text.match(/\b(NB\/NB-S|XXXXL|XXXL|XXL|XL|NB|L|M|S)\b/);
  return match?.[1] ?? null;
}

function cleanDisplayText(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text && text !== "-" ? text : null;
}
