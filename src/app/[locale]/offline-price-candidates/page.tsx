import { OperatorPriceReviewWorkbench } from "@/components/operator-price-review-workbench";
import { PageShellState } from "@/components/page-shell-state";
import { QueryForm, QuerySubmitButton } from "@/components/query-form";
import { Card, DataNotice } from "@/components/ui";
import { resolveSessionDataScope } from "@/lib/data-scope";
import { getPageI18n } from "@/lib/i18n/server";
import { getOperatorPriceReviewsPage } from "@/lib/operator-price-review";
import {
  normalizeOperatorPriceReviewReason,
  OPERATOR_PRICE_REVIEW_REASON_FILTERS,
  type OperatorPriceReviewReasonFilter,
} from "@/lib/operator-price-review-reasons";
import type { OperatorPriceReviewState } from "@/lib/types";

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
  const reason = normalizeOperatorPriceReviewReason(getFilter("reason"));
  const state: OperatorPriceReviewState = getFilter("state") === "processed" ? "processed" : "pending";
  const pageParam = Number.parseInt(getFilter("page") || "1", 10);
  const perPageParam = Number.parseInt(getFilter("per_page") || "25", 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const perPage = Number.isFinite(perPageParam) && perPageParam > 0 ? Math.min(100, Math.max(10, perPageParam)) : 25;

  const dataScope = await resolveSessionDataScope();
  const reviews = await getOperatorPriceReviewsPage({
    state,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    visitCode: visitCode || undefined,
    reason: reason,
    page,
    perPage,
    locale,
    dataScope,
  });
  const pageTitle = locale === "zh" ? "价格审核" : "Price Review";
  return (
    <>
      <PageShellState
        locale={locale}
        dict={dict}
        title={pageTitle}
        currentPath="/offline-price-candidates"
        isDemo={reviews.isDemo}
      />
      <DataNotice error={reviews.error} dict={dict} />

      <Card className="mb-4">
        <QueryForm className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_minmax(220px,280px)_minmax(240px,320px)_minmax(120px,180px)]">
          <input type="hidden" name="state" value={state} />
          <input type="hidden" name="per_page" value={perPage} />
          <DateRangeFilter locale={locale} dateFrom={dateFrom} dateTo={dateTo} />
          <BatchCodeFilter locale={locale} visitCode={visitCode} />
          <ReasonFilter locale={locale} reason={reason} />
          <QuerySubmitButton
            idleLabel={dict.common.filter}
            pendingLabel={locale === "zh" ? "筛选中..." : "Filtering..."}
          />
        </QueryForm>
      </Card>

      <Card>
        <OperatorPriceReviewWorkbench
          items={reviews.data}
          total={reviews.total}
          page={reviews.page}
          perPage={reviews.perPage}
          locale={locale}
          filters={{
            state,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            visit_code: visitCode || undefined,
            reason,
          }}
        />
      </Card>
    </>
  );
}

function ReasonFilter({ locale, reason }: { locale: string; reason?: OperatorPriceReviewReasonFilter }) {
  const isZh = locale === "zh";

  return (
    <label className="flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200">
      <span className="mr-2 shrink-0 text-xs font-medium text-slate-500">{isZh ? "异常原因" : "Reason"}</span>
      <select name="reason" defaultValue={reason ?? ""} className="min-w-0 flex-1 bg-transparent py-2 outline-none">
        <option value="">{isZh ? "全部原因" : "All reasons"}</option>
        {OPERATOR_PRICE_REVIEW_REASON_FILTERS.map((option) => (
          <option key={option.value} value={option.value}>{isZh ? option.zh : option.en}</option>
        ))}
      </select>
    </label>
  );
}

function BatchCodeFilter({ locale, visitCode }: { locale: string; visitCode: string }) {
  const label = locale === "zh" ? "拍照批次" : "Batch code";
  const placeholder = locale === "zh" ? "输入批次号" : "Search batch";

  return (
    <label className="flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200">
      <span className="mr-2 shrink-0 text-xs font-medium text-slate-500">{label}</span>
      <input name="visit_code" defaultValue={visitCode} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent py-2 outline-none" />
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
