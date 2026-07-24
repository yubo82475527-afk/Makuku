"use client";

import { Download, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState, type ToggleEvent } from "react";

type ExportJob = {
  kind: "store_visit" | "price_snapshot" | "operator_price_review";
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  total_rows: number;
  exported_rows: number;
  error_message: string | null;
  created_at: string;
  download_url: string | null;
  export_view?: "visit" | "promoter" | "store";
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function taskLabel(job: ExportJob, locale: string) {
  if (job.kind === "price_snapshot") return locale === "zh" ? "市场价格" : "Market Price";
  if (job.kind === "operator_price_review") return locale === "zh" ? "价格审核" : "Price Review";
  if (job.export_view === "promoter") return locale === "zh" ? "巡店记录·按导购" : "Store Visit · By promoter";
  if (job.export_view === "store") return locale === "zh" ? "巡店记录·按门店" : "Store Visit · By store";
  return locale === "zh" ? "巡店记录" : "Store Visit Records";
}

export function StoreVisitMonitorExportMenu({ locale }: { locale: string }) {
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadJobs = useCallback(async (isDisposed: () => boolean) => {
    setLoading(true);
    try {
      const [visitResponse, priceResponse, reviewResponse] = await Promise.all([
        fetch("/api/store-visit-monitor/export-jobs", { cache: "no-store" }),
        fetch("/api/price-snapshots/export-jobs", { cache: "no-store" }),
        fetch("/api/operator-price-reviews/export-jobs", { cache: "no-store" }),
      ]);
      const [visitPayload, pricePayload, reviewPayload] = await Promise.all([
        visitResponse.json().catch(() => ({})),
        priceResponse.json().catch(() => ({})),
        reviewResponse.json().catch(() => ({})),
      ]);
      if (isDisposed()) return;

      const visitJobs = visitResponse.ok
        ? Array.isArray(visitPayload.jobs)
          ? visitPayload.jobs.map((job: Omit<ExportJob, "kind">) => ({ ...job, kind: "store_visit" as const }))
          : []
        : [];
      const priceJobs = priceResponse.ok
        ? Array.isArray(pricePayload.jobs)
          ? pricePayload.jobs.map((job: Omit<ExportJob, "kind">) => ({ ...job, kind: "price_snapshot" as const }))
          : []
        : [];
      const reviewJobs = reviewResponse.ok
        ? Array.isArray(reviewPayload.jobs)
          ? reviewPayload.jobs.map((job: Omit<ExportJob, "kind">) => ({ ...job, kind: "operator_price_review" as const }))
          : []
        : [];
      const nextError = [
        visitResponse.ok ? null : (visitPayload.error ?? "Failed to load visit export tasks"),
        priceResponse.ok ? null : (pricePayload.error ?? "Failed to load price export tasks"),
        reviewResponse.ok ? null : (reviewPayload.error ?? "Failed to load price review export tasks"),
      ].filter(Boolean).join("; ");
      setJobs([...visitJobs, ...priceJobs, ...reviewJobs].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)));
      setError(nextError || null);
    } catch (nextError) {
      if (!isDisposed()) setError(nextError instanceof Error ? nextError.message : "Failed to load export tasks");
    } finally {
      if (!isDisposed()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let disposed = false;
    const timer = window.setTimeout(() => void loadJobs(() => disposed), 0);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [loadJobs, open]);

  useEffect(() => {
    const shouldPoll = open && jobs.some((job) => job.status === "queued" || job.status === "running");
    if (!shouldPoll) return;

    let disposed = false;
    const timer = window.setInterval(() => {
      void loadJobs(() => disposed);
    }, 10000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [jobs, loadJobs, open]);

  function handleToggle(event: ToggleEvent<HTMLDetailsElement>) {
    setOpen(event.currentTarget.open);
  }

  const runningCount = jobs.filter((job) => job.status === "queued" || job.status === "running").length;
  const emptyText = locale === "zh" ? "暂无导出任务" : "No export tasks yet";

  return (
    <details className="relative shrink-0" onToggle={handleToggle}>
      <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-2 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <span>{locale === "zh" ? "导出" : "Exports"}</span>
        {runningCount > 0 ? (
          <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[11px] text-white">{runningCount}</span>
        ) : null}
      </summary>
      <div className="absolute right-0 top-10 z-30 w-[360px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">{locale === "zh" ? "导出" : "Exports"}</div>
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
        </div>

        {error ? <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}

        {!error && jobs.length === 0 ? (
          <div className="rounded-md bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
            {loading ? (locale === "zh" ? "加载中..." : "Loading...") : emptyText}
          </div>
        ) : null}

        <div className="max-h-[420px] space-y-2 overflow-y-auto">
          {jobs.map((job) => {
            const totalRows = Math.max(job.total_rows, 0);
            const exportedRows = Math.max(job.exported_rows, 0);

            return (
              <div key={`${job.kind}-${job.id}`} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-slate-900">{job.id}</div>
                    <div className="mt-1 text-[11px] text-slate-500">{taskLabel(job, locale)}</div>
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
