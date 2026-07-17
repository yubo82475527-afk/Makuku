"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { OperatorPriceReviewDrawer } from "@/components/operator-price-review-drawer";
import { formatIdr, formatJakartaTime } from "@/lib/format";
import type { OperatorPriceReviewReasonFilter } from "@/lib/operator-price-review-reasons";
import type { OperatorPriceReviewListItem, OperatorPriceReviewReasonGroup, OperatorPriceReviewState } from "@/lib/types";

type ReviewFilters = {
  state: OperatorPriceReviewState;
  date_from?: string;
  date_to?: string;
  visit_code?: string;
  reason?: OperatorPriceReviewReasonFilter;
};

export function OperatorPriceReviewWorkbench({
  items,
  total,
  page,
  perPage,
  locale,
  exportHref,
  filters,
}: {
  items: OperatorPriceReviewListItem[];
  total: number;
  page: number;
  perPage: number;
  locale: string;
  exportHref: string;
  filters: ReviewFilters;
}) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [removedPendingIds, setRemovedPendingIds] = useState<Set<string>>(() => new Set());
  const visibleItems = useMemo(
    () => filters.state === "pending" ? items.filter((item) => !removedPendingIds.has(item.id)) : items,
    [filters.state, items, removedPendingIds],
  );
  const isZh = locale === "zh";
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);

  function onProcessed(id: string) {
    if (filters.state === "pending") {
      setRemovedPendingIds((current) => new Set(current).add(id));
    }
    setActiveId(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-slate-100 p-1" aria-label={isZh ? "审核状态" : "Review state"}>
          <StateTab locale={locale} filters={filters} state="pending" label={isZh ? "待处理" : "Pending"} active={filters.state === "pending"} />
          <StateTab locale={locale} filters={filters} state="processed" label={isZh ? "已处理" : "Processed"} active={filters.state === "processed"} />
        </div>
        <a
          href={exportHref}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-4 w-4" />
          {isZh ? "导出审核数据" : "Export review data"}
        </a>
      </div>

      {visibleItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-slate-500">
          {filters.state === "pending"
            ? (isZh ? "当前没有需要人工确认的价格" : "No prices currently need manual confirmation")
            : (isZh ? "当前没有已处理记录" : "No processed records")}
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-slate-200 md:block">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="w-24 px-4 py-3">{isZh ? "来源" : "Source"}</th>
                  <th className="w-[32%] px-4 py-3">{isZh ? "商品" : "Product"}</th>
                  <th className="w-36 px-4 py-3">{isZh ? "AI 识别价格" : "AI price"}</th>
                  <th className="w-24 px-4 py-3">{isZh ? "片数量" : "Pieces"}</th>
                  <th className="w-32 px-4 py-3">{isZh ? "片单价" : "Per-piece"}</th>
                  <th className="px-4 py-3">{isZh ? "异常原因" : "Reason"}</th>
                  <th className="w-36 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleItems.map((item) => (
                  <tr key={item.id} className="align-middle">
                    <td className="px-4 py-3"><SourceThumbnail item={item} locale={locale} onOpenReview={setActiveId} /></td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-950">{item.product_name}</div>
                      <div className="mt-1 whitespace-normal break-words text-xs text-slate-500">{productAssociationLabel(item, isZh)}</div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-950">{formatIdr(item.ai_package_price)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-950">{item.ai_piece_count ?? "-"}</td>
                    <td className="px-4 py-3 font-semibold text-slate-950">{formatIdr(item.ai_price_per_piece)}</td>
                    <td className="px-4 py-3"><ReasonSummary groups={item.operator_reason_groups} fallback={item.operator_reason} /></td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => setActiveId(item.id)} className="inline-flex h-9 items-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800">
                        {filters.state === "pending" ? (isZh ? "查看并处理" : "View and handle") : (isZh ? "查看详情" : "View details")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {visibleItems.map((item) => (
              <article key={item.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex gap-3">
                  <SourceThumbnail item={item} locale={locale} onOpenReview={setActiveId} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-950">{item.product_name}</div>
                    <div className="mt-1 whitespace-normal break-words text-xs text-slate-500">{productAssociationLabel(item, isZh)}</div>
                    <div className="mt-2 text-base font-semibold text-slate-950">{formatIdr(item.ai_package_price)}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>{isZh ? "片数量" : "Pieces"}: <span className="font-semibold text-slate-950">{item.ai_piece_count ?? "-"}</span></span>
                      <span>{isZh ? "片单价" : "Per-piece"}: <span className="font-semibold text-slate-950">{formatIdr(item.ai_price_per_piece)}</span></span>
                    </div>
                  </div>
                </div>
                <div className="mt-3"><ReasonSummary groups={item.operator_reason_groups} fallback={item.operator_reason} /></div>
                {item.processed_at ? <div className="mt-2 text-xs text-slate-400">{formatJakartaTime(item.processed_at)}</div> : null}
                <button type="button" onClick={() => setActiveId(item.id)} className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white">
                  {filters.state === "pending" ? (isZh ? "查看并处理" : "View and handle") : (isZh ? "查看详情" : "View details")}
                </button>
              </article>
            ))}
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm text-slate-500">
        <span>{isZh ? `${from}-${to} / ${total}` : `${from}-${to} of ${total}`}</span>
        <div className="flex gap-2">
          <PaginationLink locale={locale} filters={filters} page={page - 1} perPage={perPage} disabled={page <= 1} label={isZh ? "上一页" : "Previous"} />
          <span className="inline-flex h-9 items-center px-2">{page} / {pageCount}</span>
          <PaginationLink locale={locale} filters={filters} page={page + 1} perPage={perPage} disabled={page >= pageCount} label={isZh ? "下一页" : "Next"} />
        </div>
      </div>

      {activeId ? (
        <OperatorPriceReviewDrawer
          key={activeId}
          candidateId={activeId}
          locale={locale}
          onClose={() => setActiveId(null)}
          onProcessed={onProcessed}
        />
      ) : null}
    </div>
  );
}

function productAssociationLabel(item: OperatorPriceReviewListItem, isZh: boolean) {
  if (item.sku_label) return item.sku_label;
  if (item.requires_product_correction) return isZh ? "待确认" : "Needs confirmation";
  return isZh ? "商品待确认" : "Product not confirmed";
}

function ReasonSummary({ groups, fallback }: { groups: OperatorPriceReviewReasonGroup[]; fallback: string }) {
  if (groups.length === 0) return <p className="text-sm leading-6 text-slate-700">{fallback}</p>;
  return (
    <div className="space-y-1.5 text-sm leading-5">
      {groups.map((group) => (
        <p key={group.kind} className={group.kind === "PRICE" ? "font-medium text-rose-700" : "text-slate-700"}>
          <span className="mr-1">{group.title}：</span>{group.messages[0]}
        </p>
      ))}
    </div>
  );
}

function SourceThumbnail({ item, locale, onOpenReview }: { item: OperatorPriceReviewListItem; locale: string; onOpenReview: (candidateId: string) => void }) {
  const label = locale === "zh" ? "来源图片" : "Source image";
  if (!item.source_thumbnail_url) {
    return <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-slate-100 px-1 text-center text-[10px] text-slate-400">{locale === "zh" ? "无来源图片" : "No image"}</div>;
  }
  return (
    <button type="button" aria-label={label} title={locale === "zh" ? "查看并处理" : "View and handle"} onClick={() => onOpenReview(item.id)} className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-slate-100 transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2">
      <span className="block h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(item.source_thumbnail_url).slice(1, -1)})` }} />
    </button>
  );
}

function StateTab({ locale, filters, state, label, active }: { locale: string; filters: ReviewFilters; state: OperatorPriceReviewState; label: string; active: boolean }) {
  return (
    <Link
      href={buildHref(locale, filters, { state, page: 1 })}
      className={`rounded-md px-4 py-2 text-sm font-medium ${active ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
    >
      {label}
    </Link>
  );
}

function PaginationLink({ locale, filters, page, perPage, disabled, label }: { locale: string; filters: ReviewFilters; page: number; perPage: number; disabled: boolean; label: string }) {
  if (disabled) return <span className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-slate-300">{label}</span>;
  return <Link href={buildHref(locale, filters, { page, per_page: perPage })} className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-slate-700 hover:bg-slate-50">{label}</Link>;
}

function buildHref(locale: string, filters: ReviewFilters, overrides: Record<string, string | number>) {
  const params = new URLSearchParams();
  params.set("state", filters.state);
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);
  if (filters.visit_code) params.set("visit_code", filters.visit_code);
  if (filters.reason) params.set("reason", filters.reason);
  for (const [key, value] of Object.entries(overrides)) params.set(key, String(value));
  return `/${locale}/offline-price-candidates?${params.toString()}`;
}
