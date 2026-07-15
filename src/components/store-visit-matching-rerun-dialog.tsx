"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export type MatchingRerunTarget =
  | { kind: "date_range"; dateFrom: string; dateTo: string }
  | { kind: "visit"; visitId: string; visitCode: string | null };

export function StoreVisitMatchingRerunDialog({
  target,
  locale,
  isDemo,
  onClose,
  onSucceeded,
}: {
  target: MatchingRerunTarget;
  locale: string;
  isDemo: boolean;
  onClose: () => void;
  onSucceeded: () => void;
}) {
  const isZh = locale === "zh";
  const [dateFrom, setDateFrom] = useState(target.kind === "date_range" ? target.dateFrom : "");
  const [dateTo, setDateTo] = useState(target.kind === "date_range" ? target.dateTo : "");
  const [runAiAnalysis, setRunAiAnalysis] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "succeeded" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (status === "submitting" || isDemo) return;
    setStatus("submitting");
    setError(null);
    try {
      const body = target.kind === "visit"
        ? { visit_id: target.visitId, mode: runAiAnalysis ? "ai_reanalysis" : "match_only", locale }
        : { date_from: dateFrom, date_to: dateTo, mode: runAiAnalysis ? "ai_reanalysis" : "match_only", locale };
      const response = await fetch("/api/store-visit-monitor/rerun-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Failed to create rerun job");
      setStatus("succeeded");
      onSucceeded();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to create rerun job");
      setStatus("failed");
    }
  }

  const submitLabel = status === "submitting"
    ? (isZh ? "创建任务中..." : "Creating job...")
    : runAiAnalysis
      ? (isZh ? "创建 AI 重解析任务" : "Create AI reanalysis job")
      : (isZh ? "创建匹配重跑任务" : "Create matching rerun job");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="matching-rerun-title">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl">
        <h2 id="matching-rerun-title" className="text-lg font-semibold text-slate-950">
          {isZh ? "重新处理 Visit" : "Rerun Visit processing"}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {isZh
            ? "默认只复用已有图片解析结果，重跑 SKU 匹配、价格快照和审核状态；勾选后会重新调用图片 AI 解析。任务创建后无需停留在本弹窗等待。"
            : "By default this reuses stored image parsing results to rebuild SKU matching, price snapshots, and review state. Check the box to run image AI again. The job runs in the background."}
        </p>

        {target.kind === "visit" ? (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            Visit: <span className="font-medium">{target.visitCode ?? target.visitId}</span>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="text-sm text-slate-700">
              <span className="mb-1 block">{isZh ? "开始日期" : "Date from"}</span>
              <input className="h-9 w-full rounded-md border border-slate-300 px-3" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block">{isZh ? "结束日期" : "Date to"}</span>
              <input className="h-9 w-full rounded-md border border-slate-300 px-3" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
          </div>
        )}

        <label className="mt-4 flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-1"
            checked={runAiAnalysis}
            onChange={(event) => setRunAiAnalysis(event.target.checked)}
            disabled={status === "submitting" || status === "succeeded"}
          />
          <span>
            <span className="block font-medium text-slate-900">
              {isZh ? "重新调用图片 AI 解析" : "Run image AI again"}
            </span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">
              {isZh
                ? "不勾选：只重跑匹配关系，速度更快且不产生新的图片 AI 调用。勾选：重新解析图片，耗时更长。"
                : "Unchecked reruns matching only and is faster. Checked reparses images and takes longer."}
            </span>
          </span>
        </label>

        {isDemo ? <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{isZh ? "演示数据不可执行重跑。" : "Rerun is disabled for demo data."}</div> : null}
        {error ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        {status === "succeeded" ? (
          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {isZh ? "任务已创建，可在右上角任务菜单查看进度。" : "Job created. Check progress from the task menu."}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" onClick={onClose} className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" disabled={status === "submitting"}>
            {status === "succeeded" ? (isZh ? "关闭" : "Close") : (isZh ? "取消" : "Cancel")}
          </Button>
          {status !== "succeeded" ? (
            <Button type="button" onClick={submit} disabled={status === "submitting" || isDemo || (target.kind === "date_range" && (!dateFrom || !dateTo))}>
              {submitLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
