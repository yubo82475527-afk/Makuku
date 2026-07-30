import type { CompetitorProduct, MaterialMaster } from "@/lib/types";

export function seriesKey(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function materialGroup2Options(materials: MaterialMaster[]) {
  return Array.from(new Set(materials.map((material) => cleanText(material.material_group2)).filter(Boolean) as string[])).sort((left, right) => left.localeCompare(right));
}

/** @deprecated Use materialGroup2Options */
export function makukuSeriesOptions(materials: MaterialMaster[]) {
  return materialGroup2Options(materials);
}

export function normalizeMaterialGroup2Targets(values: string[] | string | null | undefined) {
  const list = Array.isArray(values) ? values : String(values ?? "").split(",");
  return Array.from(new Set(list.map((value) => cleanText(value)).filter(Boolean) as string[]));
}

export function findMatchingMaterialForSeries(
  product: Pick<CompetitorProduct, "size" | "piece_count" | "normalized_name" | "raw_title" | "pack_type">,
  targetMaterialGroup2s: string[] | string,
  materials: MaterialMaster[],
) {
  const targetKeys = new Set(normalizeMaterialGroup2Targets(targetMaterialGroup2s).map((value) => seriesKey(value)));
  if (!targetKeys.size) {
    return { status: "not_found" as const, material: null };
  }

  const candidatePieceCounts = productPieceCountCandidates(product);
  const sameSeriesSizeMaterials = materials.filter((material) => {
    if (!targetKeys.has(seriesKey(material.material_group2))) return false;
    if (seriesKey(material.sub_type) !== seriesKey(product.size)) return false;
    const productShape = productShapeKey(product.pack_type, product.normalized_name, product.raw_title);
    const materialShape = materialShapeKey(material.type, material.sub_category, material.tenant_sku_name);
    if (productShape && materialShape && productShape !== materialShape) return false;
    return true;
  });
  if (sameSeriesSizeMaterials.length === 0 || candidatePieceCounts.length === 0) {
    return { status: "not_found" as const, material: null };
  }

  const ranked = sameSeriesSizeMaterials
    .map((material) => ({
      material,
      distance: Math.min(...candidatePieceCounts.map((pieceCount) => Math.abs(Number(material.pack_count) - pieceCount))),
    }))
    .sort((left, right) => left.distance - right.distance || Number(right.material.pack_count) - Number(left.material.pack_count));
  return ranked[0]?.material ? { status: "matched" as const, material: ranked[0].material } : { status: "not_found" as const, material: null };
}

function cleanText(value: string | null | undefined) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || null;
}

function productPieceCountCandidates(product: Pick<CompetitorProduct, "size" | "piece_count" | "normalized_name" | "raw_title">) {
  const parsedCandidates = new Set<number>();

  const size = String(product.size ?? "").trim();
  if (size) {
    const escapedSize = size.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const text = `${product.normalized_name ?? ""} ${product.raw_title ?? ""}`;
    const matches = text.matchAll(new RegExp(`\\b${escapedSize}\\s*(\\d+)(?:\\s*\\+\\s*(\\d+))?\\b`, "gi"));
    for (const match of matches) {
      const base = Number(match[1]);
      const bonus = Number(match[2] ?? 0);
      if (base > 0) parsedCandidates.add(base + (bonus > 0 ? bonus : 0));
    }
  }

  if (parsedCandidates.size > 0) return Array.from(parsedCandidates);

  const candidates = new Set<number>();
  if (Number(product.piece_count) > 0) candidates.add(Number(product.piece_count));
  return Array.from(candidates);
}

export function productShapeKey(packType: string | null | undefined, ...values: Array<string | null | undefined>) {
  const text = `${packType ?? ""} ${values.join(" ")}`.toLowerCase();
  if (text.includes("tape") || text.includes("粘贴")) return "tape";
  if (text.includes("pants") || text.includes("pant") || text.includes("裤")) return "pants";
  return null;
}

export function materialShapeKey(...values: Array<string | null | undefined>) {
  return productShapeKey(null, ...values);
}
