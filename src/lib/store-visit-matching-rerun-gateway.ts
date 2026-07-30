import {
  buildAiPriceCandidateRows,
  insertAiPriceCandidateRows,
  loadProductMatchContext,
  type ProductMatchContext,
} from "@/lib/ai-price-candidates";
import {
  runPriorityPriceQualityGateBatched,
  triggerPriceQualityGateRunner,
} from "@/lib/price-quality-gate-jobs";
import {
  type StoreVisitMatchingRerunGateway,
  type StoreVisitMatchingRerunSelector,
  type StoreVisitMatchingRerunVisit,
  type StoredVisionMatchRow,
} from "@/lib/store-visit-matching-rerun";
import { invalidateStoreVisitImagePriceImpact } from "@/lib/store-visit-image-maintenance";
import { sourceItemsFromStoredPriceImages } from "@/lib/store-visit-price-candidate-sync";
import { createSupabaseServiceClient } from "@/lib/supabase";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceClient>;
type StoredPriceImage = Parameters<typeof sourceItemsFromStoredPriceImages>[0][number];

export type StoreVisitMatchingRerunGatewayOptions = {
  requestUrl?: string | null;
};

const INSERT_RETRY_ATTEMPTS = 3;

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function insertCandidateRowsWithRetry(input: {
  visitId: string;
  rows: Awaited<ReturnType<typeof buildAiPriceCandidateRows>>;
  supabase: SupabaseServiceClient;
}) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= INSERT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      // invalidate already deleted prior candidates; skip delete here to avoid empty windows on retry.
      return await insertAiPriceCandidateRows({
        visitId: input.visitId,
        rows: input.rows,
        preserveExistingCandidates: true,
        supabase: input.supabase,
      });
    } catch (error) {
      lastError = error;
      if (attempt >= INSERT_RETRY_ATTEMPTS) break;
      await sleep(100 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function createStoreVisitMatchingRerunGateway(
  supabase: SupabaseServiceClient,
  options: StoreVisitMatchingRerunGatewayOptions = {},
): StoreVisitMatchingRerunGateway {
  const insertedCandidateIdsByVisit = new Map<string, string[]>();
  const performanceMs = {
    match_context: 0,
    replace: 0,
    refresh: 0,
    priority_quality: 0,
  };
  const startedAt = performance.now();

  return {
    async selectVisits(selector) {
      return selectVisits(supabase, selector);
    },
    async loadMatchContext() {
      const matchContextStartedAt = performance.now();
      const context = await loadProductMatchContext(supabase);
      performanceMs.match_context = Math.round(performance.now() - matchContextStartedAt);
      return context;
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
      const replaceStartedAt = performance.now();
      const images = rows as StoredPriceImage[];
      const sourceItems = sourceItemsFromStoredPriceImages(images);
      const imageIds = images.map((image) => image.id);
      // Build first so invalidate/insert never run against empty replacement rows.
      const candidateRows = await buildAiPriceCandidateRows({
        visitId: visit.id,
        sourceItems,
        matchContext: matchContext as ProductMatchContext,
        supabase,
      });
      const invalidation = await invalidateStoreVisitImagePriceImpact({
        visitId: visit.id,
        imageIds,
        lifecycleStatus: "reanalyzed",
        rejectionReason: "Manual match-only rerun replaced the previous candidate and price snapshot.",
        candidateDisposition: "delete",
        reviewedBy: "matching_rerun",
        supabase,
      });
      const inserted = await insertCandidateRowsWithRetry({
        visitId: visit.id,
        rows: candidateRows,
        supabase,
      });
      const skuIds = inserted
        .filter((candidate) => candidate.candidate_type === "SKU")
        .map((candidate) => candidate.id)
        .filter(Boolean);
      insertedCandidateIdsByVisit.set(visit.id, skuIds);
      const methodCounts: Record<string, number> = {};
      for (const candidate of inserted) {
        const method = candidate.ai_match_method ?? "UNMATCHED";
        methodCounts[method] = (methodCounts[method] ?? 0) + 1;
      }
      performanceMs.replace += Math.round(performance.now() - replaceStartedAt);
      return {
        insertedCount: inserted.length,
        deletedSnapshotCount: invalidation.deletedSnapshotCount,
        methodCounts,
        insertedSkuCandidateIds: skuIds,
      };
    },
    async refreshVisit(_visit) {
      // match-only does not change vision_result; skipping refresh avoids reloading nested
      // vision JSON and rewriting ai_result / price_image_results from incomplete image rows.
      void _visit;
      performanceMs.refresh = 0;
    },
    async triggerReview(visitIds) {
      const candidateIds = visitIds.flatMap((visitId) => insertedCandidateIdsByVisit.get(visitId) ?? []);
      if (candidateIds.length === 0) return;

      const priorityStartedAt = performance.now();
      try {
        const priority = await runPriorityPriceQualityGateBatched({ supabase, candidateIds });
        performanceMs.priority_quality = Math.round(performance.now() - priorityStartedAt);
        console.info("[store-visit-matching-rerun] priority quality completed", {
          candidate_count: candidateIds.length,
          chunk_count: priority.chunk_count,
          priority_claimed: priority.priority_claimed,
          priority_passed: priority.priority_passed,
          priority_review_required: priority.priority_review_required,
          priority_auto_approved: priority.priority_auto_approved,
          priority_auto_approval_failed: priority.priority_auto_approval_failed,
          match_context_ms: performanceMs.match_context,
          replace_ms: performanceMs.replace,
          refresh_ms: performanceMs.refresh,
          priority_quality_ms: performanceMs.priority_quality,
          total_ms: Math.round(performance.now() - startedAt),
        });
        // Do not treat global quality wake as completion; job layer checks terminal status.
        if (priority.priority_claimed < candidateIds.length && options.requestUrl) {
          await triggerPriceQualityGateRunner({ requestUrl: options.requestUrl });
        }
      } catch (error) {
        performanceMs.priority_quality = Math.round(performance.now() - priorityStartedAt);
        console.error("[store-visit-matching-rerun] priority quality failed; general worker remains the fallback", {
          candidate_count: candidateIds.length,
          match_context_ms: performanceMs.match_context,
          replace_ms: performanceMs.replace,
          refresh_ms: performanceMs.refresh,
          priority_quality_ms: performanceMs.priority_quality,
          total_ms: Math.round(performance.now() - startedAt),
          error: error instanceof Error ? error.message : String(error),
        });
        if (options.requestUrl) {
          await triggerPriceQualityGateRunner({ requestUrl: options.requestUrl });
        }
      }
    },
  };
}

export async function selectStoreVisitMatchingRerunVisits(supabase: SupabaseServiceClient, selector: StoreVisitMatchingRerunSelector) {
  return selectVisits(supabase, selector);
}

export async function listUnsettledSkuCandidateIdsForVisits(input: {
  supabase: SupabaseServiceClient;
  visitIds: string[];
  limit?: number;
}) {
  const visitIds = Array.from(new Set(input.visitIds.map((value) => String(value ?? "").trim()).filter(Boolean)));
  if (visitIds.length === 0) return [] as string[];
  const limit = Math.max(1, Math.min(input.limit ?? 5000, 5000));
  const { data, error } = await input.supabase
    .from("ai_price_candidates")
    .select("id")
    .in("visit_id", visitIds)
    .eq("candidate_type", "SKU")
    .in("status", ["pending", "approved"])
    .or("quality_gate_status.in.(PENDING,PROCESSING),and(quality_gate_status.eq.FAILED,quality_gate_attempt_count.lt.3)")
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => String((row as { id?: unknown }).id ?? "").trim())
    .filter(Boolean);
}

export async function countUnsettledSkuQualityForVisits(input: {
  supabase: SupabaseServiceClient;
  visitIds: string[];
}) {
  const visitIds = Array.from(new Set(input.visitIds.map((value) => String(value ?? "").trim()).filter(Boolean)));
  if (visitIds.length === 0) return 0;
  const { count, error } = await input.supabase
    .from("ai_price_candidates")
    .select("id", { count: "exact", head: true })
    .in("visit_id", visitIds)
    .eq("candidate_type", "SKU")
    .in("status", ["pending", "approved"])
    .or("quality_gate_status.in.(PENDING,PROCESSING),and(quality_gate_status.eq.FAILED,quality_gate_attempt_count.lt.3)");
  if (error) throw new Error(error.message);
  return count ?? 0;
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
