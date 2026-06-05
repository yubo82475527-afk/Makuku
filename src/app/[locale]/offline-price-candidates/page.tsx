import { Download } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AiPriceCandidateActions } from "@/components/ai-price-candidate-actions";
import { Badge, Button, Card, DataNotice, EmptyState, TextInput } from "@/components/ui";
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
  const [result, summaryResult] = await Promise.all([
    getAiPriceCandidates({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      status: statusFilter,
    }),
    getAiPriceCandidates({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      limit: 5000,
    }),
  ]);
  const candidates = result.data;
  const summaryCandidates = summaryResult.data;
  const pending = summaryCandidates.filter((item) => item.status === "pending").length;
  const approved = summaryCandidates.filter((item) => item.status === "approved").length;
  const approvedAccuracies = summaryCandidates
    .filter((item) => item.status === "approved")
    .map(accuracy)
    .filter((value): value is number => value !== null);
  const approvedAccuracy = approvedAccuracies.length
    ? approvedAccuracies.reduce((sum, value) => sum + value, 0) / approvedAccuracies.length
    : null;
  const statusHref = (status: "pending" | "approved" | "all") => {
    const next = new URLSearchParams();
    if (dateFrom) next.set("date_from", dateFrom);
    if (dateTo) next.set("date_to", dateTo);
    if (status !== "pending") next.set("status", status);
    const query = next.toString();
    return `/${locale}/offline-price-candidates${query ? `?${query}` : ""}`;
  };
  const clearDateHref = () => {
    const next = new URLSearchParams();
    if (currentStatus !== "pending") next.set("status", currentStatus);
    const query = next.toString();
    return `/${locale}/offline-price-candidates${query ? `?${query}` : ""}`;
  };
  const tabClass = (status: "pending" | "approved" | "all") =>
    status === currentStatus
      ? "inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white"
      : "inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50";

  return (
    <AppShell locale={locale} dict={dict} title="AI Price Candidates" currentPath="/offline-price-candidates" isDemo={result.isDemo}>
      <DataNotice error={result.error ?? summaryResult.error} dict={dict} />

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Card>
          <div className="text-xs font-medium uppercase text-slate-500">Pending Review</div>
          <div className="mt-2 text-2xl font-semibold">{pending}</div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase text-slate-500">Approved</div>
          <div className="mt-2 text-2xl font-semibold">{approved}</div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase text-slate-500">Approved Accuracy</div>
          <div className="mt-2 text-2xl font-semibold">{formatAccuracy(approvedAccuracy)}</div>
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">AI detected price candidates</h2>
            <p className="mt-1 text-sm text-slate-500">Review AI extracted prices before they enter the price monitor.</p>
          </div>
          <a href={exportHref} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Download className="h-4 w-4" />
            Export CSV
          </a>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <Link href={statusHref("pending")} className={tabClass("pending")}>待审批</Link>
          <Link href={statusHref("approved")} className={tabClass("approved")}>已审批</Link>
          <Link href={statusHref("all")} className={tabClass("all")}>全部</Link>
        </div>
        <form className="mb-4 grid gap-3 md:grid-cols-[minmax(0,180px)_minmax(0,180px)_auto_auto]">
          {currentStatus !== "pending" ? <input type="hidden" name="status" value={currentStatus} /> : null}
          <TextInput name="date_from" type="date" defaultValue={dateFrom} aria-label="Visit date from" />
          <TextInput name="date_to" type="date" defaultValue={dateTo} aria-label="Visit date to" />
          <Button type="submit">{dict.common.filter}</Button>
          <Link href={clearDateHref()} className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            {dict.common.viewAll}
          </Link>
        </form>
        {candidates.length === 0 ? <EmptyState text="No AI price candidates yet. Run Store Visit analysis first." /> : null}
        {candidates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1600px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Visit</th>
                  <th className="py-2 pr-3">Raw Brand</th>
                  <th className="py-2 pr-3">Raw Product</th>
                  <th className="py-2 pr-3">AI Package</th>
                  <th className="py-2 pr-3">AI Pcs</th>
                  <th className="py-2 pr-3">AI Per Piece</th>
                  <th className="py-2 pr-3">Reviewed Per Piece</th>
                  <th className="py-2 pr-3">Accuracy</th>
                  <th className="py-2 pr-3">Match</th>
                  <th className="py-2 pr-3">Score</th>
                  <th className="py-2 pr-3">Warnings</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {candidates.map((candidate) => {
                  const visit = candidate.offline_store_visits;
                  const rowAccuracy = accuracy(candidate);
                  return (
                    <tr key={candidate.id}>
                      <td className="py-3 pr-3">
                        <div className="font-medium">{visit?.store_name ?? "-"}</div>
                        <div className="text-xs text-slate-500">
                          {visit ? <Link className="underline" href={`/${locale}/mobile/offline-capture/${visit.id}`}>Visit detail</Link> : null}
                        </div>
                        <div className="text-xs text-slate-500">{candidate.created_at ? formatJakartaTime(candidate.created_at) : "-"}</div>
                      </td>
                      <td className="py-3 pr-3">{candidate.raw_brand || "-"}</td>
                      <td className="max-w-xs py-3 pr-3">{candidate.raw_product || "-"}</td>
                      <td className="py-3 pr-3">{candidate.parsed_price_idr ? formatIdr(candidate.parsed_price_idr) : "-"}</td>
                      <td className="py-3 pr-3">{candidate.piece_count ?? "-"}</td>
                      <td className="py-3 pr-3 font-medium">{candidate.price_per_piece ? formatIdr(candidate.price_per_piece) : "-"}</td>
                      <td className="py-3 pr-3 font-medium">{candidate.reviewed_price_per_piece ? `${formatIdr(candidate.reviewed_price_per_piece)}/pc` : "-"}</td>
                      <td className="py-3 pr-3">
                        <Badge tone={accuracyTone(rowAccuracy)}>{formatAccuracy(rowAccuracy)}</Badge>
                      </td>
                      <td className="py-3 pr-3">
                        <div><Badge>{candidate.matched_entity_type}</Badge></div>
                        <div className="mt-1 max-w-xs text-xs text-slate-500">{candidate.matched_label ?? "-"}</div>
                      </td>
                      <td className="py-3 pr-3">
                        <Badge tone={scoreTone(candidate.match_score)}>{Math.round(candidate.match_score * 100)}%</Badge>
                        <div className="mt-1 text-xs text-slate-500">AI {Math.round(candidate.ai_confidence * 100)}%</div>
                      </td>
                      <td className="max-w-xs py-3 pr-3">
                        {(candidate.warnings ?? []).length === 0 ? <span className="text-slate-400">-</span> : null}
                        <div className="space-y-1">
                          {(candidate.warnings ?? []).map((warning, index) => (
                            <div key={index} className="text-xs text-amber-700">{warning.message}</div>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 pr-3"><Badge>{candidate.status}</Badge></td>
                      <td className="py-3 pr-3">
                        {candidate.status !== "approved" ? (
                          <AiPriceCandidateActions id={candidate.id} status={candidate.status} price={candidate.parsed_price_idr} pieceCount={candidate.piece_count} />
                        ) : (
                          <div className="text-xs text-slate-500">
                            <div>{candidate.reviewed_at ? formatJakartaTime(candidate.reviewed_at) : "-"}</div>
                            {candidate.reviewed_price_per_piece ? <div>{formatIdr(candidate.reviewed_price_per_piece)}/pc</div> : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </AppShell>
  );
}
