"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StoreVisitMonitorExportButton } from "@/components/store-visit-monitor-export-button";
import { StoreVisitMatchingRerunDialog, type MatchingRerunTarget } from "@/components/store-visit-matching-rerun-dialog";
import StoreVisitMonitorLoading from "@/app/[locale]/store-visit-monitor/loading";
import { QueryForm, QuerySubmitButton } from "@/components/query-form";
import { Badge, Card, DataNotice, EmptyState, MetricCard } from "@/components/ui";
import { formatJakartaDateTimeSeconds, formatPercent } from "@/lib/format";
import type { StoreVisitMonitorPagination, StoreVisitMonitorResult } from "@/lib/data";
import type { Dictionary } from "@/lib/i18n/get-dictionary";

type StoreVisitMonitorPayload = {
  data: StoreVisitMonitorResult;
  error: string | null;
  isDemo: boolean;
};

type ListView = "visit" | "promoter" | "store";

const ANALYSIS_STATUS_OPTIONS = [
  "pending",
  "analyzing",
  "completed",
  "partial",
  "action_required",
  "failed",
] as const;

function formatDuration(value: number | null, isZh: boolean) {
  if (value === null) return "-";
  if (value < 1000) return isZh ? `${value} 毫秒` : `${value} ms`;
  const seconds = value / 1000;
  if (seconds < 60) return isZh ? `${seconds.toFixed(1)} 秒` : `${seconds.toFixed(1)} s`;
  return isZh ? `${(seconds / 60).toFixed(1)} 分钟` : `${(seconds / 60).toFixed(1)} min`;
}

function statusTone(status: string | null) {
  if (status === "failed" || status === "action_required") return "medium";
  if (status === "completed") return "low";
  return "neutral";
}

function analysisStatusLabel(status: string | null | undefined, isZh: boolean) {
  const value = String(status ?? "").trim();
  if (!value) return "-";
  if (!isZh) return value;
  switch (value) {
    case "pending":
      return "待处理";
    case "analyzing":
      return "分析中";
    case "completed":
      return "已完成";
    case "partial":
      return "部分完成";
    case "action_required":
      return "需处理";
    case "failed":
      return "失败";
    default:
      return value;
  }
}

const monitorFilterKeys = ["visit_code", "store_name", "promoter", "analysis_status", "date_from", "date_to"] as const;

function parseListView(value: string | null): ListView {
  if (value === "promoter" || value === "store") return value;
  return "visit";
}

function emptySummaryPagination(page: number, pageSize: number): StoreVisitMonitorPagination {
  return {
    page,
    pageSize,
    total: 0,
    totalPages: 1,
    from: 0,
    to: 0,
    hasPrevious: false,
    hasNext: false,
  };
}

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
  const listView = parseListView(searchParams.get("view"));
  const [payload, setPayload] = useState<StoreVisitMonitorPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [rerunTarget, setRerunTarget] = useState<MatchingRerunTarget | null>(null);
  const [metricsExpanded, setMetricsExpanded] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const isZh = locale === "zh";

  useEffect(() => {
    const controller = new AbortController();
    const monitorUrl = queryString ? `/api/store-visit-monitor?${queryString}` : "/api/store-visit-monitor";
    const qualityParams = new URLSearchParams(queryString);
    qualityParams.set("include_quality", "1");
    const qualityUrl = `/api/store-visit-monitor?${qualityParams.toString()}`;

    function mergeVisitListPayload(
      current: StoreVisitMonitorPayload | null,
      next: StoreVisitMonitorPayload,
    ): StoreVisitMonitorPayload {
      // Visit/quality requests do not load summaries. Never wipe promoter/store rows
      // that a faster summary_only response already wrote into state.
      if (!current?.data) return next;
      return {
        ...next,
        data: {
          ...next.data,
          promoterSummary: current.data.promoterSummary ?? [],
          storeSummary: current.data.storeSummary ?? [],
          promoterSummaryPagination: current.data.promoterSummaryPagination ?? next.data.promoterSummaryPagination,
          storeSummaryPagination: current.data.storeSummaryPagination ?? next.data.storeSummaryPagination,
        },
      };
    }

    async function loadMonitor() {
      try {
        const response = await fetch(monitorUrl, {
          cache: "no-store",
          signal: controller.signal,
        });
        const nextPayload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(nextPayload.error ?? (isZh ? "巡店记录加载失败" : "Failed to load store visit monitor"));
        if (controller.signal.aborted) return;
        setPayload((current) => mergeVisitListPayload(current, nextPayload as StoreVisitMonitorPayload));

        const qualityResponse = await fetch(qualityUrl, {
          cache: "no-store",
          signal: controller.signal,
        });
        const qualityPayload = await qualityResponse.json().catch(() => ({}));
        if (qualityResponse.ok && !controller.signal.aborted) {
          setPayload((current) => mergeVisitListPayload(current, qualityPayload as StoreVisitMonitorPayload));
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : (isZh ? "巡店记录加载失败" : "Failed to load store visit monitor"));
      }
    }

    void loadMonitor();
    return () => controller.abort();
  }, [queryString, reloadKey, isZh]);

  useEffect(() => {
    if (listView !== "promoter" && listView !== "store") return;

    const controller = new AbortController();
    const summaryParams = new URLSearchParams(queryString);
    summaryParams.set("summary_only", "1");
    if (listView === "promoter") {
      summaryParams.set("promoter_summary", "1");
      summaryParams.delete("store_summary");
    } else {
      summaryParams.set("store_summary", "1");
      summaryParams.delete("promoter_summary");
    }
    const summaryUrl = `/api/store-visit-monitor?${summaryParams.toString()}`;

    async function loadSummaries() {
      setSummaryLoading(true);
      // Clear previous summary so filter/page changes don't show stale rows
      // while the new summary_only request is in flight.
      setPayload((current) => {
        if (!current?.data) return current;
        const emptyPage = emptySummaryPagination(
          Number(searchParams.get("page") || "1") || 1,
          Number(searchParams.get("page_size") || String(current.data.pagination.pageSize) || "50") || 50,
        );
        return {
          ...current,
          data: {
            ...current.data,
            ...(listView === "promoter"
              ? { promoterSummary: [], promoterSummaryPagination: emptyPage }
              : { storeSummary: [], storeSummaryPagination: emptyPage }),
          },
        };
      });
      try {
        const response = await fetch(summaryUrl, {
          cache: "no-store",
          signal: controller.signal,
        });
        const nextPayload = await response.json().catch(() => ({}));
        if (!response.ok || controller.signal.aborted) return;
        const summaryData = nextPayload as StoreVisitMonitorPayload;
        setPayload((current) => {
          if (!current?.data) return summaryData;
          return {
            ...current,
            data: {
              ...current.data,
              promoterSummary: listView === "promoter"
                ? (summaryData.data?.promoterSummary ?? [])
                : (current.data.promoterSummary ?? []),
              storeSummary: listView === "store"
                ? (summaryData.data?.storeSummary ?? [])
                : (current.data.storeSummary ?? []),
              promoterSummaryPagination: listView === "promoter"
                ? (summaryData.data?.promoterSummaryPagination ?? current.data.promoterSummaryPagination)
                : current.data.promoterSummaryPagination,
              storeSummaryPagination: listView === "store"
                ? (summaryData.data?.storeSummaryPagination ?? current.data.storeSummaryPagination)
                : current.data.storeSummaryPagination,
            },
          };
        });
      } catch {
        if (controller.signal.aborted) return;
      } finally {
        if (!controller.signal.aborted) setSummaryLoading(false);
      }
    }

    void loadSummaries();
    return () => controller.abort();
  }, [listView, queryString, reloadKey, searchParams]);

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
  const promoterPagination = monitor.promoterSummaryPagination ?? emptySummaryPagination(monitor.pagination.page, monitor.pagination.pageSize);
  const storePagination = monitor.storeSummaryPagination ?? emptySummaryPagination(monitor.pagination.page, monitor.pagination.pageSize);
  const activePagination = listView === "promoter"
    ? promoterPagination
    : listView === "store"
      ? storePagination
      : monitor.pagination;

  const buildMonitorHref = (options: { view?: ListView; page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    for (const key of monitorFilterKeys) {
      const value = getFilter(key);
      if (value) query.set(key, value);
    }
    const view = options.view ?? listView;
    if (view !== "visit") query.set("view", view);
    query.set("page", String(options.page ?? activePagination.page));
    query.set("page_size", String(options.pageSize ?? activePagination.pageSize));
    return `/${locale}/store-visit-monitor?${query.toString()}`;
  };
  const pageHref = (nextPage: number) => buildMonitorHref({ page: nextPage });
  const viewHref = (view: ListView) => buildMonitorHref({ view, page: 1 });

  return (
    <>
      <DataNotice dict={dict} error={payload.error} />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">{isZh ? "巡店记录" : "Store Visit Records"}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {monitor.filters.isDefaultRecent24Hours
                ? (isZh ? "近 24 小时" : "Recent 24 hours")
                : (isZh ? `${monitor.filters.dateFrom} 至 ${monitor.filters.dateTo}` : `${monitor.filters.dateFrom} to ${monitor.filters.dateTo}`)}
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
            <MetricCard label={isZh ? "已分析巡店数" : "Visits analyzed"} value={monitor.summary.visitsAnalyzed} />
            <MetricCard label={isZh ? "巡店分析耗时 P50" : "P50 visit analysis time"} value={formatDuration(monitor.summary.p50, isZh)} />
            <MetricCard label={isZh ? "巡店分析耗时 P95" : "P95 visit analysis time"} value={formatDuration(monitor.summary.p95, isZh)} />
            <MetricCard label={isZh ? "需处理 / 失败数" : "Action required / failed count"} value={monitor.summary.actionRequiredOrFailedCount} />
            <MetricCard label={isZh ? "平均图片数" : "Average images per visit"} value={monitor.summary.averageImagesPerVisit ?? "-"} />
          </div>

          <Card className="mb-4">
            <div className="mb-3">
              <h2 className="font-semibold">{isZh ? "价格解析质量" : "Price parsing quality"}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {isZh
                  ? "H5 流程不变。以下指标汇总当前页相对最终确认门店价格快照的质量。"
                  : "Unchanged H5 flow. These metrics summarize the current page against final approved store price snapshots."}
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <MetricCard label={isZh ? "准确率" : "Accuracy"} value={formatPercent(monitor.quality.accuracy !== null ? monitor.quality.accuracy * 100 : null)} />
              <MetricCard label={isZh ? "自动通过率" : "Auto-approval rate"} value={formatPercent(monitor.quality.autoApprovalRate !== null ? monitor.quality.autoApprovalRate * 100 : null)} />
              <MetricCard label={isZh ? "平均价格偏差" : "Average price deviation"} value={formatPercent(monitor.quality.avgPriceDeviationRate !== null ? monitor.quality.avgPriceDeviationRate * 100 : null)} />
            </div>
          </Card>
        </>
      ) : null}

      <Card className="mb-4">
        <QueryForm className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {listView !== "visit" ? <input type="hidden" name="view" value={listView} /> : null}
          <DateRangeFilter locale={locale} dateFrom={monitor.filters.dateFrom} dateTo={monitor.filters.dateTo} />
          <LabeledTextFilter label={isZh ? "巡店编号" : "Visit code"} name="visit_code" placeholder={isZh ? "输入巡店编号" : "Search visit"} defaultValue={getFilter("visit_code")} />
          <LabeledTextFilter label={isZh ? "门店名称" : "Store name"} name="store_name" placeholder={isZh ? "搜索门店" : "Search store"} defaultValue={getFilter("store_name")} />
          <LabeledTextFilter label={isZh ? "促销员" : "Promoter"} name="promoter" placeholder={isZh ? "搜索促销员" : "Search promoter"} defaultValue={getFilter("promoter")} />
          <LabeledSelectFilter label={isZh ? "分析状态" : "Analysis status"} name="analysis_status" defaultValue={getFilter("analysis_status")}>
            <option value="">{isZh ? "全部状态" : "All status"}</option>
            {ANALYSIS_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{analysisStatusLabel(status, isZh)}</option>
            ))}
          </LabeledSelectFilter>
          <div className="flex items-center gap-2">
            <QuerySubmitButton
              idleLabel={dict.common.filter}
              pendingLabel={isZh ? "筛选中..." : "Filtering..."}
              className="whitespace-nowrap"
            />
            <Link href={`/${locale}/store-visit-monitor`} className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {isZh ? "重置" : "Reset"}
            </Link>
          </div>
        </QueryForm>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg bg-slate-100 p-1" aria-label={isZh ? "列表视图" : "List view"}>
            <Link
              href={viewHref("visit")}
              className={`rounded-md px-4 py-2 text-sm font-medium ${listView === "visit" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              {isZh ? "按拜访" : "By visit"}
            </Link>
            <Link
              href={viewHref("promoter")}
              className={`rounded-md px-4 py-2 text-sm font-medium ${listView === "promoter" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              {isZh ? "按导购" : "By promoter"}
            </Link>
            <Link
              href={viewHref("store")}
              className={`rounded-md px-4 py-2 text-sm font-medium ${listView === "store" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              {isZh ? "按门店" : "By store"}
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {listView === "visit" && canRerunMatching && !payload.isDemo ? (
              <button
                type="button"
                onClick={() => setRerunTarget({ kind: "date_range", dateFrom: monitor.filters.dateFrom, dateTo: monitor.filters.dateTo })}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {isZh ? "重跑匹配" : "Rerun matching"}
              </button>
            ) : null}
            <StoreVisitMonitorExportButton locale={locale} filters={exportFilters} exportView={listView} />
          </div>
        </div>
        <div className="mb-3 text-sm text-slate-500">
          {listView === "promoter"
            ? (isZh
              ? `${monitor.filters.dateFrom} 至 ${monitor.filters.dateTo} · 筛选条件内 · ${promoterPagination.total} 位导购`
              : `${monitor.filters.dateFrom} to ${monitor.filters.dateTo} · Current filters · ${promoterPagination.total} promoters`)
            : listView === "store"
              ? (isZh
                ? `${monitor.filters.dateFrom} 至 ${monitor.filters.dateTo} · 筛选条件内 · ${storePagination.total} 家门店`
                : `${monitor.filters.dateFrom} to ${monitor.filters.dateTo} · Current filters · ${storePagination.total} stores`)
            : monitor.pagination.total === 0
              ? (isZh ? "0 条巡店" : "0 visits")
              : (isZh
                ? `显示 ${monitor.pagination.from}-${monitor.pagination.to} / 共 ${monitor.pagination.total} 条`
                : `Showing ${monitor.pagination.from}-${monitor.pagination.to} of ${monitor.pagination.total} visits`)}
        </div>

        {listView === "promoter" ? (
          <>
            {(monitor.promoterSummary ?? []).length === 0 ? (
              <EmptyState
                text={
                  summaryLoading
                    ? (isZh ? "正在汇总导购数据..." : "Summarizing promoters...")
                    : (isZh ? "当前筛选条件下没有可汇总的导购。" : "No promoters to summarize for current filters.")
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">{isZh ? "导购" : "Promoter"}</th>
                      <th className="py-2 pr-3">{isZh ? "拜访门店数" : "Stores visited"}</th>
                      <th className="py-2 pr-3">{isZh ? "解析商品数" : "Parsed products"}</th>
                      <th className="py-2 pr-3">{isZh ? "通过商品数" : "Approved products"}</th>
                      <th className="py-2 pr-3">{isZh ? "需确认" : "Need Confirmation"}</th>
                      <th className="py-2 pr-3">{isZh ? "通过率" : "Pass rate"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(monitor.promoterSummary ?? []).map((row) => (
                      <tr key={row.promoter} className="border-b border-slate-100 last:border-0">
                        <td className="py-2.5 pr-3 font-medium text-slate-800">{row.promoter}</td>
                        <td className="py-2.5 pr-3">{row.storeCount}</td>
                        <td className="py-2.5 pr-3">{row.parsedProductCount}</td>
                        <td className="py-2.5 pr-3">{row.approvedProductCount}</td>
                        <td className="py-2.5 pr-3">{row.needConfirmationCount}</td>
                        <td className="py-2.5 pr-3">{formatPercent(row.passRate !== null ? row.passRate * 100 : null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : listView === "store" ? (
          <>
            {(monitor.storeSummary ?? []).length === 0 ? (
              <EmptyState
                text={
                  summaryLoading
                    ? (isZh ? "正在汇总门店数据..." : "Summarizing stores...")
                    : (isZh ? "当前筛选条件下没有可汇总的门店。" : "No stores to summarize for current filters.")
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1120px] text-left text-sm [&_th]:whitespace-nowrap">
                  <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="w-48 max-w-48 py-2 pr-3">{isZh ? "门店名称" : "Store"}</th>
                      <th className="py-2 pr-3">{isZh ? "关联组织" : "Organization"}</th>
                      <th className="w-36 max-w-36 py-2 pr-3">{isZh ? "省" : "Province"}</th>
                      <th className="w-36 max-w-36 py-2 pr-3">{isZh ? "市" : "City"}</th>
                      <th className="w-36 max-w-36 py-2 pr-3">{isZh ? "区" : "District"}</th>
                      <th className="py-2 pr-3">{isZh ? "解析商品数" : "Parsed products"}</th>
                      <th className="py-2 pr-3">{isZh ? "通过商品数" : "Approved products"}</th>
                      <th className="py-2 pr-3">{isZh ? "需确认" : "Need Confirmation"}</th>
                      <th className="py-2 pr-3">{isZh ? "通过率" : "Pass rate"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(monitor.storeSummary ?? []).map((row) => (
                      <tr key={row.storeKey}>
                        <td className="w-48 max-w-48 py-2.5 pr-3 font-medium text-slate-800">
                          <span className="line-clamp-2 break-words" title={row.storeName}>{row.storeName}</span>
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">{row.organizationName || "-"}</td>
                        <td className="w-36 max-w-36 py-2.5 pr-3">
                          <span className="block truncate" title={row.province || undefined}>{row.province || "-"}</span>
                        </td>
                        <td className="w-36 max-w-36 py-2.5 pr-3">
                          <span className="block truncate" title={row.city || undefined}>{row.city || "-"}</span>
                        </td>
                        <td className="w-36 max-w-36 py-2.5 pr-3">
                          <span className="block truncate" title={row.district || undefined}>{row.district || "-"}</span>
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">{row.parsedProductCount}</td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">{row.approvedProductCount}</td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">{row.needConfirmationCount}</td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">{formatPercent(row.passRate !== null ? row.passRate * 100 : null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <>
        {monitor.visits.length === 0 ? <EmptyState text={isZh ? "当前筛选条件下没有巡店记录。" : "No store visits found for this range."} /> : null}

        {monitor.visits.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1680px] text-left text-sm [&_th]:whitespace-nowrap">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">{isZh ? "巡店编号" : "Visit Code"}</th>
                  <th className="py-2 pr-3">{isZh ? "门店" : "Store"}</th>
                  <th className="py-2 pr-3">{isZh ? "巡店日期" : "Visit date"}</th>
                  <th className="py-2 pr-3">{isZh ? "促销员" : "Promoter"}</th>
                  <th className="py-2 pr-3">{isZh ? "分析状态" : "Analysis status"}</th>
                  <th className="py-2 pr-3">{isZh ? "完整分析耗时" : "Full analysis time"}</th>
                  <th className="py-2 pr-3">{isZh ? "图片数" : "Image count"}</th>
                  <th className="py-2 pr-3">{isZh ? "成功" : "Success"}</th>
                  <th className="py-2 pr-3">{isZh ? "失败" : "Failure"}</th>
                  <th className="py-2 pr-3">{isZh ? "需补拍" : "Retake"}</th>
                  <th className="py-2 pr-3">{isZh ? "准确率" : "Accuracy"}</th>
                  <th className="py-2 pr-3">{isZh ? "自动通过率" : "Auto-approval rate"}</th>
                  <th className="py-2 pr-3">{isZh ? "平均价格偏差" : "Average price deviation"}</th>
                  <th className="py-2 pr-3">{isZh ? "开始时间" : "Started at"}</th>
                  <th className="py-2 pr-3">{isZh ? "完成时间" : "Completed at"}</th>
                  <th className="py-2 pr-3">{isZh ? "操作" : "Details"}</th>
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
                      <Badge tone={statusTone(visit.analysisStatus)}>{analysisStatusLabel(visit.analysisStatus ?? visit.visitStatus, isZh)}</Badge>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-3 font-medium">{formatDuration(visit.fullAnalysisTimeMs, isZh)}</td>
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
                          {isZh ? "查看详情" : "Open details"}
                        </Link>
                        {canRerunMatching && !payload.isDemo ? (
                          <button
                            type="button"
                            onClick={() => setRerunTarget({ kind: "visit", visitId: visit.visitId, visitCode: visit.visitCode })}
                            className="font-medium text-blue-700 underline-offset-2 hover:underline"
                          >
                            {isZh ? "重跑匹配" : "Rerun matching"}
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
          </>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-sm">
          <div className="text-slate-600">
            {activePagination.from}-{activePagination.to} / {activePagination.total}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <form method="get" className="flex items-center gap-2">
              {monitorFilterKeys.map((key) => {
                const value = getFilter(key);
                return value ? <input key={key} type="hidden" name={key} value={value} /> : null;
              })}
              {listView !== "visit" ? <input type="hidden" name="view" value={listView} /> : null}
              <select
                name="page_size"
                defaultValue={String(activePagination.pageSize)}
                className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-500"
              >
                <option value="25">{isZh ? "25 / 页" : "25 / page"}</option>
                <option value="50">{isZh ? "50 / 页" : "50 / page"}</option>
                <option value="100">{isZh ? "100 / 页" : "100 / page"}</option>
              </select>
              <input type="hidden" name="page" value="1" />
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {isZh ? "应用" : "Apply"}
              </button>
            </form>
            {activePagination.hasPrevious ? (
              <Link
                href={pageHref(activePagination.page - 1)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 font-medium text-slate-700 hover:bg-slate-50"
              >
                {isZh ? "上一页" : "Previous"}
              </Link>
            ) : (
              <span className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-3 font-medium text-slate-400">
                {isZh ? "上一页" : "Previous"}
              </span>
            )}
            <span className="inline-flex h-9 items-center px-2 text-slate-600">
              {isZh ? `第 ${activePagination.page} / ${activePagination.totalPages} 页` : `Page ${activePagination.page} of ${activePagination.totalPages}`}
            </span>
            {activePagination.hasNext ? (
              <Link
                href={pageHref(activePagination.page + 1)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 font-medium text-slate-700 hover:bg-slate-50"
              >
                {isZh ? "下一页" : "Next"}
              </Link>
            ) : (
              <span className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-3 font-medium text-slate-400">
                {isZh ? "下一页" : "Next"}
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
