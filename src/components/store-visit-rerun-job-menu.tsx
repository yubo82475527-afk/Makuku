"use client";

import { useCallback, useEffect, useMemo, useState, type ToggleEvent } from "react";
import { Badge } from "@/components/ui";
import type { StoreVisitRerunJob } from "@/lib/types";

const refreshEventName = "store-visit-rerun-jobs:refresh";

function isActiveJob(job: StoreVisitRerunJob) {
  return job.status === "queued" || job.status === "running";
}

function selectorText(job: StoreVisitRerunJob) {
  const selector = job.selector ?? {};
  if (typeof selector.visit_code === "string" && selector.visit_code) return selector.visit_code;
  if (typeof selector.visit_id === "string" && selector.visit_id) return selector.visit_id;
  const dateFrom = typeof selector.date_from === "string" ? selector.date_from : "";
  const dateTo = typeof selector.date_to === "string" ? selector.date_to : "";
  if (dateFrom || dateTo) return `${dateFrom || "-"} ~ ${dateTo || "-"}`;
  return "-";
}

function statusTone(status: StoreVisitRerunJob["status"]) {
  if (status === "failed") return "medium";
  if (status === "completed") return "low";
  return "neutral";
}

function createdAtText(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function StoreVisitRerunJobMenu({
  locale,
  refreshSignal = 0,
}: {
  locale: string;
  refreshSignal?: number;
}) {
  const isZh = locale === "zh";
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<StoreVisitRerunJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCount = useMemo(() => jobs.filter(isActiveJob).length, [jobs]);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/store-visit-monitor/rerun-jobs", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Failed to load rerun jobs");
      setJobs(Array.isArray(payload.jobs) ? payload.jobs : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load rerun jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void loadJobs(), 0);
    return () => window.clearTimeout(timer);
  }, [loadJobs, open]);

  useEffect(() => {
    if (refreshSignal <= 0) return;
    const timer = window.setTimeout(() => void loadJobs(), 0);
    return () => window.clearTimeout(timer);
  }, [loadJobs, refreshSignal]);

  useEffect(() => {
    if (!open) return;
    const hasActiveJob = jobs.some(isActiveJob);
    if (!hasActiveJob) return;
    const timer = window.setInterval(() => void loadJobs(), 10000);
    return () => window.clearInterval(timer);
  }, [jobs, loadJobs, open]);

  useEffect(() => {
    function handleRefresh() {
      void loadJobs();
    }
    window.addEventListener(refreshEventName, handleRefresh);
    return () => window.removeEventListener(refreshEventName, handleRefresh);
  }, [loadJobs]);

  function handleToggle(event: ToggleEvent<HTMLDetailsElement>) {
    setOpen(event.currentTarget.open);
  }

  return (
    <details className="relative shrink-0" onToggle={handleToggle}>
      <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-2 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        {isZh ? "任务" : "Tasks"}
        {activeCount > 0 ? <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[11px] text-white">{activeCount}</span> : null}
      </summary>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[420px] rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-xl">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="font-semibold text-slate-950">{isZh ? "任务" : "Tasks"}</div>
              <div className="text-xs text-slate-500">{isZh ? "最近 10 个匹配/AI 重解析任务" : "Latest 10 matching / AI reanalysis jobs"}</div>
            </div>
            <button type="button" onClick={() => void loadJobs()} className="text-xs font-medium text-blue-700 hover:underline" disabled={loading}>
              {loading ? (isZh ? "刷新中..." : "Refreshing...") : (isZh ? "刷新" : "Refresh")}
            </button>
          </div>

          {error ? <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
          {loading && jobs.length === 0 ? <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">{isZh ? "加载中..." : "Loading..."}</div> : null}
          {!loading && jobs.length === 0 ? <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">{isZh ? "暂无重跑任务" : "No rerun jobs yet"}</div> : null}

          <div className="max-h-[520px] space-y-3 overflow-y-auto">
            {jobs.map((job) => (
              <div key={job.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-950">
                      {job.mode === "ai_reanalysis"
                        ? (isZh ? "AI 重解析" : "AI reanalysis")
                        : job.mode === "match_only"
                          ? (isZh ? "匹配重跑" : "Matching rerun")
                          : job.mode}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{selectorText(job)}</div>
                  </div>
                  <Badge tone={statusTone(job.status)}>{job.status}</Badge>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-md bg-slate-50 px-2 py-1.5">
                    <div className="text-slate-500">{isZh ? "总 Visit" : "Total"}</div>
                    <div className="font-semibold text-slate-950">{job.total_visits}</div>
                  </div>
                  <div className="rounded-md bg-slate-50 px-2 py-1.5">
                    <div className="text-slate-500">{isZh ? "已匹配" : "Matched"}</div>
                    <div className="font-semibold text-slate-950">{job.progress?.matched_visit_ids?.length ?? Math.max(0, job.processed_visits - job.skipped_visits - job.failed_visits)}</div>
                  </div>
                  <div className="rounded-md bg-slate-50 px-2 py-1.5">
                    <div className="text-slate-500">{isZh ? "失败" : "Failed"}</div>
                    <div className="font-semibold text-slate-950">{job.failed_visits}</div>
                  </div>
                </div>

                {job.mode === "match_only" && (job.progress?.quality_unsettled_count ?? 0) > 0 ? (
                  <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                    {isZh ? "质量未结案" : "Quality unsettled"}: {job.progress.quality_unsettled_count}
                  </div>
                ) : null}

                <div className="mt-2 text-xs text-slate-500">
                  {isZh ? "创建时间" : "Created"}: {createdAtText(job.created_at)}
                </div>

                {job.failures.length > 0 ? (
                  <div className="mt-3 rounded-md border border-rose-100 bg-rose-50 px-2 py-2 text-xs text-rose-800">
                    <div className="font-medium">{isZh ? "失败明细" : "Failures"}</div>
                    <ul className="mt-1 space-y-1">
                      {job.failures.slice(0, 10).map((failure) => (
                        <li key={`${job.id}-${failure.visitId}`}>
                          {failure.visitCode ?? failure.visitId}: {failure.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </details>
  );
}
