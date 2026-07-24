import * as XLSX from "xlsx";
import { formatJakartaDateTimeSeconds, formatIdr } from "@/lib/format";
import { getOperatorPriceReviewsExport } from "@/lib/operator-price-review";
import { normalizeOperatorPriceReviewReason, type OperatorPriceReviewReasonFilter } from "@/lib/operator-price-review-reasons";
import type { OperatorPriceReviewState } from "@/lib/types";

export type OperatorPriceReviewExportFilters = {
  state: OperatorPriceReviewState;
  dateFrom?: string;
  dateTo?: string;
  visitCode?: string;
  reason?: OperatorPriceReviewReasonFilter;
};

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

export function normalizeOperatorPriceReviewExportLocale(value: unknown) {
  return String(value ?? "").trim() === "en" ? "en" : "zh";
}

export function normalizeOperatorPriceReviewExportFilters(input: Record<string, unknown> = {}): OperatorPriceReviewExportFilters {
  return {
    state: input.state === "processed" ? "processed" : "pending",
    dateFrom: clean(input.date_from ?? input.dateFrom),
    dateTo: clean(input.date_to ?? input.dateTo),
    visitCode: clean(input.visit_code ?? input.visitCode),
    reason: normalizeOperatorPriceReviewReason(clean(input.reason)),
  };
}

export function buildOperatorPriceReviewExportDownloadName(input?: { state?: OperatorPriceReviewState; createdAt?: string | null }) {
  const date = String(input?.createdAt ?? "").trim().slice(0, 10) || new Date().toISOString().slice(0, 10);
  return `operator-price-reviews-${input?.state === "processed" ? "processed" : "pending"}-${date}.xlsx`;
}

export async function buildOperatorPriceReviewExport(input: {
  filters?: Record<string, unknown>;
  locale?: string;
}) {
  const filters = normalizeOperatorPriceReviewExportFilters(input.filters);
  const locale = normalizeOperatorPriceReviewExportLocale(input.locale);
  const result = await getOperatorPriceReviewsExport({ ...filters, locale });
  if (result.error) throw new Error(result.error);

  const headers = [
    "Candidate ID",
    "Visit ID",
    "Visit Code",
    "Image ID",
    "Created Time",
    "Created By",
    "Product",
    "SKU",
    "Size",
    "Pieces",
    "AI Package Price",
    "Per-piece Price",
    "Reason",
    "Status",
  ];
  const rows = result.data.map((item) => [
    item.candidate_id,
    item.visit_id ?? "-",
    item.visit_code ?? "-",
    item.image_id ?? "-",
    formatJakartaDateTimeSeconds(item.created_at),
    item.created_by ?? "-",
    item.product_name,
    item.sku_label ?? "-",
    item.size ?? "-",
    item.ai_piece_count ?? "-",
    formatIdr(item.ai_package_price),
    formatIdr(item.ai_price_per_piece),
    item.operator_reason,
    item.status,
  ]);
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  worksheet["!cols"] = [
    { wch: 38 }, { wch: 38 }, { wch: 22 }, { wch: 38 }, { wch: 22 }, { wch: 20 }, { wch: 40 },
    { wch: 52 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 72 }, { wch: 20 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, locale === "zh" ? "价格审核" : "Price Review");

  return {
    xlsx: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer,
    rowCount: rows.length,
    downloadName: buildOperatorPriceReviewExportDownloadName({ state: filters.state }),
  };
}
