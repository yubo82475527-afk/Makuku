"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

type ExportFilters = {
  visit_code?: string;
  store_name?: string;
  promoter?: string;
  analysis_status?: string;
  date_from?: string;
  date_to?: string;
};

type JobState = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  total_rows: number;
  exported_rows: number;
  error_message: string | null;
  download_url: string | null;
};

export function StoreVisitMonitorExportButton({
  locale,
  filters,
}: {
  locale: string;
  filters: ExportFilters;
}) {
  const [job, setJob] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
    };
  }, []);

  async function pollJob(jobId: string) {
    const response = await fetch(`/api/store-visit-monitor/export-jobs/${jobId}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? "Failed to load export job");
    const nextJob = payload.job as JobState;
    setJob(nextJob);
    if (nextJob.status === "completed" || nextJob.status === "failed") {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }
  }

  async function createJob() {
    setError(null);
    const response = await fetch("/api/store-visit-monitor/export-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale, filters }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? "Failed to create export job");
    const nextJob = payload.job as JobState;
    setJob(nextJob);
    if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
    pollTimerRef.current = window.setInterval(() => {
      void pollJob(nextJob.id).catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : "Failed to poll export job");
      });
    }, 2000);
    await pollJob(nextJob.id);
  }

  async function handleExportClick() {
    try {
      await createJob();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to create export job");
    }
  }

  const totalRows = Math.max(job?.total_rows ?? 0, 0);
  const exportedRows = Math.max(job?.exported_rows ?? 0, 0);
  const progress = totalRows > 0 ? Math.min(100, Math.round(exportedRows / totalRows * 100)) : 0;

  return (
    <div className="flex flex-col items-end gap-2">
      {job?.status === "completed" && job.download_url ? (
        <a
          href={job.download_url}
          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Download file
        </a>
      ) : (
        <Button
          type="button"
          onClick={handleExportClick}
          className="bg-white text-slate-700 hover:bg-slate-50 border border-slate-300"
          disabled={job?.status === "queued" || job?.status === "running"}
        >
          {job?.status === "queued" ? "Preparing export..." : job?.status === "running" ? "Exporting..." : "Export Excel"}
        </Button>
      )}

      {job?.status === "running" ? (
        <div className="w-56">
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-slate-900 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-1 text-xs text-slate-500">Exporting {exportedRows} / {totalRows || "..."}</div>
        </div>
      ) : null}

      {job?.status === "queued" ? <div className="text-xs text-slate-500">Preparing export...</div> : null}
      {job?.status === "completed" ? <div className="text-xs text-emerald-600">Export complete</div> : null}
      {job?.status === "failed" ? <div className="text-xs text-rose-600">Export failed: {job.error_message ?? "Unknown error"}</div> : null}
      {error ? <div className="text-xs text-rose-600">{error}</div> : null}
    </div>
  );
}
