import {
  buildAiPriceCandidateRows,
  insertAiPriceCandidateRows,
  loadProductMatchContext,
  type ProductMatchContext,
} from "@/lib/ai-price-candidates";
import { runPriceQualityGate } from "@/lib/price-quality-gate-jobs";
import {
  type StoreVisitMatchingRerunGateway,
  type StoreVisitMatchingRerunSelector,
  type StoreVisitMatchingRerunVisit,
  type StoredVisionMatchRow,
} from "@/lib/store-visit-matching-rerun";
import {
  invalidateStoreVisitImagePriceImpact,
  refreshStoreVisitStoredPriceState,
} from "@/lib/store-visit-image-maintenance";
import { sourceItemsFromStoredPriceImages } from "@/lib/store-visit-price-candidate-sync";
import { mergeStoredCandidateEvidence } from "@/lib/stored-match-evidence";
import { createSupabaseServiceClient } from "@/lib/supabase";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceClient>;
type StoredPriceImage = Parameters<typeof sourceItemsFromStoredPriceImages>[0][number];

export function createStoreVisitMatchingRerunGateway(supabase: SupabaseServiceClient): StoreVisitMatchingRerunGateway {
  const insertedCandidatesByVisit = new Map<string, number>();

  return {
    async selectVisits(selector) {
      return selectVisits(supabase, selector);
    },
    async loadMatchContext() {
      return loadProductMatchContext(supabase);
    },
    async loadStoredVisionRows(visit) {
      const { data, error } = await supabase
        .from("offline_visit_images")
        .select("id,visit_id,image_path,image_type,deleted_at,replaced_by_image_id,vision_result")
        .eq("visit_id", visit.id)
        .in("image_type", ["own_shelf", "competitor_shelf"])
        .is("deleted_at", null)
        .is("replaced_by_image_id", null);
      if (error) throw new Error(error.message);
      return ((data ?? []) as StoredPriceImage[])
        .filter((image) => sourceItemsFromStoredPriceImages([image]).length > 0) as StoredVisionMatchRow[];
    },
    async replaceVisitOutput({ visit, rows, matchContext }) {
      const images = rows as StoredPriceImage[];
      const { data: priorCandidates, error: priorCandidateError } = await supabase
        .from("ai_price_candidates")
        .select("source_image_id,source_row_index,raw_brand,raw_product,raw_piece_count_text,piece_count,created_at")
        .eq("visit_id", visit.id)
        .order("created_at", { ascending: false });
      if (priorCandidateError) throw new Error(priorCandidateError.message);
      const sourceItems = mergeStoredCandidateEvidence(
        sourceItemsFromStoredPriceImages(images),
        priorCandidates ?? [],
      );
      const imageIds = images.map((image) => image.id);
      const invalidation = await invalidateStoreVisitImagePriceImpact({
        visitId: visit.id,
        imageIds,
        lifecycleStatus: "reanalyzed",
        rejectionReason: "Manual match-only rerun replaced the previous candidate and price snapshot.",
        reviewedBy: "matching_rerun",
        supabase,
      });
      const candidateRows = await buildAiPriceCandidateRows({
        visitId: visit.id,
        sourceItems,
        matchContext: matchContext as ProductMatchContext,
        supabase,
      });
      const inserted = await insertAiPriceCandidateRows({
        visitId: visit.id,
        rows: candidateRows,
        preserveExistingCandidates: true,
        supabase,
      });
      insertedCandidatesByVisit.set(visit.id, inserted.length);
      const methodCounts: Record<string, number> = {};
      for (const candidate of inserted) {
        const method = candidate.ai_match_method ?? "UNMATCHED";
        methodCounts[method] = (methodCounts[method] ?? 0) + 1;
      }
      return {
        insertedCount: inserted.length,
        deletedSnapshotCount: invalidation.deletedSnapshotCount,
        methodCounts,
      };
    },
    async refreshVisit(visit) {
      await refreshStoreVisitStoredPriceState({ visitId: visit.id, supabase });
    },
    async triggerReview(visitIds) {
      if (!visitIds.some((visitId) => (insertedCandidatesByVisit.get(visitId) ?? 0) > 0)) return;
      for (let round = 0; round < 100; round += 1) {
        const counters = await runPriceQualityGate({ supabase, maxBatches: 4 });
        if (counters.claimed < 200) break;
      }
    },
  };
}

export async function selectStoreVisitMatchingRerunVisits(supabase: SupabaseServiceClient, selector: StoreVisitMatchingRerunSelector) {
  return selectVisits(supabase, selector);
}

async function selectVisits(supabase: SupabaseServiceClient, selector: StoreVisitMatchingRerunSelector) {
  let query = supabase
    .from("offline_store_visits")
    .select("id,visit_code,visit_date")
    .order("visit_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (selector.kind === "visit_id") query = query.eq("id", selector.visitId);
  if (selector.kind === "visit_code") query = query.eq("visit_code", selector.visitCode);
  if (selector.kind === "date_range") {
    query = query.gte("visit_date", selector.dateFrom).lte("visit_date", selector.dateTo);
  }
  const { data, error } = await query.limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((visit): StoreVisitMatchingRerunVisit => ({
    id: visit.id,
    visitCode: visit.visit_code ?? null,
  }));
}
