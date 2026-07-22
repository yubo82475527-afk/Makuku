import {
  buildOperatorPriceReviewExport,
  buildOperatorPriceReviewExportDownloadName,
  normalizeOperatorPriceReviewExportFilters,
} from "@/lib/operator-price-review-export";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type { OperatorPriceReviewExportJob } from "@/lib/types";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceClient>;

const activeStatuses = ["queued", "running"] as const;
const bucket = "store-visits";
const prefix = "operator-price-review-exports";
const historyLimit = 12;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function jobQuery(supabase: SupabaseServiceClient) {
  return supabase.from("operator_price_review_export_jobs").select("*");
}

export { normalizeOperatorPriceReviewExportFilters };

export function getOperatorPriceReviewExportDownloadPath(jobId: string) {
  return `/api/operator-price-reviews/export-jobs/${jobId}/download`;
}

export function getOperatorPriceReviewExportDownloadName(job: OperatorPriceReviewExportJob) {
  const filters = normalizeOperatorPriceReviewExportFilters(job.filters);
  return buildOperatorPriceReviewExportDownloadName({ state: filters.state, createdAt: job.created_at });
}

export async function createOperatorPriceReviewExportJob(input: {
  filters: Record<string, unknown>;
  locale: string;
  requestedBy?: string | null;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("operator_price_review_export_jobs")
    .insert({
      status: "queued",
      filters: normalizeOperatorPriceReviewExportFilters(input.filters),
      locale: clean(input.locale) || "zh",
      requested_by: input.requestedBy ?? null,
      total_rows: 0,
      exported_rows: 0,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create price review export job");
  return data as OperatorPriceReviewExportJob;
}

export async function loadOperatorPriceReviewExportJob(input: {
  jobId: string;
  requestedBy?: string | null;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  let query = jobQuery(supabase).eq("id", input.jobId);
  if (input.requestedBy) query = query.eq("requested_by", input.requestedBy);
  const { data, error } = await query.single();
  if (error || !data) throw new Error(error?.message ?? "Price review export job not found");
  return data as OperatorPriceReviewExportJob;
}

export async function listOperatorPriceReviewExportJobs(input: {
  requestedBy: string;
  limit?: number;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const limit = Math.max(1, Math.min(input.limit ?? historyLimit, historyLimit));
  const { data, error } = await jobQuery(supabase)
    .eq("requested_by", input.requestedBy)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as OperatorPriceReviewExportJob[];
}

export async function createOperatorPriceReviewExportSignedUrl(input: {
  filePath: string;
  downloadName?: string;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(input.filePath, 60 * 30, {
    download: input.downloadName ?? true,
  });
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Failed to create price review export signed URL");
  return data.signedUrl;
}

export async function runOperatorPriceReviewExportJob(input: { jobId: string; supabase?: SupabaseServiceClient }) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const job = await loadOperatorPriceReviewExportJob({ jobId: input.jobId, supabase });
  if (job.status === "completed" || job.status === "failed") {
    return { job, processed: job.exported_rows, remaining: Math.max(0, job.total_rows - job.exported_rows) };
  }

  const { data: claimedRows, error: claimError } = await supabase
    .from("operator_price_review_export_jobs")
    .update({ status: "running", started_at: job.started_at ?? nowIso(), updated_at: nowIso(), error_message: null })
    .eq("id", job.id)
    .in("status", activeStatuses)
    .select("*");
  if (claimError) throw new Error(claimError.message);
  if ((claimedRows ?? []).length === 0) {
    const latestJob = await loadOperatorPriceReviewExportJob({ jobId: job.id, supabase });
    return { job: latestJob, processed: latestJob.exported_rows, remaining: Math.max(0, latestJob.total_rows - latestJob.exported_rows) };
  }

  const exportResult = await buildOperatorPriceReviewExport({ filters: job.filters, locale: job.locale });
  const filePath = `${prefix}/${job.id}.xlsx`;
  const { error: progressError } = await supabase
    .from("operator_price_review_export_jobs")
    .update({ total_rows: exportResult.rowCount, exported_rows: exportResult.rowCount, updated_at: nowIso() })
    .eq("id", job.id);
  if (progressError) throw new Error(progressError.message);

  const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, exportResult.xlsx, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    upsert: true,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data: completed, error: completeError } = await supabase
    .from("operator_price_review_export_jobs")
    .update({
      status: "completed",
      file_path: filePath,
      file_size_bytes: Buffer.byteLength(exportResult.xlsx),
      total_rows: exportResult.rowCount,
      exported_rows: exportResult.rowCount,
      completed_at: nowIso(),
      updated_at: nowIso(),
      error_message: null,
    })
    .eq("id", job.id)
    .select("*")
    .single();
  if (completeError || !completed) throw new Error(completeError?.message ?? "Failed to finalize price review export job");
  return { job: completed as OperatorPriceReviewExportJob, processed: exportResult.rowCount, remaining: 0 };
}

export async function failOperatorPriceReviewExportJob(input: {
  jobId: string;
  message: string;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("operator_price_review_export_jobs")
    .update({ status: "failed", error_message: input.message, updated_at: nowIso(), completed_at: nowIso() })
    .eq("id", input.jobId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to mark price review export job failed");
  return data as OperatorPriceReviewExportJob;
}

export async function triggerOperatorPriceReviewExportJobRunner(input: { requestUrl: string; jobId: string }) {
  const secret = clean(process.env.CRON_SECRET);
  if (!secret) {
    try {
      await runOperatorPriceReviewExportJob({ jobId: input.jobId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      try { await failOperatorPriceReviewExportJob({ jobId: input.jobId, message }); } catch {}
      console.error("[operator-price-review-export-jobs] inline runner failed", { job_id: input.jobId, error: message });
    }
    return;
  }

  const url = new URL("/api/internal/operator-price-reviews/export-jobs/run", input.requestUrl);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ job_id: input.jobId }),
    });
    if (!response.ok) throw new Error(`Price review export runner returned ${response.status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    try { await failOperatorPriceReviewExportJob({ jobId: input.jobId, message }); } catch {}
    console.error("[operator-price-review-export-jobs] failed to trigger runner", { job_id: input.jobId, error: message });
  }
}
