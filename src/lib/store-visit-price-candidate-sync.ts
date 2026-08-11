import {
  buildAiPriceCandidateRows,
  insertAiPriceCandidateRows,
  type AiPriceCandidateSourceItem,
} from "@/lib/ai-price-candidates";
import type { ProductMatchContext } from "@/lib/ai-price-candidates";
import {
  buildSingleVariantProductTitle,
  extractSizePackVariantsForRowSplit,
  primarySizePackVariantFromTitle,
} from "@/lib/piece-count";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type { StoreVisitPriceImageAnalysis, StoreVisitPriceImageRow } from "@/lib/types";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceClient>;

type PriceImageRow = {
  id: string;
  visit_id: string;
  image_path: string | null;
  image_type: string | null;
  deleted_at?: string | null;
  replaced_by_image_id?: string | null;
  vision_result: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asPriceImageAnalysis(value: unknown): StoreVisitPriceImageAnalysis | null {
  if (!isRecord(value) || value.schema_version !== "store_visit_price_image_v1" || !Array.isArray(value.rows)) {
    return null;
  }
  return value as unknown as StoreVisitPriceImageAnalysis;
}

function hiddenPriceRowIndexes(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.h5_hidden_price_row_indexes)) return new Set<number>();
  return new Set(value.h5_hidden_price_row_indexes
    .map(Number)
    .filter((rowIndex) => Number.isInteger(rowIndex) && rowIndex >= 0));
}

function sourceItemFromPriceRow(
  image: PriceImageRow,
  row: StoreVisitPriceImageRow,
  sourceRowIndex: number,
  overrides?: {
    product?: string;
    productFamilyText?: string | null;
    rowAnchor?: string | null;
    piece_count?: number | null;
    raw_piece_count_text?: string | null;
  },
): AiPriceCandidateSourceItem {
  return {
    brand: row.brand ?? "Unknown",
    product: overrides?.product ?? row.sku,
    productFamilyText: overrides && "productFamilyText" in overrides ? overrides.productFamilyText : row.product_family_text,
    sectionTitle: row.section_title,
    rowAnchor: overrides?.rowAnchor ?? row.row_anchor,
    price: row.net_price_idr ? String(row.net_price_idr) : "",
    list_price: row.list_price_idr ? String(row.list_price_idr) : null,
    package_price: row.package_price_idr ? String(row.package_price_idr) : null,
    net_price: row.net_price_idr ? String(row.net_price_idr) : null,
    promo_type: row.promo_type,
    piece_count: overrides?.piece_count ?? row.piece_count,
    raw_piece_count_text: overrides?.raw_piece_count_text ?? row.piece_count_text,
    piece_count_source_label: row.piece_count_source_label,
    raw_package_price_text: row.package_price_text,
    raw_net_price_text: row.net_price_text,
    raw_price_per_piece_text: row.visible_price_per_piece_text,
    visible_price_per_piece_idr: row.visible_price_per_piece_idr,
    normal_package_price_confidence: row.normal_package_price_confidence,
    promo_package_price_confidence: row.promo_package_price_confidence,
    normal_per_piece_price_confidence: row.normal_per_piece_price_confidence,
    promo_per_piece_price_confidence: row.promo_per_piece_price_confidence,
    piece_count_confidence: row.piece_count_confidence,
    row_binding_confidence: row.row_binding_confidence,
    section_binding_confidence: row.section_binding_confidence,
    product_identity_confidence: row.product_identity_confidence,
    price_basis: row.price_basis,
    legacy_confidence_fallback: row.legacy_confidence_fallback,
    price_evidence_status: row.price_evidence_status,
    price_evidence_confidence: row.price_evidence_confidence,
    price_evidence_detail: row.price_evidence_detail,
    conflicts: row.conflicts,
    type: "SKU" as const,
    tag: "HERO",
    confidence: row.ai_confidence ?? null,
    source: "key_sku" as const,
    sourceImageId: image.id,
    sourceImagePath: image.image_path,
    sourceRowIndex,
  };
}

function dedupePriceSourceItems(items: AiPriceCandidateSourceItem[]): AiPriceCandidateSourceItem[] {
  const seen = new Set<string>();
  const result: AiPriceCandidateSourceItem[] = [];
  for (const item of items) {
    const fromTitle = primarySizePackVariantFromTitle(item.product);
    const anchorSize = String(item.rowAnchor ?? "").split("|")[0]?.trim().toUpperCase() || "";
    const size = fromTitle?.size || anchorSize;
    const pieceCount = item.piece_count ?? fromTitle?.pieceCount ?? "";
    const key = `${String(item.brand ?? "").trim().toUpperCase()}|${size}|${pieceCount}|${item.net_price ?? item.price ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function sourceItemsFromImage(image: PriceImageRow): AiPriceCandidateSourceItem[] {
  const result = asPriceImageAnalysis(image.vision_result);
  if (!result) return [];
  const hiddenRowIndexes = hiddenPriceRowIndexes(image.vision_result);
  const items: AiPriceCandidateSourceItem[] = [];

  for (const [rowIndex, row] of result.rows.entries()) {
    if (hiddenRowIndexes.has(rowIndex)) continue;
    const variants = extractSizePackVariantsForRowSplit(row.sku);
    if (variants.length < 2) {
      items.push(sourceItemFromPriceRow(image, row, rowIndex));
      continue;
    }

    for (const [variantIndex, variant] of variants.entries()) {
      // Keep the first variant on the original source_row_index; extras use a high band to avoid collisions.
      const sourceRowIndex = variantIndex === 0 ? rowIndex : 1000 + rowIndex * 10 + variantIndex;
      items.push(sourceItemFromPriceRow(image, row, sourceRowIndex, {
        product: buildSingleVariantProductTitle(row.sku, variant),
        productFamilyText: null,
        rowAnchor: `${variant.size}|${variant.pieceCount}`,
        piece_count: variant.pieceCount,
        raw_piece_count_text: variant.pieceCountText,
      }));
    }
  }

  return dedupePriceSourceItems(items);
}

export function sourceItemsFromStoredPriceImages(images: PriceImageRow[]) {
  return images.flatMap(sourceItemsFromImage);
}

function rowKey(imageId: string | null | undefined, rowIndex: number | null | undefined) {
  return `${imageId ?? ""}:${rowIndex ?? ""}`;
}

const inactiveLifecycleStatuses = new Set(["deleted", "replaced", "reanalyzed"]);

export async function syncStoreVisitPriceCandidatesFromImages(input: {
  visitId: string;
  imageIds?: string[];
  matchContext?: ProductMatchContext;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const imageIds = Array.from(new Set((input.imageIds ?? []).map((value) => value.trim()).filter(Boolean)));

  let imageQuery = supabase
    .from("offline_visit_images")
    .select("id,visit_id,image_path,image_type,deleted_at,replaced_by_image_id,vision_result")
    .eq("visit_id", input.visitId)
    .in("image_type", ["own_shelf", "competitor_shelf"])
    .is("deleted_at", null)
    .is("replaced_by_image_id", null);

  if (imageIds.length > 0) {
    imageQuery = imageQuery.in("id", imageIds);
  }

  const { data: images, error: imageError } = await imageQuery;
  if (imageError) throw new Error(imageError.message);

  const sourceItems = sourceItemsFromStoredPriceImages((images ?? []) as PriceImageRow[]);
  if (sourceItems.length === 0) {
    return { inserted_count: 0, inserted_candidate_ids: [], skipped_existing_count: 0, eligible_row_count: 0 };
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("ai_price_candidates")
    .select("source_image_id,source_row_index,h5_lifecycle_status")
    .eq("visit_id", input.visitId)
    .not("source_image_id", "is", null);
  if (existingError) throw new Error(existingError.message);

  const existingRowKeys = new Set((existingRows ?? [])
    .filter((row) => !inactiveLifecycleStatuses.has(String(row.h5_lifecycle_status ?? "")))
    .map((row) => rowKey(
      (row as { source_image_id?: string | null }).source_image_id,
      (row as { source_row_index?: number | null }).source_row_index,
    )));

  const missingSourceItems = sourceItems.filter((item) => !existingRowKeys.has(rowKey(item.sourceImageId, item.sourceRowIndex)));
  if (missingSourceItems.length === 0) {
    return {
      inserted_count: 0,
      inserted_candidate_ids: [],
      skipped_existing_count: sourceItems.length,
      eligible_row_count: sourceItems.length,
    };
  }

  const rows = await buildAiPriceCandidateRows({
    visitId: input.visitId,
    sourceItems: missingSourceItems,
    matchContext: input.matchContext,
    supabase,
  });
  const inserted = await insertAiPriceCandidateRows({
    visitId: input.visitId,
    rows,
    affectedImageIds: imageIds.length > 0 ? imageIds : undefined,
    preserveExistingCandidates: true,
    supabase,
  });

  return {
    inserted_count: inserted.length,
    inserted_candidate_ids: inserted.map((candidate) => candidate.id),
    skipped_existing_count: sourceItems.length - missingSourceItems.length,
    eligible_row_count: sourceItems.length,
  };
}
