import { createStoreVisitAiJob, triggerStoreVisitAiJobRunner } from "@/lib/store-visit-ai-jobs";
import { rerunStoreVisitMatching, type StoreVisitMatchingRerunRequest, type StoreVisitMatchingRerunResult, type StoreVisitMatchingRerunSelector } from "@/lib/store-visit-matching-rerun";
import { createStoreVisitMatchingRerunGateway, selectStoreVisitMatchingRerunVisits } from "@/lib/store-visit-matching-rerun-gateway";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type {
  StoreVisitRerunChildAiJob,
  StoreVisitRerunJob,
  StoreVisitRerunJobFailure,
  StoreVisitRerunJobMode,
} from "@/lib/types";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceClient>;

const activeJobStatuses = ["queued", "running"] as const;
const maxFailureRecords = 200;
const maxMatchOnlyVisitsPerRun = 25;
const historyLimit = 10;

function nowIso() {
  return new Date().toISOString();
}

function clean(value: unknown) {
  return String(value ?? "").trim();
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

function normalizeJob(row: StoreVisitRerunJob): StoreVisitRerunJob {
  return {
    ...row,
    selector: row.selector ?? {},
    method_counts: normalizeMethodCounts(row.method_counts),
    child_ai_jobs: normalizeChildAiJobs(row.child_ai_jobs),
    failures: normalizeFailures(row.failures),
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

function progressFromJob(job: StoreVisitRerunJob): Partial<Omit<StoreVisitMatchingRerunResult, "selectedVisitCount">> {
  return {
    processedVisitCount: Math.max(0, job.processed_visits - job.skipped_visits - job.failed_visits),
    skippedVisitCount: job.skipped_visits,
    failedVisitCount: job.failed_visits,
    insertedCandidateCount: job.inserted_candidate_count,
    deletedSnapshotCount: job.deleted_snapshot_count,
    methodCounts: job.method_counts,
    failures: job.failures,
  };
}

function consumedVisitCount(result: StoreVisitMatchingRerunResult) {
  return result.processedVisitCount + result.skippedVisitCount + result.failedVisitCount;
}

function isMatchingResultComplete(result: StoreVisitMatchingRerunResult) {
  return consumedVisitCount(result) >= result.selectedVisitCount;
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
  const { data, error } = await supabase
    .from("store_visit_rerun_jobs")
    .update({
      status: "running",
      started_at: job.started_at ?? nowIso(),
      updated_at: nowIso(),
      error_message: null,
    })
    .eq("id", job.id)
    .in("status", activeJobStatuses)
    .select("*");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

async function updateJobFromMatchingProgress(supabase: SupabaseServiceClient, jobId: string, progress: StoreVisitMatchingRerunResult) {
  const { error } = await supabase
    .from("store_visit_rerun_jobs")
    .update({
      total_visits: progress.selectedVisitCount,
      processed_visits: progress.processedVisitCount + progress.skippedVisitCount + progress.failedVisitCount,
      skipped_visits: progress.skippedVisitCount,
      failed_visits: progress.failedVisitCount,
      inserted_candidate_count: progress.insertedCandidateCount,
      deleted_snapshot_count: progress.deletedSnapshotCount,
      method_counts: progress.methodCounts,
      failures: progress.failures.slice(0, maxFailureRecords),
      updated_at: nowIso(),
    })
    .eq("id", jobId);
  if (error) throw new Error(error.message);
}

async function completeJobFromMatchingResult(supabase: SupabaseServiceClient, jobId: string, result: StoreVisitMatchingRerunResult) {
  const { data, error } = await supabase
    .from("store_visit_rerun_jobs")
    .update({
      status: "completed",
      total_visits: result.selectedVisitCount,
      processed_visits: result.processedVisitCount + result.skippedVisitCount + result.failedVisitCount,
      skipped_visits: result.skippedVisitCount,
      failed_visits: result.failedVisitCount,
      inserted_candidate_count: result.insertedCandidateCount,
      deleted_snapshot_count: result.deletedSnapshotCount,
      method_counts: result.methodCounts,
      failures: result.failures.slice(0, maxFailureRecords),
      completed_at: nowIso(),
      updated_at: nowIso(),
      error_message: null,
    })
    .eq("id", jobId)
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
    await triggerStoreVisitAiJobRunner({ requestUrl: input.requestUrl, jobId: null });
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
  if (job.mode !== "ai_reanalysis" || job.child_ai_jobs.length === 0 || (job.status !== "running" && job.status !== "queued")) return job;

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
  if (!claimed && job.status !== "running") return { job: await refreshStoreVisitRerunJobProgress({ jobId: job.id, supabase }), processed: 0 };

  if (job.mode === "ai_reanalysis") {
    if (job.child_ai_jobs.length > 0) {
      return { job: await refreshStoreVisitRerunJobProgress({ job, supabase }), processed: 0 };
    }
    return { job: await startAiReanalysisJob({ job, supabase, requestUrl: input.requestUrl }), processed: 0 };
  }

  if (job.mode === "match_only") {
    const gateway = createStoreVisitMatchingRerunGateway(supabase);
    const result = await rerunStoreVisitMatching(serializeSelector(selectorForRun(job)), gateway, {
      startOffset: job.processed_visits,
      maxVisits: maxMatchOnlyVisitsPerRun,
      initialProgress: progressFromJob(job),
      async onVisitProgress(progress) {
        await updateJobFromMatchingProgress(supabase, job.id, progress);
      },
    });
    if (isMatchingResultComplete(result)) {
      return { job: await completeJobFromMatchingResult(supabase, job.id, result), processed: result.processedVisitCount };
    }
    const refreshedJob = await loadStoreVisitRerunJob({ jobId: job.id, supabase });
    await triggerStoreVisitRerunJobRunner({
      requestUrl: input.requestUrl,
      jobId: job.id,
      detached: true,
    });
    return { job: refreshedJob, processed: result.processedVisitCount };
  }

  return { job, processed: 0 };
}

async function loadNextRunnableJob(supabase: SupabaseServiceClient) {
  const { data, error } = await supabase
    .from("store_visit_rerun_jobs")
    .select("*")
    .in("status", activeJobStatuses)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as StoreVisitRerunJob | undefined;
  return row ? normalizeJob(row) : null;
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
  jobId: string;
  detached?: boolean;
}) {
  const secret = clean(process.env.CRON_SECRET);
  if (!secret) {
    const run = () => {
      void runStoreVisitRerunJob({ jobId: input.jobId, requestUrl: input.requestUrl }).catch(async (error) => {
        await failStoreVisitRerunJob({
          jobId: input.jobId,
          message: error instanceof Error ? error.message : String(error),
        }).catch(() => undefined);
      });
    };
    if (input.detached) {
      setTimeout(run, 0);
      return;
    }
    await runStoreVisitRerunJob({ jobId: input.jobId, requestUrl: input.requestUrl });
    return;
  }

  const url = new URL("/api/internal/store-visit-monitor/rerun-jobs/run", input.requestUrl);
  const request = fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ job_id: input.jobId }),
  }).catch((error) => {
    console.error("[store-visit-rerun-jobs] failed to trigger runner", {
      job_id: input.jobId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  if (!input.detached) await request;
}
