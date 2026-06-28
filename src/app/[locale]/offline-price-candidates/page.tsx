import { Download } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AiPriceCandidatesWorkbench } from "@/components/ai-price-candidates-workbench";
import { Button, Card, DataNotice } from "@/components/ui";
import { getAiPriceCandidatesPage, getAiPriceReviewRule } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import type { AiPriceCandidateStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OfflinePriceCandidatesPage({
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

  const dateFrom = getFilter("date_from");
  const dateTo = getFilter("date_to");
  const visitCode = getFilter("visit_code").trim();
  const imageId = getFilter("image_id").trim();
  const rawStatus = getFilter("status");
  const currentStatus = rawStatus === "approved" || rawStatus === "rejected" || rawStatus === "all" ? rawStatus : "pending";
  const statusFilter = currentStatus === "all" ? undefined : currentStatus as AiPriceCandidateStatus;
  const pageParam = Number.parseInt(getFilter("page") || "1", 10);
  const perPageParam = Number.parseInt(getFilter("per_page") || "50", 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const perPage = Number.isFinite(perPageParam) && perPageParam > 0 ? Math.min(200, perPageParam) : 50;

  const exportParams = new URLSearchParams();
  if (dateFrom) exportParams.set("date_from", dateFrom);
  if (dateTo) exportParams.set("date_to", dateTo);
  if (visitCode) exportParams.set("visit_code", visitCode);
  if (imageId) exportParams.set("image_id", imageId);
  if (statusFilter) exportParams.set("status", statusFilter);
  const exportHref = `/api/ai-price-candidates/export${exportParams.size > 0 ? `?${exportParams.toString()}` : ""}`;

  const [candidatesResult, ruleResult] = await Promise.all([
    getAiPriceCandidatesPage({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      visitCode: visitCode || undefined,
      imageId: imageId || undefined,
      status: statusFilter,
      page,
      perPage,
    }),
    getAiPriceReviewRule(),
  ]);
  const total = candidatesResult.total;
  const pageTitle = locale === "zh" ? "照片价格复核" : "Photo Price Review";

  return (
    <AppShell locale={locale} dict={dict} title={pageTitle} currentPath="/offline-price-candidates" isDemo={candidatesResult.isDemo || ruleResult.isDemo}>
      <DataNotice error={candidatesResult.error ?? ruleResult.error} dict={dict} />

      <Card className="mb-4">
        <form className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_minmax(180px,220px)_minmax(180px,220px)_minmax(120px,180px)]">
          <DateRangeFilter locale={locale} dateFrom={dateFrom} dateTo={dateTo} />
          <BatchCodeFilter locale={locale} visitCode={visitCode} />
          <ImageIdFilter locale={locale} imageId={imageId} />
          <Button type="submit">{dict.common.filter}</Button>
        </form>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">{pageTitle}</h2>
          <div className="flex items-center gap-2">
            <a href={exportHref} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4" />
              Export CSV
            </a>
          </div>
        </div>
        <AiPriceCandidatesWorkbench
          items={candidatesResult.data}
          total={total}
          page={candidatesResult.page}
          perPage={candidatesResult.perPage}
          locale={locale}
          filters={{
            status: currentStatus,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            visit_code: visitCode || undefined,
            image_id: imageId || undefined,
          }}
          rule={ruleResult.data}
        />
      </Card>
    </AppShell>
  );
}

function BatchCodeFilter({ locale, visitCode }: { locale: string; visitCode: string }) {
  const label = locale === "zh" ? "拍照批次" : "Batch code";
  const placeholder = locale === "zh" ? "输入批次号" : "Search batch";

  return (
    <label className="flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200">
      <span className="mr-2 shrink-0 text-xs font-medium text-slate-500">{label}</span>
      <input
        name="visit_code"
        defaultValue={visitCode}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent py-2 outline-none"
      />
    </label>
  );
}

function ImageIdFilter({ locale, imageId }: { locale: string; imageId: string }) {
  const label = locale === "zh" ? "图片编号" : "Image ID";
  const placeholder = locale === "zh" ? "输入图片编号" : "Search image";

  return (
    <label className="flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200">
      <span className="mr-2 shrink-0 text-xs font-medium text-slate-500">{label}</span>
      <input
        name="image_id"
        defaultValue={imageId}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent py-2 outline-none"
      />
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
      <input
        name="date_from"
        type="date"
        defaultValue={dateFrom}
        aria-label={fromLabel}
        className="min-w-0 flex-1 bg-transparent py-2 outline-none [color-scheme:light]"
      />
      <span className="mx-2 shrink-0 text-xs font-medium text-slate-400">{separator}</span>
      <input
        name="date_to"
        type="date"
        defaultValue={dateTo}
        aria-label={toLabel}
        className="min-w-0 flex-1 bg-transparent py-2 outline-none [color-scheme:light]"
      />
    </fieldset>
  );
}
