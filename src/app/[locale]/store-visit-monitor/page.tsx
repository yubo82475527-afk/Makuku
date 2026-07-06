import Link from "next/link";
import { PageShellState } from "@/components/page-shell-state";
import { Badge, Button, Card, DataNotice, EmptyState, MetricCard, SelectInput, TextInput } from "@/components/ui";
import { formatJakartaTime, formatPercent } from "@/lib/format";
import { getPageI18n } from "@/lib/i18n/server";
import { getStoreVisitMonitor } from "@/lib/data";

export const dynamic = "force-dynamic";

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

function readPositiveInt(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function StoreVisitMonitorPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const filters = await searchParams;
  const getFilter = (key: string) => {
    const value = filters[key];
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
  };
  const page = readPositiveInt(getFilter("page"), 1);
  const pageSize = readPositiveInt(getFilter("page_size"), 50);

  const result = await getStoreVisitMonitor({
    dateFrom: getFilter("date_from") || undefined,
    dateTo: getFilter("date_to") || undefined,
    visitCode: getFilter("visit_code") || undefined,
    storeName: getFilter("store_name") || undefined,
    promoter: getFilter("promoter") || undefined,
    analysisStatus: getFilter("analysis_status") || undefined,
    page,
    pageSize,
  });

  const monitor = result.data;
  const exportQuery = new URLSearchParams();
  for (const key of ["visit_code", "store_name", "promoter", "analysis_status", "date_from", "date_to"]) {
    const value = getFilter(key);
    if (value) exportQuery.set(key, value);
  }
  exportQuery.set("locale", locale);
  const exportHref = `/api/store-visit-monitor/export?${exportQuery.toString()}`;
  const pageHref = (nextPage: number) => {
    const query = new URLSearchParams();
    for (const key of ["visit_code", "store_name", "promoter", "analysis_status", "date_from", "date_to"]) {
      const value = getFilter(key);
      if (value) query.set(key, value);
    }
    query.set("page", String(nextPage));
    query.set("page_size", String(monitor.pagination.pageSize));
    return `/${locale}/store-visit-monitor?${query.toString()}`;
  };

  return (
    <>
      <PageShellState locale={locale} dict={dict} title="Store Visit Monitor" currentPath="/store-visit-monitor" isDemo={result.isDemo} />
      <DataNotice dict={dict} error={result.error} />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Store Visit Monitor</h2>
            <p className="mt-1 text-sm text-slate-500">
              {monitor.filters.isDefaultRecent24Hours ? "Recent 24 hours" : `${monitor.filters.dateFrom} to ${monitor.filters.dateTo}`}
            </p>
          </div>
        </div>
      </Card>

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

      <Card className="mb-4">
        <form className="grid gap-3 md:grid-cols-8">
          <TextInput name="visit_code" placeholder="Visit code" defaultValue={getFilter("visit_code")} />
          <TextInput name="store_name" placeholder="Store name" defaultValue={getFilter("store_name")} />
          <TextInput name="promoter" placeholder="Promoter" defaultValue={getFilter("promoter")} />
          <SelectInput name="analysis_status" defaultValue={getFilter("analysis_status")}>
            <option value="">Analysis status</option>
            <option value="pending">pending</option>
            <option value="analyzing">analyzing</option>
            <option value="completed">completed</option>
            <option value="partial">partial</option>
            <option value="action_required">action_required</option>
            <option value="failed">failed</option>
          </SelectInput>
          <TextInput name="date_from" type="date" defaultValue={monitor.filters.dateFrom} />
          <TextInput name="date_to" type="date" defaultValue={monitor.filters.dateTo} />
          <SelectInput name="page_size" defaultValue={String(monitor.pagination.pageSize)}>
            <option value="25">25 / page</option>
            <option value="50">50 / page</option>
            <option value="100">100 / page</option>
          </SelectInput>
          <div className="flex gap-2">
            <Button type="submit">Filter</Button>
            <Link href={`/${locale}/store-visit-monitor`} className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Reset
            </Link>
          </div>
        </form>
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
            <Link
              href={exportHref}
              className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Export Excel
            </Link>
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
                    <td className="whitespace-nowrap py-3 pr-3">{visit.startedAt ? formatJakartaTime(visit.startedAt) : "-"}</td>
                    <td className="whitespace-nowrap py-3 pr-3">{visit.completedAt ? formatJakartaTime(visit.completedAt) : "-"}</td>
                    <td className="whitespace-nowrap py-3 pr-3">
                      <Link
                        href={`/${locale}/mobile/offline-capture/${visit.visitId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-700 underline-offset-2 hover:underline"
                      >
                        Open details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-sm">
          <div className="text-slate-500">
            Page {monitor.pagination.page} of {monitor.pagination.totalPages}
          </div>
          <div className="flex gap-2">
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
    </>
  );
}
