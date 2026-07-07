"use client";

import { Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

type ExportJob = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  total_rows: number;
  exported_rows: number;
  error_message: string | null;
  created_at: string;
  download_url: string | null;
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

export function StoreVisitMonitorExportMenu({ locale }: { locale: string }) {
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    async function loadJobs() {
      try {
        const response = await fetch("/api/store-visit-monitor/export-jobs", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Failed to load export tasks");
        if (disposed) return;
        setJobs(Array.isArray(payload.jobs) ? payload.jobs as ExportJob[] : []);
        setError(null);
      } catch (nextError) {
        if (!disposed) setError(nextError instanceof Error ? nextError.message : "Failed to load export tasks");
      } finally {
        if (!disposed) setLoading(false);
      }
    }

    void loadJobs();
    const timer = window.setInterval(() => {
      void loadJobs();
    }, 10000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  const runningCount = jobs.filter((job) => job.status === "queued" || job.status === "running").length;
  const title = locale === "zh" ? "Exports" : "Exports";
  const emptyText = locale === "zh" ? "No export tasks yet" : "No export tasks yet";

  return (
    <details className="relative shrink-0">
      <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-2 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        {runningCount > 0 ? (
          <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[11px] text-white">{runningCount}</span>
        ) : null}
      </summary>
      <div className="absolute right-0 top-10 z-30 w-[360px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
        </div>

        {error ? <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}

        {!error && jobs.length === 0 ? (
          <div className="rounded-md bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
            {loading ? "Loading..." : emptyText}
          </div>
        ) : null}

        <div className="max-h-[420px] space-y-2 overflow-y-auto">
          {jobs.map((job) => {
            const totalRows = Math.max(job.total_rows, 0);
            const exportedRows = Math.max(job.exported_rows, 0);

            return (
              <div key={job.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-slate-900">{job.id}</div>
                    <div className="mt-1 text-[11px] text-slate-500">Created: {formatTime(job.created_at)}</div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                    {job.status}
                  </span>
                </div>

                <div className="mt-2 text-[11px] text-slate-500">
                  Progress: {exportedRows} / {totalRows || "..."}
                </div>

                {job.error_message ? (
                  <div className="mt-2 rounded-md bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700">{job.error_message}</div>
                ) : null}

                {job.status === "completed" && job.download_url ? (
                  <a
                    href={job.download_url}
                    className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </a>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
}
