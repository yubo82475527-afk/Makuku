import { createStoreVisitAiJob, triggerStoreVisitAiJobRunner } from "@/lib/store-visit-ai-jobs";
import {
  DEFAULT_MATCH_ONLY_VISIT_CONCURRENCY,
  rerunStoreVisitMatching,
  type StoreVisitMatchingRerunRequest,
  type StoreVisitMatchingRerunResult,
  type StoreVisitMatchingRerunSelector,
} from "@/lib/store-visit-matching-rerun";
import {
  countUnsettledSkuQualityForVisits,
  createStoreVisitMatchingRerunGateway,
  listUnsettledSkuCandidateIdsForVisits,
  selectStoreVisitMatchingRerunVisits,
} from "@/lib/store-visit-matching-rerun-gateway";
import { runPriorityPriceQualityGateBatched } from "@/lib/price-quality-gate-jobs";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type {
  StoreVisitRerunChildAiJob,
  StoreVisitRerunJob,
  StoreVisitRerunJobFailure,
  StoreVisitRerunJobMode,
  StoreVisitRerunJobProgress,
} from "@/lib/types";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/** Longer than maxDuration=300 so a healthy worker is not double-claimed. */
export const STORE_VISIT_RERUN_STALE_MS = 6 * 60 * 1000;
const maxFailureRecords = 200;
const maxMatchOnlyVisitsPerRun = 120;
const maxVisitFailureAttempts = 3;
const maxAiReanalysisChildWakeCount = 5;
const historyLimit = 10;
const progressUpdateEveryVisits = 1;

function nowIso() {
  return new Date().toISOString();
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function uniqueIds(values: string[]) {
  return Array.from(new Set(values.map((value) => clean(value)).filter(Boolean)));
}

function normalizeMethodCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const count = Number(rawValue);
    if (Number.isFinite(count)) result[key] = count;
  }
  return result;
}

function normalizeFailures(value: unknown): StoreVisitRerunJobFailure[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const record = item as Record<string, unknown>;
    return {
      visitId: clean(record.visitId),
      visitCode: clean(record.visitCode) || null,
      error: clean(record.error) || "Unknown error",
    };
  }).filter((item) => item.visitId);
}

function normalizeChildAiJobs(value: unknown): StoreVisitRerunChildAiJob[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const record = item as Record<string, unknown>;
    return {
      visitId: clean(record.visitId),
      visitCode: clean(record.visitCode) || null,
      jobId: clean(record.jobId),
    };
  }).filter((item) => item.visitId && item.jobId);
}

function emptyProgress(): StoreVisitRerunJobProgress {
  return {
    matched_visit_ids: [],
    skipped_visit_ids: [],
    permanently_failed_visit_ids: [],
    failure_attempts: {},
    quality_unsettled_count: 0,
  };
}

function normalizeProgress(value: unknown): StoreVisitRerunJobProgress {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const failureAttempts: Record<string, number> = {};
  if (record.failure_attempts && typeof record.failure_attempts === "object" && !Array.isArray(record.failure_attempts)) {
    for (const [visitId, raw] of Object.entries(record.failure_attempts)) {
      const attempts = Number(raw);
      if (clean(visitId) && Number.isFinite(attempts) && attempts > 0) {
        failureAttempts[clean(visitId)] = Math.floor(attempts);
      }
    }
  }
  return {
    matched_visit_ids: uniqueIds(Array.isArray(record.matched_visit_ids) ? record.matched_visit_ids.map(String) : []),
    skipped_visit_ids: uniqueIds(Array.isArray(record.skipped_visit_ids) ? record.skipped_visit_ids.map(String) : []),
    permanently_failed_visit_ids: uniqueIds(
      Array.isArray(record.permanently_failed_visit_ids) ? record.permanently_failed_visit_ids.map(String) : [],
    ),
    failure_attempts: failureAttempts,
    quality_unsettled_count: Math.max(0, Math.floor(Number(record.quality_unsettled_count) || 0)),
  };
}

function normalizeJob(row: StoreVisitRerunJob): StoreVisitRerunJob {
  return {
    ...row,
    selector: row.selector ?? {},
    method_counts: normalizeMethodCounts(row.method_counts),
    child_ai_jobs: normalizeChildAiJobs(row.child_ai_jobs),
    failures: normalizeFailures(row.failures),
    progress: normalizeProgress(row.progress),
  };
}

function serializeSelector(selector: StoreVisitMatchingRerunSelector): StoreVisitMatchingRerunRequest {
  if (selector.kind === "visit_id") return { visit_id: selector.visitId };
  if (selector.kind === "visit_code") return { visit_code: selector.visitCode };
  return { date_from: selector.dateFrom, date_to: selector.dateTo };
}

function selectorForRun(job: StoreVisitRerunJob): StoreVisitMatchingRerunSelector {
  const selector = job.selector as Record<string, unknown>;
  const visitId = clean(selector.visit_id);
  if (visitId) return { kind: "visit_id", visitId };
  const visitCode = clean(selector.visit_code);
  if (visitCode) return { kind: "visit_code", visitCode };
  const dateFrom = clean(selector.date_from);
  const dateTo = clean(selector.date_to);
  return { kind: "date_range", dateFrom, dateTo };
}

function matchOnlyConcurrency() {
  const raw = Number(process.env.STORE_VISIT_RERUN_MATCH_CONCURRENCY);
  if (Number.isFinite(raw) && raw >= 1) return Math.min(16, Math.floor(raw));
  return DEFAULT_MATCH_ONLY_VISIT_CONCURRENCY;
}

function doneVisitIds(progress: StoreVisitRerunJobProgress) {
  return uniqueIds([
    ...progress.matched_visit_ids,
    ...progress.skipped_visit_ids,
    ...progress.permanently_failed_visit_ids,
  ]);
}

function isMatchingVisitsComplete(result: StoreVisitMatchingRerunResult) {
  const done = result.matchedVisitIds.length
    + result.skippedVisitIds.length
    + result.permanentlyFailedVisitIds.length;
  return done >= result.selectedVisitCount;
}

function progressFromJob(job: StoreVisitRerunJob): Partial<Omit<StoreVisitMatchingRerunResult, "selectedVisitCount">> {
  const progress = normalizeProgress(job.progress);
  return {
    processedVisitCount: progress.matched_visit_ids.length,
    skippedVisitCount: progress.skipped_visit_ids.length,
    failedVisitCount: job.failures.length,
    insertedCandidateCount: job.inserted_candidate_count,
    deletedSnapshotCount: job.deleted_snapshot_count,
    methodCounts: job.method_counts,
    failures: job.failures,
    matchedVisitIds: progress.matched_visit_ids,
    skippedVisitIds: progress.skipped_visit_ids,
    permanentlyFailedVisitIds: progress.permanently_failed_visit_ids,
  };
}

function applyFailureAttempts(
  progress: StoreVisitRerunJobProgress,
  failures: StoreVisitRerunJobFailure[],
): { progress: StoreVisitRerunJobProgress; failures: StoreVisitRerunJobFailure[] } {
  const nextAttempts = { ...progress.failure_attempts };
  const permanentIds = new Set(progress.permanently_failed_visit_ids);
  const retainedFailures: StoreVisitRerunJobFailure[] = [];

  for (const failure of failures) {
    if (permanentIds.has(failure.visitId)) {
      retainedFailures.push(failure);
      continue;
    }
    if (progress.matched_visit_ids.includes(failure.visitId) || progress.skipped_visit_ids.includes(failure.visitId)) {
      delete nextAttempts[failure.visitId];
      continue;
    }
    const attempts = (nextAttempts[failure.visitId] ?? 0) + 1;
    nextAttempts[failure.visitId] = attempts;
    retainedFailures.push(failure);
    if (attempts >= maxVisitFailureAttempts) {
      permanentIds.add(failure.visitId);
    }
  }

  for (const visitId of Object.keys(nextAttempts)) {
    if (
      progress.matched_visit_ids.includes(visitId)
      || progress.skipped_visit_ids.includes(visitId)
      || permanentIds.has(visitId)
    ) {
      if (!permanentIds.has(visitId)) delete nextAttempts[visitId];
    }
  }

  return {
    progress: {
      ...progress,
      permanently_failed_visit_ids: uniqueIds([...permanentIds]),
      failure_attempts: nextAttempts,
    },
    failures: retainedFailures.slice(0, maxFailureRecords),
  };
}

export async function createStoreVisitRerunJob(input: {
  mode: StoreVisitRerunJobMode;
  selector: StoreVisitMatchingRerunSelector;
  locale: string;
  requestedBy?: string | null;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("store_visit_rerun_jobs")
    .insert({
      mode: input.mode,
      status: "queued",
      selector: serializeSelector(input.selector),
      locale: clean(input.locale) || "zh",
      requested_by: input.requestedBy ?? null,
      progress: emptyProgress(),
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create store visit rerun job");
  return normalizeJob(data as StoreVisitRerunJob);
}

export async function loadStoreVisitRerunJob(input: {
  jobId: string;
  requestedBy?: string | null;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  let query = supabase.from("store_visit_rerun_jobs").select("*").eq("id", input.jobId);
  if (input.requestedBy) query = query.eq("requested_by", input.requestedBy);
  const { data, error } = await query.single();
  if (error || !data) throw new Error(error?.message ?? "Store Visit rerun job not found");
  return normalizeJob(data as StoreVisitRerunJob);
}

export async function listStoreVisitRerunJobs(input: {
  requestedBy: string | null;
  limit?: number;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  let query = supabase
    .from("store_visit_rerun_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(input.limit ?? historyLimit, historyLimit)));
  if (input.requestedBy) query = query.eq("requested_by", input.requestedBy);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return Promise.all(((data ?? []) as StoreVisitRerunJob[]).map((job) => refreshStoreVisitRerunJobProgress({ job: normalizeJob(job), supabase })));
}

async function markJobRunning(supabase: SupabaseServiceClient, job: StoreVisitRerunJob) {
  const staleBefore = new Date(Date.now() - STORE_VISIT_RERUN_STALE_MS).toISOString();
  let query = supabase
    .from("store_visit_rerun_jobs")
    .update({
      status: "running",
      started_at: job.started_at ?? nowIso(),
      updated_at: nowIso(),
      error_message: null,
    })
    .eq("id", job.id);
  if (job.status === "queued") {
    query = query.eq("status", "queued");
  } else if (job.status === "running") {
    query = query.eq("status", "running").lt("updated_at", staleBefore);
  } else {
    return false;
  }

  const { data, error } = await query.select("*");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

async function requeueStoreVisitRerunJob(
  supabase: SupabaseServiceClient,
  jobId: string,
  patch: Record<string, unknown> = {},
) {
  const { data, error } = await supabase
    .from("store_visit_rerun_jobs")
    .update({
      ...patch,
      status: "queued",
      updated_at: nowIso(),
    })
    .eq("id", jobId)
    .eq("status", "running")
    .select("*")
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "Failed to requeue rerun job");
  return normalizeJob(data as StoreVisitRerunJob);
}

async function updateJobFromMatchingProgress(
  supabase: SupabaseServiceClient,
  jobId: string,
  progress: StoreVisitMatchingRerunResult,
  jobProgress: StoreVisitRerunJobProgress,
) {
  const { error } = await supabase
    .from("store_visit_rerun_jobs")
    .update({
      total_visits: progress.selectedVisitCount,
      processed_visits: progress.matchedVisitIds.length
        + progress.skippedVisitIds.length
        + progress.permanentlyFailedVisitIds.length,
      skipped_visits: progress.skippedVisitIds.length,
      failed_visits: progress.failures.length,
      inserted_candidate_count: progress.insertedCandidateCount,
      deleted_snapshot_count: progress.deletedSnapshotCount,
      method_counts: progress.methodCounts,
      failures: progress.failures.slice(0, maxFailureRecords),
      progress: jobProgress,
      updated_at: nowIso(),
    })
    .eq("id", jobId);
  if (error) throw new Error(error.message);
}

async function completeMatchOnlyJob(input: {
  supabase: SupabaseServiceClient;
  jobId: string;
  result: StoreVisitMatchingRerunResult;
  progress: StoreVisitRerunJobProgress;
}) {
  const { data, error } = await input.supabase
    .from("store_visit_rerun_jobs")
    .update({
      status: "completed",
      total_visits: input.result.selectedVisitCount,
      processed_visits: input.progress.matched_visit_ids.length
        + input.progress.skipped_visit_ids.length
        + input.progress.permanently_failed_visit_ids.length,
      skipped_visits: input.progress.skipped_visit_ids.length,
      failed_visits: input.result.failures.length,
      inserted_candidate_count: input.result.insertedCandidateCount,
      deleted_snapshot_count: input.result.deletedSnapshotCount,
      method_counts: input.result.methodCounts,
      failures: input.result.failures.slice(0, maxFailureRecords),
      progress: { ...input.progress, quality_unsettled_count: 0 },
      completed_at: nowIso(),
      updated_at: nowIso(),
      error_message: null,
    })
    .eq("id", input.jobId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to complete rerun job");
  return normalizeJob(data as StoreVisitRerunJob);
}

async function loadActivePriceImageIds(supabase: SupabaseServiceClient, visitId: string) {
  const { data, error } = await supabase
    .from("offline_visit_images")
    .select("id")
    .eq("visit_id", visitId)
    .in("image_type", ["own_shelf", "competitor_shelf"])
    .is("deleted_at", null)
    .is("replaced_by_image_id", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => clean((row as { id?: unknown }).id)).filter(Boolean);
}

async function updateJobWithChildAiJobs(input: {
  supabase: SupabaseServiceClient;
  jobId: string;
  totalVisits: number;
  childAiJobs: StoreVisitRerunChildAiJob[];
  failures: StoreVisitRerunJobFailure[];
}) {
  const { data, error } = await input.supabase
    .from("store_visit_rerun_jobs")
    .update({
      total_visits: input.totalVisits,
      child_ai_jobs: input.childAiJobs,
      failures: input.failures.slice(0, maxFailureRecords),
      failed_visits: input.failures.length,
      processed_visits: input.failures.length,
      status: input.childAiJobs.length > 0 ? "running" : "completed",
      completed_at: input.childAiJobs.length > 0 ? null : nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", input.jobId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to update AI rerun job");
  return normalizeJob(data as StoreVisitRerunJob);
}

async function startAiReanalysisJob(input: {
  job: StoreVisitRerunJob;
  supabase: SupabaseServiceClient;
  requestUrl: string;
}) {
  const selector = selectorForRun(input.job);
  const visits = await selectStoreVisitMatchingRerunVisits(input.supabase, selector);
  const childAiJobs: StoreVisitRerunChildAiJob[] = [];
  const failures: StoreVisitRerunJobFailure[] = [];

  for (const visit of visits) {
    try {
      const imageIds = await loadActivePriceImageIds(input.supabase, visit.id);
      if (imageIds.length === 0) throw new Error("No active price images found for this Visit.");
      const created = await createStoreVisitAiJob({
        visitId: visit.id,
        jobType: "full_visit_reanalysis",
        imageIds,
        requestSnapshot: {
          source: "store_visit_monitor_rerun",
          parent_rerun_job_id: input.job.id,
          selector: input.job.selector,
        },
        supabase: input.supabase,
      });
      childAiJobs.push({ visitId: visit.id, visitCode: visit.visitCode, jobId: created.job.id });
    } catch (error) {
      failures.push({
        visitId: visit.id,
        visitCode: visit.visitCode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const updatedJob = await updateJobWithChildAiJobs({
    supabase: input.supabase,
    jobId: input.job.id,
    totalVisits: visits.length,
    childAiJobs,
    failures,
  });
  if (childAiJobs.length > 0) {
    // Wake multiple concrete child jobs so date-range AI rematch starts in parallel
    // instead of only the first Visit, while staying within global AI concurrency.
    const wakeJobs = childAiJobs.slice(0, maxAiReanalysisChildWakeCount);
    await Promise.all(wakeJobs.map((child) => triggerStoreVisitAiJobRunner({
      requestUrl: input.requestUrl,
      jobId: child.jobId,
    })));
  }
  return refreshStoreVisitRerunJobProgress({ job: updatedJob, supabase: input.supabase });
}

export async function refreshStoreVisitRerunJobProgress(input: {
  jobId?: string;
  job?: StoreVisitRerunJob;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const job = input.job ? normalizeJob(input.job) : await loadStoreVisitRerunJob({ jobId: input.jobId!, supabase });

  if (job.mode === "match_only" && (job.status === "running" || job.status === "queued")) {
    const matchedVisitIds = job.progress.matched_visit_ids;
    if (matchedVisitIds.length === 0) return job;
    try {
      // Read-only for UI: never rewrite progress here — a concurrent worker may have
      // advanced matched_visit_ids / failure_attempts since this snapshot was loaded.
      const unsettled = await countUnsettledSkuQualityForVisits({ supabase, visitIds: matchedVisitIds });
      if (unsettled === job.progress.quality_unsettled_count) return job;
      return {
        ...job,
        progress: { ...job.progress, quality_unsettled_count: unsettled },
      };
    } catch {
      return job;
    }
  }

  if (job.mode !== "ai_reanalysis" || job.child_ai_jobs.length === 0 || (job.status !== "running" && job.status !== "queued")) {
    return job;
  }

  const { data, error } = await supabase
    .from("store_visit_ai_jobs")
    .select("id,status")
    .in("id", job.child_ai_jobs.map((child) => child.jobId));
  if (error) throw new Error(error.message);
  const statusById = new Map((data ?? []).map((row) => [String((row as { id: unknown }).id), String((row as { status: unknown }).status)]));
  const completedChildren = job.child_ai_jobs.filter((child) => {
    const status = statusById.get(child.jobId);
    return status === "completed" || status === "failed";
  });
  const failedChildren = job.child_ai_jobs.filter((child) => statusById.get(child.jobId) === "failed");
  const completed = completedChildren.length >= job.child_ai_jobs.length;
  const failures = [
    ...job.failures,
    ...failedChildren.map((child) => ({
      visitId: child.visitId,
      visitCode: child.visitCode,
      error: "AI reanalysis job failed.",
    })),
  ];
  const { data: updated, error: updateError } = await supabase
    .from("store_visit_rerun_jobs")
    .update({
      processed_visits: job.failures.length + completedChildren.length,
      failed_visits: failures.length,
      failures: failures.slice(0, maxFailureRecords),
      status: completed ? "completed" : "running",
      completed_at: completed ? nowIso() : null,
      updated_at: nowIso(),
    })
    .eq("id", job.id)
    .select("*")
    .single();
  if (updateError || !updated) throw new Error(updateError?.message ?? "Failed to refresh rerun job progress");
  return normalizeJob(updated as StoreVisitRerunJob);
}

async function settleMatchOnlyQuality(input: {
  supabase: SupabaseServiceClient;
  matchedVisitIds: string[];
}) {
  const unsettledIds = await listUnsettledSkuCandidateIdsForVisits({
    supabase: input.supabase,
    visitIds: input.matchedVisitIds,
  });
  if (unsettledIds.length === 0) {
    return { unsettledCount: 0, claimed: 0 };
  }
  const priority = await runPriorityPriceQualityGateBatched({
    supabase: input.supabase,
    candidateIds: unsettledIds,
  });
  const remaining = await countUnsettledSkuQualityForVisits({
    supabase: input.supabase,
    visitIds: input.matchedVisitIds,
  });
  return { unsettledCount: remaining, claimed: priority.priority_claimed };
}

async function runMatchOnlyRerunJob(input: {
  job: StoreVisitRerunJob;
  supabase: SupabaseServiceClient;
  requestUrl: string;
}) {
  const { job, supabase, requestUrl } = input;
  const progressState = normalizeProgress(job.progress);
  const doneIds = doneVisitIds(progressState);
  const visitsSelected = await selectStoreVisitMatchingRerunVisits(supabase, selectorForRun(job));
  const remainingBefore = visitsSelected.filter((visit) => !doneIds.includes(visit.id)).length;

  // Matching already finished for all visits: drain quality only.
  if (remainingBefore === 0 && progressState.matched_visit_ids.length + progressState.skipped_visit_ids.length + progressState.permanently_failed_visit_ids.length > 0) {
    const settlement = await settleMatchOnlyQuality({
      supabase,
      matchedVisitIds: progressState.matched_visit_ids,
    });
    const nextProgress = { ...progressState, quality_unsettled_count: settlement.unsettledCount };
    if (settlement.unsettledCount === 0) {
      return {
        job: await completeMatchOnlyJob({
          supabase,
          jobId: job.id,
          result: {
            selectedVisitCount: visitsSelected.length,
            processedVisitCount: progressState.matched_visit_ids.length,
            skippedVisitCount: progressState.skipped_visit_ids.length,
            failedVisitCount: job.failures.length,
            insertedCandidateCount: job.inserted_candidate_count,
            deletedSnapshotCount: job.deleted_snapshot_count,
            methodCounts: job.method_counts,
            failures: job.failures,
            matchedVisitIds: progressState.matched_visit_ids,
            skippedVisitIds: progressState.skipped_visit_ids,
            permanentlyFailedVisitIds: progressState.permanently_failed_visit_ids,
            insertedSkuCandidateIds: [],
            failedVisitIdsThisRun: [],
          },
          progress: nextProgress,
        }),
        processed: 0,
      };
    }
    const refreshedJob = await requeueStoreVisitRerunJob(supabase, job.id, {
      progress: nextProgress,
      total_visits: visitsSelected.length,
      processed_visits: doneIds.length,
    });
    await triggerStoreVisitRerunJobRunner({
      requestUrl,
      jobId: job.id,
      detached: true,
    });
    return { job: refreshedJob, processed: settlement.claimed };
  }

  const gateway = createStoreVisitMatchingRerunGateway(supabase, { requestUrl });
  let visitsSinceProgressWrite = 0;
  const result = await rerunStoreVisitMatching(serializeSelector(selectorForRun(job)), gateway, {
    excludeVisitIds: doneIds,
    maxVisits: maxMatchOnlyVisitsPerRun,
    concurrency: matchOnlyConcurrency(),
    initialProgress: progressFromJob(job),
    async onVisitProgress(progress) {
      visitsSinceProgressWrite += 1;
      if (visitsSinceProgressWrite < progressUpdateEveryVisits) return;
      visitsSinceProgressWrite = 0;
      const draftProgress: StoreVisitRerunJobProgress = {
        matched_visit_ids: progress.matchedVisitIds,
        skipped_visit_ids: progress.skippedVisitIds,
        permanently_failed_visit_ids: progress.permanentlyFailedVisitIds,
        failure_attempts: progressState.failure_attempts,
        quality_unsettled_count: progressState.quality_unsettled_count,
      };
      await updateJobFromMatchingProgress(supabase, job.id, progress, draftProgress);
    },
  });

  const thisRunFailedIds = new Set(result.failedVisitIdsThisRun);
  const failuresToAttempt = result.failures.filter((failure) => thisRunFailedIds.has(failure.visitId));

  const applied = applyFailureAttempts(
    {
      matched_visit_ids: result.matchedVisitIds,
      skipped_visit_ids: result.skippedVisitIds,
      permanently_failed_visit_ids: result.permanentlyFailedVisitIds,
      failure_attempts: progressState.failure_attempts,
      quality_unsettled_count: progressState.quality_unsettled_count,
    },
    failuresToAttempt,
  );

  const failureByVisitId = new Map<string, StoreVisitRerunJobFailure>();
  for (const failure of result.failures) {
    if (result.matchedVisitIds.includes(failure.visitId) || result.skippedVisitIds.includes(failure.visitId)) {
      continue;
    }
    failureByVisitId.set(failure.visitId, failure);
  }
  result.failures = Array.from(failureByVisitId.values()).slice(0, maxFailureRecords);
  result.permanentlyFailedVisitIds = applied.progress.permanently_failed_visit_ids;
  result.failedVisitCount = result.failures.length;

  let nextProgress = applied.progress;
  if (result.matchedVisitIds.length > 0) {
    const settlement = await settleMatchOnlyQuality({
      supabase,
      matchedVisitIds: result.matchedVisitIds,
    });
    nextProgress = { ...nextProgress, quality_unsettled_count: settlement.unsettledCount };
  }

  const matchingComplete = isMatchingVisitsComplete({
    ...result,
    permanentlyFailedVisitIds: nextProgress.permanently_failed_visit_ids,
  });

  if (matchingComplete && nextProgress.quality_unsettled_count === 0) {
    return {
      job: await completeMatchOnlyJob({
        supabase,
        jobId: job.id,
        result,
        progress: nextProgress,
      }),
      processed: result.processedVisitCount,
    };
  }

  await updateJobFromMatchingProgress(supabase, job.id, result, nextProgress);
  const refreshedJob = await requeueStoreVisitRerunJob(supabase, job.id, {
    progress: nextProgress,
    total_visits: result.selectedVisitCount,
    processed_visits: nextProgress.matched_visit_ids.length
      + nextProgress.skipped_visit_ids.length
      + nextProgress.permanently_failed_visit_ids.length,
    skipped_visits: nextProgress.skipped_visit_ids.length,
    failed_visits: result.failures.length,
    inserted_candidate_count: result.insertedCandidateCount,
    deleted_snapshot_count: result.deletedSnapshotCount,
    method_counts: result.methodCounts,
    failures: result.failures.slice(0, maxFailureRecords),
  });
  await triggerStoreVisitRerunJobRunner({
    requestUrl,
    jobId: job.id,
    detached: true,
  });
  return { job: refreshedJob, processed: result.processedVisitCount };
}

export async function runStoreVisitRerunJob(input: {
  jobId: string | null;
  requestUrl: string;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const job = input.jobId
    ? await loadStoreVisitRerunJob({ jobId: input.jobId, supabase })
    : await loadNextRunnableJob(supabase);
  if (!job) return { job: null, processed: 0 };
  const claimed = await markJobRunning(supabase, job);
  if (!claimed) return { job: await refreshStoreVisitRerunJobProgress({ jobId: job.id, supabase }), processed: 0 };

  try {
    if (job.mode === "ai_reanalysis") {
      if (job.child_ai_jobs.length > 0) {
        return { job: await refreshStoreVisitRerunJobProgress({ job, supabase }), processed: 0 };
      }
      return { job: await startAiReanalysisJob({ job, supabase, requestUrl: input.requestUrl }), processed: 0 };
    }

    if (job.mode === "match_only") {
      return await runMatchOnlyRerunJob({ job, supabase, requestUrl: input.requestUrl });
    }

    return { job, processed: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await requeueStoreVisitRerunJob(supabase, job.id, { error_message: message });
    } catch {
      await failStoreVisitRerunJob({ jobId: job.id, message, supabase }).catch(() => undefined);
    }
    throw error;
  }
}

async function loadNextRunnableJob(supabase: SupabaseServiceClient) {
  const { data: queued, error: queuedError } = await supabase
    .from("store_visit_rerun_jobs")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1);
  if (queuedError) throw new Error(queuedError.message);
  const queuedRow = (queued ?? [])[0] as StoreVisitRerunJob | undefined;
  if (queuedRow) return normalizeJob(queuedRow);

  const staleBefore = new Date(Date.now() - STORE_VISIT_RERUN_STALE_MS).toISOString();
  const { data: stale, error: staleError } = await supabase
    .from("store_visit_rerun_jobs")
    .select("*")
    .eq("status", "running")
    .lt("updated_at", staleBefore)
    .order("updated_at", { ascending: true })
    .limit(1);
  if (staleError) throw new Error(staleError.message);
  const staleRow = (stale ?? [])[0] as StoreVisitRerunJob | undefined;
  return staleRow ? normalizeJob(staleRow) : null;
}

export async function failStoreVisitRerunJob(input: {
  jobId: string;
  message: string;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("store_visit_rerun_jobs")
    .update({
      status: "failed",
      error_message: input.message,
      completed_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", input.jobId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to fail rerun job");
  return normalizeJob(data as StoreVisitRerunJob);
}

export async function triggerStoreVisitRerunJobRunner(input: {
  requestUrl: string;
  jobId?: string | null;
  detached?: boolean;
}) {
  const secret = clean(process.env.CRON_SECRET);
  const jobId = clean(input.jobId) || null;
  if (!secret) {
    const run = () => {
      void runStoreVisitRerunJob({ jobId, requestUrl: input.requestUrl }).catch(async (error) => {
        if (!jobId) return;
        await failStoreVisitRerunJob({
          jobId,
          message: error instanceof Error ? error.message : String(error),
        }).catch(() => undefined);
      });
    };
    if (input.detached) {
      setTimeout(run, 0);
      return;
    }
    await runStoreVisitRerunJob({ jobId, requestUrl: input.requestUrl });
    return;
  }

  const url = new URL("/api/internal/store-visit-monitor/rerun-jobs/run", input.requestUrl);
  const request = fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(jobId ? { job_id: jobId } : {}),
  }).catch((error) => {
    console.error("[store-visit-rerun-jobs] failed to trigger runner", {
      job_id: jobId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  if (!input.detached) await request;
}
