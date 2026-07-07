"use client";

import { useState } from "react";

type ExportFilters = {
  visit_code?: string;
  store_name?: string;
  promoter?: string;
  analysis_status?: string;
  date_from?: string;
  date_to?: string;
};

function messages(locale: string) {
  if (locale === "en") {
    return {
      idle: "Export Visit analysis list",
      loading: "Creating task...",
      success: "Export task created. Open Exports in the header to check progress and download.",
      errorFallback: "Failed to create export task",
    };
  }
  return {
    idle: "Export Visit analysis list",
    loading: "创建任务中...",
    success: "导出任务已创建，请在顶部 Exports 中查看进度并下载。",
    errorFallback: "创建导出任务失败",
  };
}

export function StoreVisitMonitorExportButton({
  locale,
  filters,
}: {
  locale: string;
  filters: ExportFilters;
}) {
  const text = messages(locale);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExportClick() {
    setIsSubmitting(true);
    setNotice(null);
    setError(null);

    try {
      const response = await fetch("/api/store-visit-monitor/export-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, filters }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? text.errorFallback);
      setNotice(text.success);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : text.errorFallback);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleExportClick}
        disabled={isSubmitting}
        className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? text.loading : text.idle}
      </button>
      {notice ? <div className="max-w-xs text-right text-xs text-emerald-600">{notice}</div> : null}
      {error ? <div className="max-w-xs text-right text-xs text-rose-600">{error}</div> : null}
    </div>
  );
}
