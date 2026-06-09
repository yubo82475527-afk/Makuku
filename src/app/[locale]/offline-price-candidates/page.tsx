import { Download } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AiPriceCandidateActions } from "@/components/ai-price-candidate-actions";
import { Badge, Button, Card, DataNotice, EmptyState, SelectInput } from "@/components/ui";
import { formatIdr, formatJakartaTime } from "@/lib/format";
import { getAiPriceCandidates } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import type { AiPriceCandidate, AiPriceCandidateStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

function scoreTone(score: number) {
  if (score >= 0.85) return "low";
  if (score >= 0.65) return "medium";
  return "high";
}

function accuracy(candidate: AiPriceCandidate) {
  if (!candidate.price_per_piece || !candidate.reviewed_price_per_piece || candidate.reviewed_price_per_piece <= 0) return null;
  return Math.max(0, 1 - Math.abs(candidate.price_per_piece - candidate.reviewed_price_per_piece) / candidate.reviewed_price_per_piece);
}

function formatAccuracy(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
  return `${Math.round(value * 100)}%`;
}

function accuracyTone(value: number | null) {
  if (value === null) return "neutral";
  if (value >= 0.95) return "low";
  if (value >= 0.85) return "medium";
  return "high";
}

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
  const rawStatus = getFilter("status");
  const currentStatus = rawStatus === "approved" || rawStatus === "all" ? rawStatus : "pending";
  const statusFilter = currentStatus === "all" ? undefined : currentStatus as AiPriceCandidateStatus;
  const exportParams = new URLSearchParams();
  if (dateFrom) exportParams.set("date_from", dateFrom);
  if (dateTo) exportParams.set("date_to", dateTo);
  if (statusFilter) exportParams.set("status", statusFilter);
  const exportHref = `/api/ai-price-candidates/export${exportParams.size > 0 ? `?${exportParams.toString()}` : ""}`;
  const result = await getAiPriceCandidates({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    status: statusFilter,
  });
  const candidates = result.data;
  const pageTitle = locale === "zh" ? "照片价格复核" : "Photo Price Review";

  return (
    <AppShell locale={locale} dict={dict} title={pageTitle} currentPath="/offline-price-candidates" isDemo={result.isDemo}>
      <DataNotice error={result.error} dict={dict} />

      <Card className="mb-4">
        <form className="grid gap-3 md:grid-cols-[minmax(160px,220px)_minmax(280px,1fr)_minmax(120px,180px)]">
          <SelectInput name="status" defaultValue={currentStatus}>
            <option value="pending">{locale === "zh" ? "待复核" : "Pending"}</option>
            <option value="approved">{locale === "zh" ? "已复核" : "Approved"}</option>
            <option value="all">{locale === "zh" ? "全部状态" : "All statuses"}</option>
          </SelectInput>
          <DateRangeFilter locale={locale} dateFrom={dateFrom} dateTo={dateTo} />
          <Button type="submit">{dict.common.filter}</Button>
        </form>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">{pageTitle}</h2>
          <a href={exportHref} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Download className="h-4 w-4" />
            Export CSV
          </a>
        </div>
        {candidates.length === 0 ? <EmptyState text="No AI price candidates yet. Run Store Visit analysis first." /> : null}
        {candidates.length > 0 ? (
          <div className="space-y-3">
            {candidates.map((candidate) => {
              const visit = candidate.offline_store_visits;
              const rowAccuracy = accuracy(candidate);
              const warnings = candidate.warnings ?? [];
              return (
                <article key={candidate.id} className="rounded-lg border border-slate-200 bg-white px-4 py-4">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-slate-950">{candidate.raw_brand || "-"}</h3>
                            <Badge>{candidate.status}</Badge>
                            <Badge tone={scoreTone(candidate.match_score)}>AI {Math.round(candidate.ai_confidence * 100)}%</Badge>
                          </div>
                          <div className="mt-1 break-words text-sm text-slate-700">{candidate.raw_product || "-"}</div>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <div className="font-medium text-slate-700">{visit?.store_name ?? "-"}</div>
                          {visit ? <Link className="underline" href={`/${locale}/mobile/offline-capture/${visit.id}`}>Visit detail</Link> : null}
                          <div>{candidate.created_at ? formatJakartaTime(candidate.created_at) : "-"}</div>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <ReviewMetric label={locale === "zh" ? "AI 识别包装价" : "AI detected package"} value={candidate.parsed_price_idr ? formatIdr(candidate.parsed_price_idr) : "-"} />
                        <ReviewMetric label={locale === "zh" ? "AI 识别片数" : "AI detected pcs"} value={candidate.piece_count ?? "-"} />
                        <ReviewMetric label={locale === "zh" ? "AI 单片价" : "AI per piece"} value={candidate.price_per_piece ? formatIdr(candidate.price_per_piece) : "-"} strong />
                        <ReviewMetric label={locale === "zh" ? "复核准确率" : "Review accuracy"} value={<Badge tone={accuracyTone(rowAccuracy)}>{formatAccuracy(rowAccuracy)}</Badge>} />
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-md bg-slate-50 px-3 py-2">
                          <div className="text-xs font-medium uppercase text-slate-500">{locale === "zh" ? "匹配对象" : "Matched to"}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-700">
                            <Badge>{candidate.matched_entity_type}</Badge>
                            <span className="min-w-0 break-words">{candidate.matched_label ?? "-"}</span>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">Match {Math.round(candidate.match_score * 100)}%</div>
                        </div>
                        <div className="rounded-md bg-slate-50 px-3 py-2">
                          <div className="text-xs font-medium uppercase text-slate-500">{locale === "zh" ? "复核后单片价" : "Reviewed per piece"}</div>
                          <div className="mt-1 text-sm font-semibold text-slate-900">{candidate.reviewed_price_per_piece ? `${formatIdr(candidate.reviewed_price_per_piece)}/pc` : "-"}</div>
                          <div className="mt-1 text-xs text-slate-500">{candidate.reviewed_at ? formatJakartaTime(candidate.reviewed_at) : locale === "zh" ? "尚未复核" : "Not reviewed yet"}</div>
                        </div>
                      </div>

                      {warnings.length > 0 ? (
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                          <div className="text-xs font-medium uppercase text-amber-800">{locale === "zh" ? "风险提示" : "Warnings"}</div>
                          <div className="mt-1 space-y-1">
                            {warnings.map((warning, index) => (
                              <div key={index} className="text-xs text-amber-800">{warning.message}</div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-3 text-xs font-medium uppercase text-slate-500">{locale === "zh" ? "复核输入" : "Review input"}</div>
                      {candidate.status !== "approved" ? (
                        <AiPriceCandidateActions id={candidate.id} status={candidate.status} price={candidate.parsed_price_idr} pieceCount={candidate.piece_count} />
                      ) : (
                        <div className="text-sm text-slate-600">
                          <div>{locale === "zh" ? "已复核" : "Approved"}</div>
                          <div className="mt-1 text-xs text-slate-500">{candidate.reviewed_at ? formatJakartaTime(candidate.reviewed_at) : "-"}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </Card>
    </AppShell>
  );
}

function ReviewMetric({ label, value, strong = false }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <div className="text-xs font-medium uppercase text-slate-500">{label}</div>
      <div className={strong ? "mt-1 text-sm font-semibold text-slate-950" : "mt-1 text-sm text-slate-800"}>{value}</div>
    </div>
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
