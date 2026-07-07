import * as XLSX from "xlsx";
import { formatJakartaDateTimeSeconds, formatJakartaTime, formatPercent } from "@/lib/format";
import {
  getStoreVisitMonitorExportBatch,
  getStoreVisitMonitorExportCount,
  type StoreVisitMonitorFilters,
} from "@/lib/data";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type { StoreVisitMonitorExportJob } from "@/lib/types";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceClient>;

const exportJobStatuses = ["queued", "running"] as const;
const storeVisitMonitorExportBucket = "store-visits";
const storeVisitMonitorExportPrefix = "store-visit-monitor-exports";
const storeVisitMonitorExportBatchSize = 500;
const storeVisitMonitorExportHistoryLimit = 12;

function nowIso() {
  return new Date().toISOString();
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeFilterValue(value: unknown) {
  const nextValue = clean(value);
  return nextValue ? nextValue : undefined;
}

export function normalizeStoreVisitMonitorExportFilters(input: Record<string, unknown>) {
  const filters: Record<string, string> = {};
  const visitCode = normalizeFilterValue(input.visit_code);
  const storeName = normalizeFilterValue(input.store_name);
  const promoter = normalizeFilterValue(input.promoter);
  const analysisStatus = normalizeFilterValue(input.analysis_status);
  const dateFrom = normalizeFilterValue(input.date_from);
  const dateTo = normalizeFilterValue(input.date_to);

  if (visitCode) filters.visit_code = visitCode;
  if (storeName) filters.store_name = storeName;
  if (promoter) filters.promoter = promoter;
  if (analysisStatus) filters.analysis_status = analysisStatus;
  if (dateFrom) filters.date_from = dateFrom;
  if (dateTo) filters.date_to = dateTo;

  delete filters.page;
  delete filters.page_size;

  return filters;
}

function filtersToMonitorFilters(filters: Record<string, unknown>): StoreVisitMonitorFilters {
  return {
    visitCode: normalizeFilterValue(filters.visit_code),
    storeName: normalizeFilterValue(filters.store_name),
    promoter: normalizeFilterValue(filters.promoter),
    analysisStatus: normalizeFilterValue(filters.analysis_status),
    dateFrom: normalizeFilterValue(filters.date_from),
    dateTo: normalizeFilterValue(filters.date_to),
  };
}

function downloadName(job: StoreVisitMonitorExportJob) {
  const filters = job.filters ?? {};
  const dateFrom = normalizeFilterValue(filters.date_from);
  const dateTo = normalizeFilterValue(filters.date_to);
  const range = dateFrom && dateTo ? `${dateFrom}-${dateTo}` : new Date().toISOString().slice(0, 10);
  return `store-visit-monitor-${range}.xlsx`;
}

export function getStoreVisitMonitorExportDownloadName(job: StoreVisitMonitorExportJob) {
  return downloadName(job);
}

export function getStoreVisitMonitorExportDownloadPath(jobId: string) {
  return `/api/store-visit-monitor/export-jobs/${jobId}/download`;
}

function buildExportJobQuery(supabase: SupabaseServiceClient) {
  return supabase.from("store_visit_monitor_export_jobs").select("*");
}

function buildWorkbookBuffer(input: { locale: string; rows: Awaited<ReturnType<typeof getStoreVisitMonitorExportBatch>>["data"] }) {
  const rows = input.rows.map((visit) => ({
    "Visit Code": visit.visitCode ?? visit.visitId,
    Store: visit.storeName,
    "Visit date": visit.visitDate,
    Promoter: visit.promoter,
    "Analysis status": visit.analysisStatus ?? visit.visitStatus,
    "Full analysis time": formatDuration(visit.fullAnalysisTimeMs),
    "Image count": visit.imageCount,
    Success: visit.successCount,
    Failure: visit.failureCount,
    Retake: visit.retakeRequiredCount,
    Accuracy: formatPercent(visit.accuracy !== null ? visit.accuracy * 100 : null),
    "Auto-approval rate": formatPercent(visit.autoApprovalRate !== null ? visit.autoApprovalRate * 100 : null),
    "Average price deviation": formatPercent(visit.avgPriceDeviationRate !== null ? visit.avgPriceDeviationRate * 100 : null),
    "Started at": visit.startedAt ? formatJakartaTime(visit.startedAt) : "-",
    "Completed at": visit.completedAt ? formatJakartaTime(visit.completedAt) : "-",
    "Create time": formatJakartaDateTimeSeconds(visit.createdAt),
    "Update time": formatJakartaDateTimeSeconds(visit.updatedAt),
    "Details path": `/${input.locale}/mobile/offline-capture/${visit.visitId}`,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 18 },
    { wch: 28 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 18 },
    { wch: 22 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
    { wch: 40 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Visit analysis list");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function formatDuration(value: number | null) {
  if (value === null) return "-";
  if (value < 1000) return `${value} ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${(seconds / 60).toFixed(1)} min`;
}

export async function createStoreVisitMonitorExportJob(input: {
  filters: Record<string, unknown>;
  locale: string;
  requestedBy?: string | null;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const filters = normalizeStoreVisitMonitorExportFilters(input.filters);
  const { data, error } = await supabase
    .from("store_visit_monitor_export_jobs")
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
  if (error || !data) throw new Error(error?.message ?? "Failed to create store visit monitor export job");
  return data as StoreVisitMonitorExportJob;
}

export async function loadStoreVisitMonitorExportJob(input: {
  jobId: string;
  requestedBy?: string | null;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  let query = buildExportJobQuery(supabase).eq("id", input.jobId);
  if (input.requestedBy) query = query.eq("requested_by", input.requestedBy);
  const { data, error } = await query.single();
  if (error || !data) throw new Error(error?.message ?? "Store Visit Monitor export job not found");
  return data as StoreVisitMonitorExportJob;
}

export async function listStoreVisitMonitorExportJobs(input: {
  requestedBy: string;
  limit?: number;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const limit = Math.max(1, Math.min(input.limit ?? storeVisitMonitorExportHistoryLimit, storeVisitMonitorExportHistoryLimit));
  const { data, error } = await buildExportJobQuery(supabase)
    .eq("requested_by", input.requestedBy)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as StoreVisitMonitorExportJob[];
}

export async function createStoreVisitMonitorExportSignedUrl(input: {
  filePath: string;
  downloadName?: string;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const { data, error } = await supabase.storage
    .from(storeVisitMonitorExportBucket)
    .createSignedUrl(input.filePath, 60 * 30, {
      download: input.downloadName ?? true,
    });
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Failed to create export signed URL");
  return data.signedUrl;
}

export async function runStoreVisitMonitorExportJob(input: {
  jobId: string;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const job = await loadStoreVisitMonitorExportJob({ jobId: input.jobId, supabase });
  if (job.status === "completed") return { job, processed: job.exported_rows, remaining: 0 };
  if (job.status === "failed") return { job, processed: job.exported_rows, remaining: Math.max(0, job.total_rows - job.exported_rows) };

  const monitorFilters = filtersToMonitorFilters(job.filters);
  const dateFrom = monitorFilters.dateFrom || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dateTo = monitorFilters.dateTo || new Date().toISOString().slice(0, 10);
  const countResult = await getStoreVisitMonitorExportCount(monitorFilters, dateFrom, dateTo);
  if (countResult.error) throw new Error(countResult.error);

  const { data: claimedJobRows, error: claimError } = await supabase
    .from("store_visit_monitor_export_jobs")
    .update({
      status: "running",
      started_at: job.started_at ?? nowIso(),
      updated_at: nowIso(),
      error_message: null,
      total_rows: countResult.data,
      exported_rows: 0,
    })
    .eq("id", job.id)
    .in("status", exportJobStatuses)
    .select("*");
  if (claimError) throw new Error(claimError.message);
  if ((claimedJobRows ?? []).length === 0) {
    const latestJob = await loadStoreVisitMonitorExportJob({ jobId: job.id, supabase });
    return { job: latestJob, processed: latestJob.exported_rows, remaining: Math.max(0, latestJob.total_rows - latestJob.exported_rows) };
  }

  const rows = [];
  for (let offset = 0; offset < countResult.data; offset += storeVisitMonitorExportBatchSize) {
    const batchResult = await getStoreVisitMonitorExportBatch(
      monitorFilters,
      dateFrom,
      dateTo,
      offset,
      storeVisitMonitorExportBatchSize,
    );
    if (batchResult.error) throw new Error(batchResult.error);
    rows.push(...batchResult.data);
    const exportedRows = Math.min(offset + batchResult.data.length, countResult.data);
    const { error: progressError } = await supabase
      .from("store_visit_monitor_export_jobs")
      .update({
        exported_rows: exportedRows,
        total_rows: countResult.data,
        updated_at: nowIso(),
      })
      .eq("id", job.id);
    if (progressError) throw new Error(progressError.message);
    if (batchResult.data.length < storeVisitMonitorExportBatchSize) break;
  }

  const buffer = buildWorkbookBuffer({ locale: job.locale, rows });
  const filePath = `${storeVisitMonitorExportPrefix}/${job.id}.xlsx`;
  const { error: uploadError } = await supabase.storage
    .from(storeVisitMonitorExportBucket)
    .upload(filePath, buffer, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: true,
    });
  if (uploadError) throw new Error(uploadError.message);

  const { data: completedRows, error: completeError } = await supabase
    .from("store_visit_monitor_export_jobs")
    .update({
      status: "completed",
      file_path: filePath,
      file_size_bytes: buffer.byteLength,
      exported_rows: rows.length,
      total_rows: countResult.data,
      completed_at: nowIso(),
      updated_at: nowIso(),
      error_message: null,
    })
    .eq("id", job.id)
    .select("*")
    .single();
  if (completeError || !completedRows) throw new Error(completeError?.message ?? "Failed to finalize export job");
  return { job: completedRows as StoreVisitMonitorExportJob, processed: rows.length, remaining: Math.max(0, countResult.data - rows.length) };
}

export async function failStoreVisitMonitorExportJob(input: {
  jobId: string;
  message: string;
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("store_visit_monitor_export_jobs")
    .update({
      status: "failed",
      error_message: input.message,
      updated_at: nowIso(),
      completed_at: nowIso(),
    })
    .eq("id", input.jobId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to mark export job failed");
  return data as StoreVisitMonitorExportJob;
}

export async function triggerStoreVisitMonitorExportJobRunner(input: {
  requestUrl: string;
  jobId: string;
}) {
  const secret = clean(process.env.CRON_SECRET);
  if (!secret) {
    await runStoreVisitMonitorExportJob({ jobId: input.jobId });
    return;
  }

  const url = new URL("/api/internal/store-visit-monitor/export-jobs/run", input.requestUrl);
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ job_id: input.jobId }),
  }).catch((error) => {
    console.error("[store-visit-monitor-export-jobs] failed to trigger runner", {
      job_id: input.jobId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
