"use client";

import { Download } from "lucide-react";
import { useState } from "react";

export function PriceSnapshotExportButton({
  locale,
  filters,
}: {
  locale: string;
  filters: Record<string, string | undefined>;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function createExportJob() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/price-snapshots/export-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, filters }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Export failed");
      setMessage(
        locale === "zh"
          ? "导出任务已创建，请在顶部 Exports 中查看进度并下载。"
          : "Export task created. Open Exports to check progress and download.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-right">
      <button
        type="button"
        disabled={loading}
        onClick={createExportJob}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        <Download className="h-4 w-4" />
        {loading ? (locale === "zh" ? "创建中..." : "Creating...") : (locale === "zh" ? "导出 CSV" : "Export CSV")}
      </button>
      {message ? <p className="mt-1 max-w-xs text-xs text-slate-500">{message}</p> : null}
    </div>
  );
}
