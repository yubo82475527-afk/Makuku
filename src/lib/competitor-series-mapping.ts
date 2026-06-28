import type { CompetitorProduct, MaterialMaster } from "@/lib/types";

export function seriesKey(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function makukuSeriesOptions(materials: MaterialMaster[]) {
  return Array.from(new Set(materials.map((material) => cleanText(material.sub_brand)).filter(Boolean) as string[])).sort((left, right) => left.localeCompare(right));
}

export function findMatchingMaterialForSeries(product: Pick<CompetitorProduct, "size" | "piece_count" | "normalized_name" | "raw_title">, targetMakukuSeries: string, materials: MaterialMaster[]) {
  const candidatePieceCounts = productPieceCountCandidates(product);
  const sameSeriesSizeMaterials = materials.filter((material) => {
    if (seriesKey(material.sub_brand) !== seriesKey(targetMakukuSeries)) return false;
    if (seriesKey(material.sub_type) !== seriesKey(product.size)) return false;
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
