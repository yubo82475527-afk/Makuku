import {
  buildPriceSnapshotExport,
  buildPriceSnapshotExportDownloadName,
  normalizePriceSnapshotExportFilters,
} from "@/lib/price-snapshot-export";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type { PriceSnapshotExportJob } from "@/lib/types";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceClient>;

const exportJobStatuses = ["queued", "running"] as const;
const priceSnapshotExportBucket = "store-visits";
const priceSnapshotExportPrefix = "price-snapshot-exports";
const priceSnapshotExportHistoryLimit = 12;

function nowIso() {
  return new Date().toISOString();
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function buildExportJobQuery(supabase: SupabaseServiceClient) {
  return supabase.from("price_snapshot_export_jobs").select("*");
}

export { normalizePriceSnapshotExportFilters };

export function getPriceSnapshotExportDownloadPath(jobId: string) {
  return `/api/price-snapshots/export-jobs/${jobId}/download`;
}

export function getPriceSnapshotExportDownloadName(job: PriceSnapshotExportJob) {
  return buildPriceSnapshotExportDownloadName({ createdAt: job.created_at });
}

export async function createPriceSnapshotExportJob(input: {
  filters: Record<string, unknown>;
  locale: string;
  requestedBy?: string | null;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const filters = normalizePriceSnapshotExportFilters(input.filters);
  const { data, error } = await supabase
    .from("price_snapshot_export_jobs")
    .insert({
      status: "queued",
      filters,
      locale: clean(input.locale) || "zh",
      requested_by: input.requestedBy ?? null,
      total_rows: 0,
      exported_rows: 0,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create price export job");
  return data as PriceSnapshotExportJob;
}

export async function loadPriceSnapshotExportJob(input: {
  jobId: string;
  requestedBy?: string | null;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  let query = buildExportJobQuery(supabase).eq("id", input.jobId);
  if (input.requestedBy) query = query.eq("requested_by", input.requestedBy);
  const { data, error } = await query.single();
  if (error || !data) throw new Error(error?.message ?? "Price export job not found");
  return data as PriceSnapshotExportJob;
}

export async function listPriceSnapshotExportJobs(input: {
  requestedBy: string;
  limit?: number;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const limit = Math.max(1, Math.min(input.limit ?? priceSnapshotExportHistoryLimit, priceSnapshotExportHistoryLimit));
  const { data, error } = await buildExportJobQuery(supabase)
    .eq("requested_by", input.requestedBy)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as PriceSnapshotExportJob[];
}

export async function createPriceSnapshotExportSignedUrl(input: {
  filePath: string;
  downloadName?: string;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const { data, error } = await supabase.storage
    .from(priceSnapshotExportBucket)
    .createSignedUrl(input.filePath, 60 * 30, {
      download: input.downloadName ?? true,
    });
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Failed to create price export signed URL");
  return data.signedUrl;
}

export async function runPriceSnapshotExportJob(input: {
  jobId: string;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const job = await loadPriceSnapshotExportJob({ jobId: input.jobId, supabase });
  if (job.status === "completed") return { job, processed: job.exported_rows, remaining: 0 };
  if (job.status === "failed") {
    return { job, processed: job.exported_rows, remaining: Math.max(0, job.total_rows - job.exported_rows) };
  }

  const { data: claimedJobRows, error: claimError } = await supabase
    .from("price_snapshot_export_jobs")
    .update({
      status: "running",
      started_at: job.started_at ?? nowIso(),
      updated_at: nowIso(),
      error_message: null,
    })
    .eq("id", job.id)
    .in("status", exportJobStatuses)
    .select("*");
  if (claimError) throw new Error(claimError.message);
  if ((claimedJobRows ?? []).length === 0) {
    const latestJob = await loadPriceSnapshotExportJob({ jobId: job.id, supabase });
    return {
      job: latestJob,
      processed: latestJob.exported_rows,
      remaining: Math.max(0, latestJob.total_rows - latestJob.exported_rows),
    };
  }

  const exportResult = await buildPriceSnapshotExport({
    filters: job.filters,
    locale: job.locale,
    supabase,
    onProgress: async (progress) => {
      const { error } = await supabase
        .from("price_snapshot_export_jobs")
        .update({
          total_rows: progress.totalRows,
          exported_rows: progress.exportedRows,
          updated_at: nowIso(),
        })
        .eq("id", job.id);
      if (error) throw new Error(error.message);
    },
  });
  const filePath = `${priceSnapshotExportPrefix}/${job.id}.csv`;

  const { error: progressError } = await supabase
    .from("price_snapshot_export_jobs")
    .update({
      total_rows: exportResult.rowCount,
      exported_rows: exportResult.rowCount,
      updated_at: nowIso(),
    })
    .eq("id", job.id);
  if (progressError) throw new Error(progressError.message);

  const { error: uploadError } = await supabase.storage
    .from(priceSnapshotExportBucket)
    .upload(filePath, exportResult.csv, {
      contentType: "text/csv;charset=utf-8",
      upsert: true,
    });
  if (uploadError) throw new Error(uploadError.message);

  const { data: completedRows, error: completeError } = await supabase
    .from("price_snapshot_export_jobs")
    .update({
      status: "completed",
      file_path: filePath,
      file_size_bytes: Buffer.byteLength(exportResult.csv, "utf8"),
      total_rows: exportResult.rowCount,
      exported_rows: exportResult.rowCount,
      completed_at: nowIso(),
      updated_at: nowIso(),
      error_message: null,
    })
    .eq("id", job.id)
    .select("*")
    .single();
  if (completeError || !completedRows) throw new Error(completeError?.message ?? "Failed to finalize price export job");
  return { job: completedRows as PriceSnapshotExportJob, processed: exportResult.rowCount, remaining: 0 };
}

export async function failPriceSnapshotExportJob(input: {
  jobId: string;
  message: string;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("price_snapshot_export_jobs")
    .update({
      status: "failed",
      error_message: input.message,
      updated_at: nowIso(),
      completed_at: nowIso(),
    })
    .eq("id", input.jobId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to mark price export job failed");
  return data as PriceSnapshotExportJob;
}

export async function triggerPriceSnapshotExportJobRunner(input: {
  requestUrl: string;
  jobId: string;
}) {
  const secret = clean(process.env.CRON_SECRET);
  if (!secret) {
    try {
      await runPriceSnapshotExportJob({ jobId: input.jobId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      try {
        await failPriceSnapshotExportJob({ jobId: input.jobId, message });
      } catch {}
      console.error("[price-snapshot-export-jobs] inline runner failed", {
        job_id: input.jobId,
        error: message,
      });
    }
    return;
  }

  const url = new URL("/api/internal/price-snapshots/export-jobs/run", input.requestUrl);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ job_id: input.jobId }),
    });
    if (!response.ok) throw new Error(`Price export runner returned ${response.status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    try {
      await failPriceSnapshotExportJob({ jobId: input.jobId, message });
    } catch {}
    console.error("[price-snapshot-export-jobs] failed to trigger runner", {
      job_id: input.jobId,
      error: message,
    });
  }
}
