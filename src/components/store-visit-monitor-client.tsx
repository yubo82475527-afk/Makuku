"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StoreVisitMonitorExportButton } from "@/components/store-visit-monitor-export-button";
import { StoreVisitMatchingRerunDialog, type MatchingRerunTarget } from "@/components/store-visit-matching-rerun-dialog";
import StoreVisitMonitorLoading from "@/app/[locale]/store-visit-monitor/loading";
import { QueryForm, QuerySubmitButton } from "@/components/query-form";
import { Badge, Button, Card, DataNotice, EmptyState, MetricCard } from "@/components/ui";
import { formatJakartaDateTimeSeconds, formatPercent } from "@/lib/format";
import type { StoreVisitMonitorResult } from "@/lib/data";
import type { Dictionary } from "@/lib/i18n/get-dictionary";

type StoreVisitMonitorPayload = {
  data: StoreVisitMonitorResult;
  error: string | null;
  isDemo: boolean;
};

function formatDuration(value: number | null) {
  if (value === null) return "-";
  if (value < 1000) return `${value} ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${(seconds / 60).toFixed(1)} min`;
}

function statusTone(status: string | null) {
  if (status === "failed" || status === "action_required") return "medium";
  if (status === "completed") return "low";
  return "neutral";
}

const monitorFilterKeys = ["visit_code", "store_name", "promoter", "analysis_status", "date_from", "date_to"] as const;

export function StoreVisitMonitorClient({
  locale,
  dict,
  queryString,
  canRerunMatching,
}: {
  locale: string;
  dict: Dictionary;
  queryString: string;
  canRerunMatching: boolean;
}) {
  const searchParams = useMemo(() => new URLSearchParams(queryString), [queryString]);
  const [payload, setPayload] = useState<StoreVisitMonitorPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [rerunTarget, setRerunTarget] = useState<MatchingRerunTarget | null>(null);
  const [metricsExpanded, setMetricsExpanded] = useState(false);
  const isZh = locale === "zh";

  useEffect(() => {
    const controller = new AbortController();
    const monitorUrl = `/api/store-visit-monitor${queryString ? `?${queryString}` : ""}`;
    const qualityUrl = `/api/store-visit-monitor${queryString ? `?${queryString}&include_quality=1` : "?include_quality=1"}`;

    async function loadMonitor() {
      try {
        const response = await fetch(monitorUrl, {
          cache: "no-store",
          signal: controller.signal,
        });
        const nextPayload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(nextPayload.error ?? "Failed to load store visit monitor");
        setPayload(nextPayload as StoreVisitMonitorPayload);

        const qualityResponse = await fetch(qualityUrl, {
          cache: "no-store",
          signal: controller.signal,
        });
        const qualityPayload = await qualityResponse.json().catch(() => ({}));
        if (qualityResponse.ok && !controller.signal.aborted) {
          setPayload(qualityPayload as StoreVisitMonitorPayload);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : "Failed to load store visit monitor");
      }
    }

    void loadMonitor();
    return () => controller.abort();
  }, [queryString, reloadKey]);

  if (!payload) {
    return (
      <>
        <DataNotice dict={dict} error={loadError} />
        <StoreVisitMonitorLoading />
      </>
    );
  }

  const monitor = payload.data;
  const getFilter = (key: string) => searchParams.get(key) ?? "";
  const exportFilters = Object.fromEntries(
    monitorFilterKeys.map((key) => [key, getFilter(key)]).filter(([, value]) => value),
  ) as Record<string, string>;
  const pageHref = (nextPage: number) => {
    const query = new URLSearchParams();
    for (const key of monitorFilterKeys) {
      const value = getFilter(key);
      if (value) query.set(key, value);
    }
    query.set("page", String(nextPage));
    query.set("page_size", String(monitor.pagination.pageSize));
    return `/${locale}/store-visit-monitor?${query.toString()}`;
  };

  return (
    <>
      <DataNotice dict={dict} error={payload.error} />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Store Visit Monitor</h2>
            <p className="mt-1 text-sm text-slate-500">
              {monitor.filters.isDefaultRecent24Hours ? "Recent 24 hours" : `${monitor.filters.dateFrom} to ${monitor.filters.dateTo}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMetricsExpanded((value) => !value)}
            aria-expanded={metricsExpanded}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {metricsExpanded ? (isZh ? "收起指标" : "Collapse metrics") : (isZh ? "展开指标" : "Expand metrics")}
            {metricsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </Card>

      {metricsExpanded ? (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-5">
            <MetricCard label="Visits analyzed" value={monitor.summary.visitsAnalyzed} />
            <MetricCard label="P50 visit analysis time" value={formatDuration(monitor.summary.p50)} />
            <MetricCard label="P95 visit analysis time" value={formatDuration(monitor.summary.p95)} />
            <MetricCard label="Action required / failed count" value={monitor.summary.actionRequiredOrFailedCount} />
            <MetricCard label="Average images per visit" value={monitor.summary.averageImagesPerVisit ?? "-"} />
          </div>

          <Card className="mb-4">
            <div className="mb-3">
              <h2 className="font-semibold">Price parsing quality</h2>
              <p className="mt-1 text-sm text-slate-500">
                Unchanged H5 flow. These metrics summarize the current page against final approved store price snapshots.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <MetricCard label="Accuracy" value={formatPercent(monitor.quality.accuracy !== null ? monitor.quality.accuracy * 100 : null)} />
              <MetricCard label="Auto-approval rate" value={formatPercent(monitor.quality.autoApprovalRate !== null ? monitor.quality.autoApprovalRate * 100 : null)} />
              <MetricCard label="Average price deviation" value={formatPercent(monitor.quality.avgPriceDeviationRate !== null ? monitor.quality.avgPriceDeviationRate * 100 : null)} />
            </div>
          </Card>
        </>
      ) : null}

      <Card className="mb-4">
        <QueryForm className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          <DateRangeFilter locale={locale} dateFrom={monitor.filters.dateFrom} dateTo={monitor.filters.dateTo} />
          <LabeledTextFilter label={locale === "zh" ? "巡店编号" : "Visit code"} name="visit_code" placeholder={locale === "zh" ? "输入巡店编号" : "Search visit"} defaultValue={getFilter("visit_code")} />
          <LabeledTextFilter label={locale === "zh" ? "门店名称" : "Store name"} name="store_name" placeholder={locale === "zh" ? "搜索门店" : "Search store"} defaultValue={getFilter("store_name")} />
          <LabeledTextFilter label={locale === "zh" ? "促销员" : "Promoter"} name="promoter" placeholder={locale === "zh" ? "搜索促销员" : "Search promoter"} defaultValue={getFilter("promoter")} />
          <LabeledSelectFilter label={locale === "zh" ? "分析状态" : "Analysis status"} name="analysis_status" defaultValue={getFilter("analysis_status")}>
            <option value="">{locale === "zh" ? "全部状态" : "All status"}</option>
            <option value="pending">pending</option>
            <option value="analyzing">analyzing</option>
            <option value="completed">completed</option>
            <option value="partial">partial</option>
            <option value="action_required">action_required</option>
            <option value="failed">failed</option>
          </LabeledSelectFilter>
          <div className="flex items-center gap-2">
            <QuerySubmitButton
              idleLabel={dict.common.filter}
              pendingLabel={locale === "zh" ? "筛选中..." : "Filtering..."}
              className="whitespace-nowrap"
            />
            <Link href={`/${locale}/store-visit-monitor`} className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {locale === "zh" ? "重置" : "Reset"}
            </Link>
          </div>
        </QueryForm>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Visit analysis list</h2>
            <div className="mt-1 text-sm text-slate-500">
              {monitor.pagination.total === 0
                ? "0 visits"
                : `Showing ${monitor.pagination.from}-${monitor.pagination.to} of ${monitor.pagination.total} visits`}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canRerunMatching && !payload.isDemo ? (
              <Button
                type="button"
                onClick={() => setRerunTarget({ kind: "date_range", dateFrom: monitor.filters.dateFrom, dateTo: monitor.filters.dateTo })}
              >
                Rerun matching
              </Button>
            ) : null}
            <StoreVisitMonitorExportButton locale={locale} filters={exportFilters} />
          </div>
        </div>

        {monitor.visits.length === 0 ? <EmptyState text="No store visits found for this range." /> : null}

        {monitor.visits.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1680px] text-left text-sm [&_th]:whitespace-nowrap">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Visit Code</th>
                  <th className="py-2 pr-3">Store</th>
                  <th className="py-2 pr-3">Visit date</th>
                  <th className="py-2 pr-3">Promoter</th>
                  <th className="py-2 pr-3">Analysis status</th>
                  <th className="py-2 pr-3">Full analysis time</th>
                  <th className="py-2 pr-3">Image count</th>
                  <th className="py-2 pr-3">Success</th>
                  <th className="py-2 pr-3">Failure</th>
                  <th className="py-2 pr-3">Retake</th>
                  <th className="py-2 pr-3">Accuracy</th>
                  <th className="py-2 pr-3">Auto-approval rate</th>
                  <th className="py-2 pr-3">Average price deviation</th>
                  <th className="py-2 pr-3">Started at</th>
                  <th className="py-2 pr-3">Completed at</th>
                  <th className="py-2 pr-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {monitor.visits.map((visit) => (
                  <tr key={visit.visitId}>
                    <td className="whitespace-nowrap py-3 pr-3 font-medium">{visit.visitCode ?? visit.visitId}</td>
                    <td className="py-3 pr-3">{visit.storeName}</td>
                    <td className="whitespace-nowrap py-3 pr-3">{visit.visitDate}</td>
                    <td className="whitespace-nowrap py-3 pr-3">{visit.promoter}</td>
                    <td className="whitespace-nowrap py-3 pr-3">
                      <Badge tone={statusTone(visit.analysisStatus)}>{visit.analysisStatus ?? visit.visitStatus}</Badge>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-3 font-medium">{formatDuration(visit.fullAnalysisTimeMs)}</td>
                    <td className="whitespace-nowrap py-3 pr-3">{visit.imageCount}</td>
                    <td className="whitespace-nowrap py-3 pr-3">{visit.successCount}</td>
                    <td className="whitespace-nowrap py-3 pr-3">{visit.failureCount}</td>
                    <td className="whitespace-nowrap py-3 pr-3">{visit.retakeRequiredCount}</td>
                    <td className="whitespace-nowrap py-3 pr-3">{formatPercent(visit.accuracy !== null ? visit.accuracy * 100 : null)}</td>
                    <td className="whitespace-nowrap py-3 pr-3">{formatPercent(visit.autoApprovalRate !== null ? visit.autoApprovalRate * 100 : null)}</td>
                    <td className="whitespace-nowrap py-3 pr-3">{formatPercent(visit.avgPriceDeviationRate !== null ? visit.avgPriceDeviationRate * 100 : null)}</td>
                    <td className="whitespace-nowrap py-3 pr-3">{visit.startedAt ? formatJakartaDateTimeSeconds(visit.startedAt) : "-"}</td>
                    <td className="whitespace-nowrap py-3 pr-3">{visit.completedAt ? formatJakartaDateTimeSeconds(visit.completedAt) : "-"}</td>
                    <td className="whitespace-nowrap py-3 pr-3">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/${locale}/mobile/offline-capture/${visit.visitId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-blue-700 underline-offset-2 hover:underline"
                        >
                          Open details
                        </Link>
                        {canRerunMatching && !payload.isDemo ? (
                          <button
                            type="button"
                            onClick={() => setRerunTarget({ kind: "visit", visitId: visit.visitId, visitCode: visit.visitCode })}
                            className="font-medium text-blue-700 underline-offset-2 hover:underline"
                          >
                            Rerun matching
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-sm">
          <div className="text-slate-600">
            {monitor.pagination.from}-{monitor.pagination.to} / {monitor.pagination.total}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <form method="get" className="flex items-center gap-2">
              {monitorFilterKeys.map((key) => {
                const value = getFilter(key);
                return value ? <input key={key} type="hidden" name={key} value={value} /> : null;
              })}
              <select
                name="page_size"
                defaultValue={String(monitor.pagination.pageSize)}
                className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-500"
              >
                <option value="25">25 / page</option>
                <option value="50">50 / page</option>
                <option value="100">100 / page</option>
              </select>
              <input type="hidden" name="page" value="1" />
              <Button type="submit" className="bg-white text-slate-700 hover:bg-slate-50 border border-slate-300">
                Apply
              </Button>
            </form>
            {monitor.pagination.hasPrevious ? (
              <Link
                href={pageHref(monitor.pagination.page - 1)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 font-medium text-slate-700 hover:bg-slate-50"
              >
                Previous
              </Link>
            ) : (
              <span className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-3 font-medium text-slate-400">
                Previous
              </span>
            )}
            <span className="inline-flex h-9 items-center px-2 text-slate-600">
              Page {monitor.pagination.page} of {monitor.pagination.totalPages}
            </span>
            {monitor.pagination.hasNext ? (
              <Link
                href={pageHref(monitor.pagination.page + 1)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 font-medium text-slate-700 hover:bg-slate-50"
              >
                Next
              </Link>
            ) : (
              <span className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-3 font-medium text-slate-400">
                Next
              </span>
            )}
          </div>
        </div>
      </Card>
      {rerunTarget ? (
        <StoreVisitMatchingRerunDialog
          key={rerunTarget.kind === "visit" ? rerunTarget.visitId : `${rerunTarget.dateFrom}:${rerunTarget.dateTo}`}
          target={rerunTarget}
          locale={locale}
          isDemo={payload.isDemo}
          onClose={() => setRerunTarget(null)}
          onSucceeded={() => {
            setReloadKey((current) => current + 1);
            window.dispatchEvent(new Event("store-visit-rerun-jobs:refresh"));
          }}
        />
      ) : null}
    </>
  );
}

function LabeledTextFilter({
  label,
  name,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  placeholder: string;
  defaultValue: string;
}) {
  return (
    <label className="flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200">
      <span className="mr-2 shrink-0 text-xs font-medium text-slate-500">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent py-2 outline-none"
      />
    </label>
  );
}

function LabeledSelectFilter({
  label,
  name,
  defaultValue,
  children,
}: {
  label: string;
  name: string;
  defaultValue: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200">
      <span className="mr-2 shrink-0 text-xs font-medium text-slate-500">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="min-w-0 flex-1 bg-transparent py-2 outline-none"
      >
        {children}
      </select>
    </label>
  );
}

function DateRangeFilter({ locale, dateFrom, dateTo }: { locale: string; dateFrom: string; dateTo: string }) {
  const label = locale === "zh" ? "巡店日期范围" : "Visit date range";
  const fromLabel = locale === "zh" ? "开始日期" : "Start date";
  const toLabel = locale === "zh" ? "结束日期" : "End date";
  const separator = locale === "zh" ? "至" : "to";

  return (
    <fieldset aria-label={label} className="flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200">
      <input name="date_from" type="date" defaultValue={dateFrom} aria-label={fromLabel} className="min-w-0 flex-1 bg-transparent py-2 outline-none [color-scheme:light]" />
      <span className="mx-2 shrink-0 text-xs font-medium text-slate-400">{separator}</span>
      <input name="date_to" type="date" defaultValue={dateTo} aria-label={toLabel} className="min-w-0 flex-1 bg-transparent py-2 outline-none [color-scheme:light]" />
    </fieldset>
  );
}
