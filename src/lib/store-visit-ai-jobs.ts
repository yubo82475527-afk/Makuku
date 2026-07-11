import { revalidatePath } from "next/cache";
import { runStoreVisitAnalysis } from "@/lib/store-visit-analysis";
import { refreshStoreVisitStoredPriceState } from "@/lib/store-visit-image-maintenance";
import { syncStoreVisitPriceCandidatesFromImages } from "@/lib/store-visit-price-candidate-sync";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type {
  StoreVisitAiJob,
  StoreVisitAiJobItem,
  StoreVisitAiJobSummary,
  StoreVisitAiJobType,
} from "@/lib/types";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceClient>;
type StoreVisitAiFinalizeOutcome = "succeeded" | "retake_required" | "failed";
type StoreVisitAiFinalizeResult = "applied" | "already_finalized" | "ownership_lost";

const activeJobStatuses = ["queued", "running"] as const;
const terminalItemStatuses = ["succeeded", "retake_required", "failed"] as const;
const priceImageTypes = ["own_shelf", "competitor_shelf"] as const;
const defaultMaxConcurrency = 8;
const defaultMaxItemsPerRun = 4;
const defaultMaxRunDurationMs = 240_000;
const defaultPendingEnqueueLimit = 100;
const minimumInitialAnalysisImageAgeMs = 60_000;

function nowIso() {
  return new Date().toISOString();
}

function cleanIds(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function maxConcurrency() {
  const value = Number.parseInt(String(process.env.MAX_STORE_VISIT_AI_CONCURRENCY ?? ""), 10);
  return Number.isFinite(value) && value > 0 ? value : defaultMaxConcurrency;
}

function maxItemsPerRun() {
  const value = Number.parseInt(String(process.env.MAX_STORE_VISIT_AI_ITEMS_PER_RUN ?? ""), 10);
  return Number.isFinite(value) && value > 0 ? value : defaultMaxItemsPerRun;
}

function maxRunDurationMs() {
  const value = Number.parseInt(String(process.env.MAX_STORE_VISIT_AI_RUN_BUDGET_MS ?? ""), 10);
  return Number.isFinite(value) && value > 0 ? value : defaultMaxRunDurationMs;
}

function pendingEnqueueLimit() {
  const value = Number.parseInt(String(process.env.STORE_VISIT_AI_PENDING_ENQUEUE_LIMIT ?? ""), 10);
  return Number.isFinite(value) && value > 0 ? value : defaultPendingEnqueueLimit;
}

function isMissingAiJobTable(error: { message?: string | null } | null | undefined) {
  const message = error?.message ?? "";
  return message.includes("store_visit_ai_jobs")
    || message.includes("store_visit_ai_job_items")
    || message.includes("schema cache");
}

function revalidateVisitPaths(visitId: string) {
  revalidatePath("/zh/mobile/offline-capture");
  revalidatePath(`/zh/mobile/offline-capture/${visitId}`);
  revalidatePath("/en/mobile/offline-capture");
  revalidatePath(`/en/mobile/offline-capture/${visitId}`);
}

export function summarizeStoreVisitAiJob(
  job: StoreVisitAiJob | null | undefined,
  items: StoreVisitAiJobItem[] = [],
): StoreVisitAiJobSummary | null {
  if (!job) return null;
  return {
    id: job.id,
    job_type: job.job_type,
    status: job.status,
    total_count: job.total_count,
    success_count: job.success_count,
    failed_count: job.failed_count,
    retake_required_count: job.retake_required_count,
    remaining_count: job.remaining_count,
    target_image_ids: items.map((item) => item.source_image_id),
  };
}

async function loadJobItems(supabase: SupabaseServiceClient, jobId: string) {
  const { data, error } = await supabase
    .from("store_visit_ai_job_items")
    .select("*")
    .eq("job_id", jobId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as StoreVisitAiJobItem[];
}

function isRetakeRequiredVisionResult(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const photoQuality = (value as Record<string, unknown>).photo_quality;
  return Boolean(photoQuality)
    && typeof photoQuality === "object"
    && !Array.isArray(photoQuality)
    && (photoQuality as Record<string, unknown>).status === "retake_required";
}

async function reconcileStoreVisitAiJobFromImages(input: {
  supabase: SupabaseServiceClient;
  job: StoreVisitAiJob;
  items: StoreVisitAiJobItem[];
}) {
  const reconcilableItems = input.items.filter((item) => item.status === "queued");
  if (reconcilableItems.length === 0) return { job: input.job, items: input.items };

  const imageIds = cleanIds(reconcilableItems.map((item) => item.source_image_id));
  const { data: images, error } = await input.supabase
    .from("offline_visit_images")
    .select("id,analysis_status,vision_result,analysis_error,error_message")
    .in("id", imageIds);
  if (error) throw new Error(error.message);

  const imagesById = new Map((images ?? []).map((image) => [String(image.id), image] as const));
  let changed = false;
  for (const item of reconcilableItems) {
    const image = imagesById.get(item.source_image_id);
    if (!image) continue;

    const nextStatus = isRetakeRequiredVisionResult(image.vision_result)
      ? "retake_required"
      : image.analysis_status === "analyzed"
        ? "succeeded"
        : image.analysis_status === "failed"
          ? "failed"
          : null;
    if (!nextStatus) continue;

    const { error: updateError } = await input.supabase
      .from("store_visit_ai_job_items")
      .update({
        status: nextStatus,
        error_message: nextStatus === "failed" ? image.analysis_error ?? image.error_message ?? "Image analysis failed." : null,
        result_summary: {
          ...(item.result_summary && typeof item.result_summary === "object" && !Array.isArray(item.result_summary)
            ? item.result_summary as Record<string, unknown>
            : {}),
          reconciled_from_image_status: image.analysis_status,
        },
        lease_expires_at: null,
        last_heartbeat_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", item.id);
    if (updateError) throw new Error(updateError.message);
    changed = true;
  }

  return changed ? refreshJobCounts(input.supabase, input.job.id) : { job: input.job, items: input.items };
}

export async function loadStoreVisitAiJob(input: {
  jobId: string;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const { data: job, error } = await supabase
    .from("store_visit_ai_jobs")
    .select("*")
    .eq("id", input.jobId)
    .single();
  if (error || !job) throw new Error(error?.message ?? "Store visit AI job not found");
  const items = await loadJobItems(supabase, input.jobId);
  return { job: job as StoreVisitAiJob, items };
}

export async function loadActiveStoreVisitAiJob(input: {
  visitId: string;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const { data: job, error } = await supabase
    .from("store_visit_ai_jobs")
    .select("*")
    .eq("visit_id", input.visitId)
    .in("status", activeJobStatuses)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (isMissingAiJobTable(error)) return { job: null, items: [] as StoreVisitAiJobItem[] };
  if (error) throw new Error(error.message);
  if (!job) return { job: null, items: [] as StoreVisitAiJobItem[] };
  const items = await loadJobItems(supabase, String(job.id));
  return { job: job as StoreVisitAiJob, items };
}

export async function reconcileActiveStoreVisitAiJob(input: {
  visitId: string;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const active = await loadActiveStoreVisitAiJob({ visitId: input.visitId, supabase });
  if (!active.job) return active;

  const reconciled = await reconcileStoreVisitAiJobFromImages({
    supabase,
    job: active.job,
    items: active.items,
  });
  if (
    reconciled.job.remaining_count === 0
    || !activeJobStatuses.includes(reconciled.job.status as (typeof activeJobStatuses)[number])
  ) {
    return { job: null, items: [] as StoreVisitAiJobItem[] };
  }
  return reconciled;
}

export async function loadActiveAiJobsForVisits(input: {
  visitIds: string[];
  supabase?: SupabaseServiceClient;
}) {
  const visitIds = cleanIds(input.visitIds);
  if (visitIds.length === 0) return new Map<string, StoreVisitAiJobSummary | null>();
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const { data: jobs, error } = await supabase
    .from("store_visit_ai_jobs")
    .select("*")
    .in("visit_id", visitIds)
    .in("status", activeJobStatuses)
    .order("created_at", { ascending: false });
  if (isMissingAiJobTable(error)) return new Map();
  if (error) throw new Error(error.message);

  const activeJobs = new Map<string, StoreVisitAiJob>();
  for (const job of (jobs ?? []) as StoreVisitAiJob[]) {
    if (!activeJobs.has(job.visit_id)) activeJobs.set(job.visit_id, job);
  }

  const jobIds = Array.from(activeJobs.values()).map((job) => job.id);
  if (jobIds.length === 0) return new Map();
  const { data: items, error: itemsError } = await supabase
    .from("store_visit_ai_job_items")
    .select("*")
    .in("job_id", jobIds)
    .order("position", { ascending: true });
  if (itemsError) throw new Error(itemsError.message);

  const itemsByJobId = new Map<string, StoreVisitAiJobItem[]>();
  for (const item of (items ?? []) as StoreVisitAiJobItem[]) {
    itemsByJobId.set(item.job_id, [...(itemsByJobId.get(item.job_id) ?? []), item]);
  }

  const result = new Map<string, StoreVisitAiJobSummary | null>();
  for (const [visitId, job] of activeJobs.entries()) {
    result.set(visitId, summarizeStoreVisitAiJob(job, itemsByJobId.get(job.id) ?? []));
  }
  return result;
}

async function loadActivePriceImageIds(supabase: SupabaseServiceClient, visitId: string) {
  const { data, error } = await supabase
    .from("offline_visit_images")
    .select("id")
    .eq("visit_id", visitId)
    .in("image_type", priceImageTypes)
    .is("deleted_at", null)
    .is("replaced_by_image_id", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return cleanIds((data ?? []).map((image) => String((image as { id?: unknown }).id ?? "")));
}

export async function createStoreVisitAiJob(input: {
  visitId: string;
  jobType: StoreVisitAiJobType;
  imageIds?: string[];
  createdBy?: string | null;
  requestSnapshot?: Record<string, unknown>;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const imageIds = cleanIds(input.imageIds?.length ? input.imageIds : await loadActivePriceImageIds(supabase, input.visitId));
  if (imageIds.length === 0) throw new Error("At least one price photo is required for AI analysis");

  const { data, error } = await supabase.rpc("create_store_visit_ai_job", {
    p_visit_id: input.visitId,
    p_job_type: input.jobType,
    p_source_image_ids: imageIds,
    p_created_by: input.createdBy ?? null,
    p_request_snapshot: {
      ...(input.requestSnapshot ?? {}),
      target_image_ids: imageIds,
    },
  });
  if (error) throw new Error(error.message);

  const row = Array.isArray(data)
    ? data[0] as { job_id?: string; created_job_id?: string; reused?: boolean; conflict?: boolean } | undefined
    : null;
  const rpcJobId = row?.created_job_id ?? row?.job_id ?? null;
  if (!rpcJobId) throw new Error("Failed to create store visit AI job");
  const { job, items } = await loadStoreVisitAiJob({ jobId: rpcJobId, supabase });
  return {
    job,
    items,
    summary: summarizeStoreVisitAiJob(job, items),
    reused: Boolean(row?.reused),
    conflict: Boolean(row?.conflict),
  };
}

async function refreshJobCounts(supabase: SupabaseServiceClient, jobId: string) {
  const { data: items, error } = await supabase
    .from("store_visit_ai_job_items")
    .select("*")
    .eq("job_id", jobId);
  if (error) throw new Error(error.message);

  const counts = ((items ?? []) as StoreVisitAiJobItem[]).reduce((acc, item) => {
    if (item.status === "succeeded") acc.success_count += 1;
    if (item.status === "retake_required") acc.retake_required_count += 1;
    if (item.status === "failed") acc.failed_count += 1;
    if (!terminalItemStatuses.includes(item.status as (typeof terminalItemStatuses)[number])) acc.remaining_count += 1;
    return acc;
  }, { success_count: 0, retake_required_count: 0, failed_count: 0, remaining_count: 0 });

  const completed = counts.remaining_count === 0;
  const failed = completed && counts.success_count === 0 && counts.retake_required_count === 0 && counts.failed_count > 0;
  const { data: job, error: updateError } = await supabase
    .from("store_visit_ai_jobs")
    .update({
      ...counts,
      status: completed ? (failed ? "failed" : "completed") : "running",
      completed_at: completed ? nowIso() : null,
      updated_at: nowIso(),
    })
    .eq("id", jobId)
    .select("*")
    .single();
  if (updateError || !job) throw new Error(updateError?.message ?? "Failed to refresh store visit AI job counts");
  if (completed) {
    await syncStoreVisitPriceCandidatesFromImages({
      visitId: String((job as StoreVisitAiJob).visit_id),
      supabase,
    });
  }
  return { job: job as StoreVisitAiJob, items: (items ?? []) as StoreVisitAiJobItem[] };
}

async function claimNextItem(input: {
  supabase: SupabaseServiceClient;
  jobId?: string | null;
}) {
  const workerId = `vercel-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const { data, error } = await input.supabase.rpc("claim_store_visit_ai_job_item", {
    p_job_id: input.jobId ?? null,
    p_worker_id: workerId,
    p_max_global_processing: maxConcurrency(),
  });
  if (error) throw new Error(error.message);

  const row = Array.isArray(data)
    ? data[0] as { job_id?: string; item_id?: string; claimed_job_id?: string; claimed_item_id?: string } | undefined
    : null;
  const rpcJobId = row?.claimed_job_id ?? row?.job_id ?? null;
  const rpcItemId = row?.claimed_item_id ?? row?.item_id ?? null;
  if (!rpcJobId || !rpcItemId) return null;
  const { data: job, error: jobError } = await input.supabase
    .from("store_visit_ai_jobs")
    .select("*")
    .eq("id", rpcJobId)
    .single();
  if (jobError || !job) throw new Error(jobError?.message ?? "Claimed AI job not found");
  const { data: item, error: itemError } = await input.supabase
    .from("store_visit_ai_job_items")
    .select("*")
    .eq("id", rpcItemId)
    .single();
  if (itemError || !item) throw new Error(itemError?.message ?? "Claimed AI job item not found");
  return { job: job as StoreVisitAiJob, item: item as StoreVisitAiJobItem };
}

async function finalizeStoreVisitAiJobItem(input: {
  supabase: SupabaseServiceClient;
  item: StoreVisitAiJobItem;
  outcome: StoreVisitAiFinalizeOutcome;
  resultSummary: Record<string, unknown>;
  errorMessage?: string | null;
}) {
  if (!input.item.worker_id) throw new Error("Claimed store visit AI job item has no worker owner.");
  const { data, error } = await input.supabase.rpc("finalize_store_visit_ai_job_item", {
    p_item_id: input.item.id,
    p_worker_id: input.item.worker_id,
    p_outcome: input.outcome,
    p_result_summary: input.resultSummary,
    p_error_message: input.errorMessage ?? null,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data)
    ? data[0] as { finalize_result?: StoreVisitAiFinalizeResult } | undefined
    : null;
  if (!row?.finalize_result) throw new Error("Store visit AI finalization returned no result.");
  return row.finalize_result;
}

async function processItem(input: {
  supabase: SupabaseServiceClient;
  job: StoreVisitAiJob;
  item: StoreVisitAiJobItem;
}) {
  const { supabase, job, item } = input;
  const { data: markedImages, error: markError } = await supabase
    .from("offline_visit_images")
    .update({
      analysis_status: "analyzing",
      analysis_error: null,
      error_message: null,
    })
    .eq("visit_id", job.visit_id)
    .eq("id", item.source_image_id)
    .select("id");
  if (markError) throw new Error(markError.message);
  if ((markedImages ?? []).length !== 1) throw new Error("Unable to mark the requested photo for AI analysis.");

  let completed: {
    outcome: Exclude<StoreVisitAiFinalizeOutcome, "failed">;
    resultSummary: Record<string, unknown>;
  } | null = null;
  let analysisFailure: string | null = null;

  try {
    const isRerun = job.job_type === "single_image_reanalysis" || job.job_type === "full_visit_reanalysis";
    const result = await runStoreVisitAnalysis({
      visitId: job.visit_id,
      affectedImageIds: [item.source_image_id],
      invalidateAffectedImageSnapshots: isRerun,
      forceAnalyzeImageIds: [item.source_image_id],
    });
    const syncResult = await syncStoreVisitPriceCandidatesFromImages({
      visitId: job.visit_id,
      imageIds: [item.source_image_id],
      supabase,
    });

    const retake = result.aiAnalysis.price_image_retake_required.find((entry) => entry.imageId === item.source_image_id);
    const forcedResult = result.forcedImageResults.find((entry) => entry.imageId === item.source_image_id);
    completed = {
      outcome: retake ? "retake_required" : "succeeded",
      resultSummary: {
        response_id: forcedResult?.responseId ?? null,
        usage_present: Boolean(forcedResult?.usagePresent),
        row_count: forcedResult?.rowCount ?? 0,
        replaced_candidate_count: result.replacedCandidateCount,
        deleted_snapshot_count: result.deletedSnapshotCount,
        synced_candidate_count: syncResult.inserted_count,
        eligible_candidate_row_count: syncResult.eligible_row_count,
        retake_reasons: retake?.reasons ?? null,
        retake_message: retake?.message ?? null,
      },
    };
  } catch (error) {
    analysisFailure = error instanceof Error ? error.message : "Unknown error";
  }

  const outcome: StoreVisitAiFinalizeOutcome = analysisFailure ? "failed" : completed!.outcome;
  const resultSummary = analysisFailure ? { error_message: analysisFailure } : completed!.resultSummary;
  const finalizeResult = await finalizeStoreVisitAiJobItem({
    supabase,
    item,
    outcome,
    resultSummary,
    errorMessage: analysisFailure,
  });

  if (finalizeResult === "ownership_lost") {
    console.warn("[store-visit-ai-jobs] item ownership lost", {
      job_id: job.id,
      visit_id: job.visit_id,
      image_id: item.source_image_id,
      item_id: item.id,
      worker_id: item.worker_id,
      attempt_count: item.attempt_count,
      intended_status: outcome,
    });
    return;
  }

  if (finalizeResult === "already_finalized") {
    console.info("[store-visit-ai-jobs] item already finalized", {
      job_id: job.id,
      item_id: item.id,
      image_id: item.source_image_id,
      status: outcome,
    });
  }

  if (analysisFailure) {
    try {
      await refreshStoreVisitStoredPriceState({
        visitId: job.visit_id,
        analysisStatusOverride: "failed",
        analysisErrorOverride: analysisFailure,
        visitStatusOverride: "analyzed",
        supabase,
      });
    } catch (refreshError) {
      console.error("[store-visit-ai-jobs] failed to refresh visit after image failure", {
        job_id: job.id,
        visit_id: job.visit_id,
        image_id: item.source_image_id,
        error: refreshError instanceof Error ? refreshError.message : String(refreshError),
      });
    }
    console.error("[store-visit-ai-jobs] item analysis failed", {
      job_id: job.id,
      job_type: job.job_type,
      visit_id: job.visit_id,
      image_id: item.source_image_id,
      attempt_count: item.attempt_count,
      error: analysisFailure,
    });
    return;
  }

  console.info("[store-visit-ai-jobs] item completed", {
    job_id: job.id,
    job_type: job.job_type,
    visit_id: job.visit_id,
    image_id: item.source_image_id,
    attempt_count: item.attempt_count,
    status: completed!.outcome,
    result_summary: completed!.resultSummary,
  });
}

export async function enqueuePendingStoreVisitInitialAnalysisJobs(input: {
  supabase?: SupabaseServiceClient;
  limit?: number;
} = {}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const { data: visits, error } = await supabase
    .from("offline_store_visits")
    .select("id,offline_visit_images(id,image_type,deleted_at,replaced_by_image_id,created_at)")
    .eq("visit_status", "uploaded")
    .or("analysis_status.is.null,analysis_status.eq.pending")
    .order("created_at", { ascending: true })
    .limit(input.limit ?? 50);
  if (isMissingAiJobTable(error)) return { enqueued_count: 0, skipped_count: 0 };
  if (error) throw new Error(error.message);

  let enqueuedCount = 0;
  let skippedCount = 0;
  for (const visit of (visits ?? []) as { id: string; offline_visit_images?: Array<{ id: string; image_type: string; deleted_at: string | null; replaced_by_image_id: string | null; created_at: string | null }> }[]) {
    const imageRows = (visit.offline_visit_images ?? [])
      .filter((image) => priceImageTypes.includes(image.image_type as (typeof priceImageTypes)[number]) && !image.deleted_at && !image.replaced_by_image_id);
    const imageIds = cleanIds(imageRows.map((image) => image.id));
    if (imageIds.length === 0) {
      skippedCount += 1;
      continue;
    }
    const latestImageCreatedAt = imageRows
      .map((image) => new Date(image.created_at ?? "").getTime())
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => right - left)[0] ?? 0;
    if (latestImageCreatedAt > 0 && Date.now() - latestImageCreatedAt < minimumInitialAnalysisImageAgeMs) {
      skippedCount += 1;
      continue;
    }
    const created = await createStoreVisitAiJob({
      visitId: visit.id,
      jobType: "initial_analysis",
      imageIds,
      requestSnapshot: { watchdog: true },
      supabase,
    });
    if (!created.conflict) enqueuedCount += created.reused ? 0 : 1;
  }
  return { enqueued_count: enqueuedCount, skipped_count: skippedCount };
}

export async function runStoreVisitAiJob(input: {
  jobId?: string | null;
  supabase?: SupabaseServiceClient;
} = {}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const enqueueResult = await enqueuePendingStoreVisitInitialAnalysisJobs({
    supabase,
    limit: pendingEnqueueLimit(),
  });
  const startedAt = Date.now();
  let processed = 0;
  let lastJob: StoreVisitAiJob | null = null;
  let lastItems: StoreVisitAiJobItem[] = [];

  while (processed < maxItemsPerRun() && (Date.now() - startedAt) < maxRunDurationMs()) {
    const claimed = await claimNextItem({ supabase, jobId: input.jobId });
    if (!claimed) break;

    await processItem({ supabase, job: claimed.job, item: claimed.item });
    const refreshed = await refreshJobCounts(supabase, claimed.job.id);
    revalidateVisitPaths(claimed.job.visit_id);

    processed += 1;
    lastJob = refreshed.job;
    lastItems = refreshed.items;

    if (input.jobId && refreshed.job.remaining_count === 0) break;
  }

  console.info("[store-visit-ai-jobs] runner completed", {
    requested_job_id: input.jobId ?? null,
    processed,
    enqueued_count: enqueueResult.enqueued_count,
    skipped_count: enqueueResult.skipped_count,
    last_job_id: lastJob?.id ?? null,
    last_job_remaining_count: lastJob?.remaining_count ?? 0,
  });

  return {
    processed,
    job: lastJob,
    items: lastItems,
    remaining_count: lastJob?.remaining_count ?? 0,
    enqueued_count: enqueueResult.enqueued_count,
    skipped_count: enqueueResult.skipped_count,
  };
}

export async function triggerStoreVisitAiJobRunner(input: {
  requestUrl: string;
  jobId?: string | null;
}) {
  const secret = String(process.env.CRON_SECRET ?? "").trim();
  if (!secret) {
    await runStoreVisitAiJob({ jobId: input.jobId });
    return;
  }

  const url = new URL("/api/internal/store-visit-ai/run", input.requestUrl);
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ job_id: input.jobId ?? null }),
  }).catch((error) => {
    console.error("[store-visit-ai-jobs] failed to trigger runner", {
      job_id: input.jobId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
