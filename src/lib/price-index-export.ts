import XLSX from "xlsx-js-style";
import { getWeeklyPriceCoefficientBoard, type WeeklyPriceCoefficientFilters } from "@/lib/data";
import type { DataScope } from "@/lib/data-scope";
import { normalizePriceIndexDimensions } from "@/lib/price-index-dimensions";
import {
  joinPackageFilterList,
  normalizePackageFilterList,
} from "@/lib/price-index-package-filters";
import {
  buildPriceIndexMatrix,
  buildPriceIndexMatrixSheet,
  type PriceIndexExportLocale,
} from "@/lib/price-index-matrix-export";
import {
  buildPriceSnapshotExport,
  normalizePriceSnapshotExportFilters,
} from "@/lib/price-snapshot-export";

export type { PriceIndexExportLocale } from "@/lib/price-index-matrix-export";
export {
  buildPriceIndexMatrix,
  buildPriceIndexMatrixSheet,
  stylePriceIndexMatrixSheet,
} from "@/lib/price-index-matrix-export";

export type PriceIndexExportFilters = {
  month?: string;
  ownSeries?: string;
  ownPackage?: string;
  competitorPackage?: string;
  organization?: string;
  dimensions?: string;
  /** Server-resolved only; never accept from client request body. */
  dataScope?: DataScope;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeFilterValue(value: unknown) {
  const nextValue = clean(value);
  return nextValue ? nextValue : undefined;
}

export function normalizePriceIndexExportLocale(value: unknown): PriceIndexExportLocale {
  return clean(value) === "en" ? "en" : "zh";
}

/** Normalize client-facing filters. Strips any forged dataScope. */
export function normalizePriceIndexExportFilters(input: Record<string, unknown> = {}): PriceIndexExportFilters {
  const ownSeries = normalizeFilterValue(input.ownSeries);
  const ownPackage = ownSeries ? joinPackageFilterList(normalizePackageFilterList(input.ownPackage)) : undefined;
  const competitorPackage = ownPackage ? joinPackageFilterList(normalizePackageFilterList(input.competitorPackage)) : undefined;
  const filters: PriceIndexExportFilters = {};
  const month = normalizeFilterValue(input.month);
  const organization = normalizeFilterValue(input.organization);
  const dimensions = normalizeFilterValue(input.dimensions);
  if (month) filters.month = month;
  if (ownSeries) filters.ownSeries = ownSeries;
  if (ownPackage) filters.ownPackage = ownPackage;
  if (competitorPackage) filters.competitorPackage = competitorPackage;
  if (organization) filters.organization = organization;
  if (dimensions) filters.dimensions = dimensions;
  return filters;
}

export function withPriceIndexExportDataScope(
  filters: PriceIndexExportFilters,
  dataScope: DataScope | null | undefined,
): PriceIndexExportFilters {
  if (!dataScope) return filters;
  return { ...filters, dataScope };
}

function readStoredDataScope(filters: Record<string, unknown> | PriceIndexExportFilters | undefined): DataScope | undefined {
  const raw = (filters as { dataScope?: unknown } | undefined)?.dataScope;
  if (!raw || typeof raw !== "object") return undefined;
  const mode = clean((raw as { mode?: unknown }).mode);
  if (mode === "all") return { mode: "all" };
  if (mode === "empty") return { mode: "empty" };
  if (mode === "organization") {
    const organizationIds = Array.isArray((raw as { organizationIds?: unknown }).organizationIds)
      ? (raw as { organizationIds: unknown[] }).organizationIds.map((id) => clean(id)).filter(Boolean)
      : [];
    return { mode: "organization", organizationIds };
  }
  return undefined;
}

export function buildPriceIndexExportDownloadName(input?: { createdAt?: string | null }) {
  const date = clean(input?.createdAt).slice(0, 10) || new Date().toISOString().slice(0, 10);
  return `price-index-${date}.xlsx`;
}

function monthDateBounds(month: string | undefined) {
  const normalized = /^\d{4}-\d{2}$/.test(clean(month)) ? clean(month) : new Date().toISOString().slice(0, 7);
  const [year, monthNumber] = normalized.split("-").map(Number);
  const startDate = `${normalized}-01`;
  const endExclusive = new Date(Date.UTC(year, monthNumber ?? 1, 1));
  const endDate = new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { startDate, endDate, month: normalized };
}

export async function buildPriceIndexExport(input: {
  filters?: Record<string, unknown>;
  locale?: string;
  onProgress?: (progress: { totalRows: number; exportedRows: number }) => Promise<void> | void;
}) {
  const storedScope = readStoredDataScope(input.filters);
  const filters = withPriceIndexExportDataScope(
    normalizePriceIndexExportFilters(input.filters ?? {}),
    storedScope,
  );
  const locale = normalizePriceIndexExportLocale(input.locale);
  const boardFilters: WeeklyPriceCoefficientFilters = {
    month: filters.month,
    ownSeries: filters.ownSeries,
    ownPackage: filters.ownPackage,
    competitorPackage: filters.competitorPackage,
    organization: filters.organization,
    dimensions: normalizePriceIndexDimensions(filters.dimensions),
    dataScope: filters.dataScope,
  };
  const boardResult = await getWeeklyPriceCoefficientBoard(locale, boardFilters);
  if (boardResult.error) throw new Error(boardResult.error);

  const matrix = buildPriceIndexMatrix(boardResult.data, locale);
  await input.onProgress?.({ totalRows: matrix.dataRowCount, exportedRows: Math.floor(matrix.dataRowCount / 2) });

  const { startDate, endDate } = monthDateBounds(filters.month ?? boardResult.data.month);
  const detailFilters = {
    ...normalizePriceSnapshotExportFilters({
      owner: "all",
      ownSeries: filters.ownSeries ?? boardResult.data.selectedOwnSeries ?? undefined,
      ownPackage: filters.ownPackage,
      competitorPackage: filters.competitorPackage,
      organization: filters.organization,
      createdFrom: startDate,
      createdTo: endDate,
      dashboardDateFrom: startDate,
      dashboardDateTo: endDate,
      priceIndexDrill: true,
    }),
    dataScope: filters.dataScope,
  };
  const detailExport = await buildPriceSnapshotExport({
    filters: detailFilters,
    locale,
    onProgress: async (progress) => {
      await input.onProgress?.({
        totalRows: matrix.dataRowCount + progress.totalRows,
        exportedRows: matrix.dataRowCount + progress.exportedRows,
      });
    },
  });

  const workbook = XLSX.utils.book_new();
  const indexSheet = buildPriceIndexMatrixSheet(boardResult.data, locale);
  XLSX.utils.book_append_sheet(workbook, indexSheet, locale === "zh" ? "价格指数" : "Price Index");

  const detailSheet = XLSX.utils.aoa_to_sheet(
    detailExport.rows.length ? detailExport.rows : [[locale === "zh" ? "无数据" : "No data"]],
  );
  XLSX.utils.book_append_sheet(workbook, detailSheet, locale === "zh" ? "价格明细" : "Price Detail");

  const totalRows = matrix.dataRowCount + Math.max(0, detailExport.rowCount);
  await input.onProgress?.({ totalRows, exportedRows: totalRows });

  return {
    xlsx: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer,
    rowCount: totalRows,
    downloadName: buildPriceIndexExportDownloadName(),
  };
}
