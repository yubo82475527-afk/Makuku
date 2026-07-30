import type { DataScope } from "@/lib/data-scope";
import { priceBrandSeriesLabel } from "@/lib/brand-series";
import { getPriceSnapshotsPage, type PriceSnapshotOwnerFilter } from "@/lib/data";
import { formatIdr, formatJakartaDateTimeSeconds, formatPricePerPiece, formatShortImageId } from "@/lib/format";
import {
  priceSnapshotBenchmarkMaterial,
  priceSnapshotBenchmarkSku,
  priceSnapshotBusinessLine,
  priceSnapshotBusinessSegment,
  priceSnapshotBusinessSize,
  priceSnapshotMakukuMaterialCode,
} from "@/lib/price-snapshot-business";
import {
  joinPackageFilterList,
  normalizePackageFilterList,
} from "@/lib/price-index-package-filters";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type { PriceSnapshot } from "@/lib/types";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export type PriceSnapshotExportLocale = "zh" | "en";

export type PriceSnapshotExportFilters = {
  owner?: PriceSnapshotOwnerFilter;
  brand?: string;
  series?: string;
  ownSeries?: string;
  ownPackage?: string;
  competitorPackage?: string;
  sku?: string;
  line?: string;
  priceBand?: string;
  size?: string;
  shape?: string;
  organization?: string;
  priceIndexDrill?: boolean;
  province?: string;
  cityName?: string;
  district?: string;
  store?: string;
  visitCode?: string;
  createdFrom?: string;
  createdTo?: string;
  dashboardDateFrom?: string;
  dashboardDateTo?: string;
  /** Server-resolved only; never trust client-supplied scope. */
  dataScope?: DataScope;
};

export const PRICE_SNAPSHOT_EXPORT_SELECT =
  "*, sku_master(*, material_master(*)), material_master(*), offline_store_visits!source_visit_id(id,visit_code,store_name,city,province,city_name,district,channel_type,visit_date,uploader_name,created_at), offline_stores(id,name,city,province,city_name,district,channel_type), competitor_products(*, brands(id,name)), ai_price_candidates(id, offline_store_visits(id,visit_code,store_name,city,province,city_name,district,channel_type,visit_date,uploader_name,created_at))";

const priceSnapshotExportBatchSize = 5000;

const csvColumns: Record<PriceSnapshotExportLocale, string[]> = {
  zh: [
    "\u91c7\u96c6\u65f6\u95f4",
    "\u54c1\u724c",
    "\u5546\u54c1",
    "SKU",
    "\u7b49\u7ea7",
    "\u5305\u88c5",
    "\u89c4\u683c",
    "\u7247\u6570",
    "\u6d3b\u52a8\u7c7b\u578b",
    "\u6807\u4ef7",
    "\u6298\u6263\u91d1\u989d",
    "\u5230\u624b\u4ef7",
    "\u5355\u7247\u4ef7",
    "\u95e8\u5e97\u540d\u79f0",
    "\u7701",
    "\u5e02",
    "\u533a",
    "\u91c7\u96c6\u4eba",
    "\u521b\u5efa\u65f6\u95f4",
    "\u5de1\u5e97\u7f16\u53f7",
    "\u56fe\u7247 ID",
  ],
  en: [
    "Captured",
    "Brand",
    "Product",
    "SKU",
    "Grade",
    "Package",
    "Spec",
    "Pcs",
    "Activity Type",
    "List",
    "Discount",
    "Net",
    "IDR/pc",
    "Store",
    "Province",
    "City",
    "District",
    "Collector",
    "Create Time",
    "Visit Code",
    "Image ID",
  ],
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeFilterValue(value: unknown) {
  const nextValue = clean(value);
  return nextValue ? nextValue : undefined;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  const text = clean(value).toLowerCase();
  return text === "1" || text === "true" || text === "yes";
}

export function normalizePriceSnapshotExportLocale(value: unknown): PriceSnapshotExportLocale {
  return clean(value) === "zh" ? "zh" : "en";
}

export function normalizePriceSnapshotOwner(value: unknown) {
  const owner = clean(value);
  if (owner === "makuku" || owner === "competitor") return owner;
  return "all";
}

export function normalizePriceSnapshotExportFilters(input: Record<string, unknown>): PriceSnapshotExportFilters {
  const filters: PriceSnapshotExportFilters = {};
  const owner = normalizePriceSnapshotOwner(input.owner);
  const brand = normalizeFilterValue(input.brand);
  const series = normalizeFilterValue(input.series);
  const ownSeries = normalizeFilterValue(input.ownSeries);
  const ownPackage = ownSeries ? joinPackageFilterList(normalizePackageFilterList(input.ownPackage)) : undefined;
  const competitorPackage = ownPackage ? joinPackageFilterList(normalizePackageFilterList(input.competitorPackage)) : undefined;
  const sku = normalizeFilterValue(input.sku);
  const line = normalizeFilterValue(input.line);
  const priceBand = normalizeFilterValue(input.priceBand);
  const size = normalizeFilterValue(input.size);
  const shape = normalizeFilterValue(input.shape);
  const organization = normalizeFilterValue(input.organization);
  const province = normalizeFilterValue(input.province);
  const cityName = normalizeFilterValue(input.cityName);
  const district = normalizeFilterValue(input.district);
  const store = normalizeFilterValue(input.store);
  const visitCode = normalizeFilterValue(input.visitCode);
  const createdFrom = normalizeFilterValue(input.createdFrom);
  const createdTo = normalizeFilterValue(input.createdTo);
  const dashboardDateFrom = normalizeFilterValue(input.dashboardDateFrom);
  const dashboardDateTo = normalizeFilterValue(input.dashboardDateTo);

  if (owner !== "all") filters.owner = owner;
  if (brand) filters.brand = brand;
  if (series) filters.series = series;
  if (ownSeries) filters.ownSeries = ownSeries;
  if (ownPackage) filters.ownPackage = ownPackage;
  if (competitorPackage) filters.competitorPackage = competitorPackage;
  if (sku) filters.sku = sku;
  if (line) filters.line = line;
  if (priceBand) filters.priceBand = priceBand;
  if (size) filters.size = size;
  if (shape) filters.shape = shape;
  if (organization) filters.organization = organization;
  if (normalizeBoolean(input.priceIndexDrill)) filters.priceIndexDrill = true;
  if (province) filters.province = province;
  if (cityName) filters.cityName = cityName;
  if (district) filters.district = district;
  if (store) filters.store = store;
  if (visitCode) filters.visitCode = visitCode;
  if (createdFrom) filters.createdFrom = createdFrom;
  if (createdTo) filters.createdTo = createdTo;
  if (dashboardDateFrom) filters.dashboardDateFrom = dashboardDateFrom;
  if (dashboardDateTo) filters.dashboardDateTo = dashboardDateTo;
  // dataScope is attached by callers after auth resolution; never read from client input here.

  return filters;
}

export function withPriceSnapshotExportDataScope(
  filters: PriceSnapshotExportFilters,
  dataScope: DataScope | null | undefined,
): PriceSnapshotExportFilters {
  if (!dataScope) return filters;
  return { ...filters, dataScope };
}

export function buildPriceSnapshotExportDownloadName(input?: { createdAt?: string | null }) {
  const date = clean(input?.createdAt).slice(0, 10) || new Date().toISOString().slice(0, 10);
  return `price-snapshots-${date}.csv`;
}

export async function buildPriceSnapshotExport(input: {
  filters?: Record<string, unknown>;
  locale?: string;
  supabase?: SupabaseServiceClient;
  onProgress?: (progress: { totalRows: number; exportedRows: number }) => Promise<void> | void;
}) {
  const filters = normalizePriceSnapshotExportFilters(input.filters ?? {});
  const locale = normalizePriceSnapshotExportLocale(input.locale);
  const snapshots: PriceSnapshot[] = [];
  let totalRows = 0;

  for (let page = 1; ; page += 1) {
    const result = await getPriceSnapshotsPage({
      owner: filters.owner ?? "all",
      brand: filters.brand,
      series: filters.series,
      ownSeries: filters.ownSeries,
      ownPackage: filters.ownPackage,
      competitorPackage: filters.competitorPackage,
      sku: filters.sku,
      line: filters.line,
      size: filters.size,
      shape: filters.shape,
      organization: filters.organization,
      priceIndexDrill: filters.priceIndexDrill,
      dashboardDateFrom: filters.dashboardDateFrom ?? filters.createdFrom,
      dashboardDateTo: filters.dashboardDateTo ?? filters.createdTo,
      province: filters.province,
      cityName: filters.cityName,
      district: filters.district,
      store: filters.store,
      visitCode: filters.visitCode,
      capturedFrom: toInclusiveCapturedFrom(filters.createdFrom) ?? undefined,
      capturedTo: toExclusiveCapturedTo(filters.createdTo) ?? undefined,
      page,
      perPage: priceSnapshotExportBatchSize,
      dataScope: filters.dataScope,
    });
    if (result.error) throw new Error(result.error);

    snapshots.push(...result.data);
    totalRows = result.total;
    await input.onProgress?.({ totalRows, exportedRows: snapshots.length });
    if (snapshots.length >= totalRows || result.data.length === 0) break;
  }

  return buildPriceSnapshotExportRowsFromSnapshots(snapshots, locale);
}

/** Build the standard price-detail sheet rows from an already-selected snapshot list. */
export function buildPriceSnapshotExportRowsFromSnapshots(
  snapshots: PriceSnapshot[],
  locale?: string,
) {
  const normalizedLocale = normalizePriceSnapshotExportLocale(locale);
  const rowCells = snapshots.map((snapshot) => buildPriceSnapshotCsvCells(snapshot, normalizedLocale));
  const header = csvColumns[normalizedLocale];
  const csv = [
    header.map(csvEscape).join(","),
    ...rowCells.map((cells) => cells.map(csvEscape).join(",")),
  ].join("\r\n");

  return {
    csv: `\uFEFF${csv}`,
    rows: [header, ...rowCells.map((cells) => cells.map((cell) => String(cell ?? "")))],
    rowCount: rowCells.length,
    downloadName: buildPriceSnapshotExportDownloadName(),
  };
}

/**
 * Hydrate board-selected snapshot IDs with full export columns.
 * Preserves input id order so Sheet2 stays aligned with index samples.
 */
export async function loadPriceSnapshotsByIdsForExport(input: {
  ids: string[];
  supabase?: SupabaseServiceClient;
}) {
  const ids = Array.from(new Set(input.ids.map((id) => clean(id)).filter(Boolean)));
  if (ids.length === 0) return [] as PriceSnapshot[];

  const supabase = input.supabase ?? createSupabaseServiceClient();
  const byId = new Map<string, PriceSnapshot>();
  const chunkSize = 200;
  for (let offset = 0; offset < ids.length; offset += chunkSize) {
    const chunk = ids.slice(offset, offset + chunkSize);
    const { data, error } = await supabase
      .from("price_snapshots")
      .select(PRICE_SNAPSHOT_EXPORT_SELECT)
      .in("id", chunk);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const snapshot = row as PriceSnapshot;
      byId.set(String(snapshot.id), snapshot);
    }
  }

  return ids.map((id) => byId.get(id)).filter((snapshot): snapshot is PriceSnapshot => Boolean(snapshot));
}

function toExclusiveCapturedTo(value: string | null | undefined) {
  const text = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function toInclusiveCapturedFrom(value: string | null | undefined) {
  const text = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function applyPriceSnapshotExportFilters(snapshots: PriceSnapshot[], filters: PriceSnapshotExportFilters) {
  return applyOwnerFilter(snapshots, filters.owner ?? "all").filter((snapshot) => {
    const productLine = priceSnapshotBusinessLine(snapshot);
    const productSize = priceSnapshotBusinessSize(snapshot);
    const productPriceBand = priceSnapshotBusinessSegment(snapshot);
    const region = storeRegionForSnapshot(snapshot);

    if (filters.brand && priceBrandSeriesLabel(snapshot) !== filters.brand) return false;
    if (filters.sku && !matchesText(priceSnapshotMakukuMaterialCode(snapshot), filters.sku)) return false;
    if (filters.line && productLine !== filters.line) return false;
    if (filters.priceBand && productPriceBand !== filters.priceBand) return false;
    if (filters.size && productSize !== filters.size) return false;
    if (filters.province && !matchesText(region.province, filters.province)) return false;
    if (filters.cityName && !matchesText(region.cityName, filters.cityName)) return false;
    if (filters.district && !matchesText(region.district, filters.district)) return false;
    if (filters.store && !matchesText(storeNameForSnapshot(snapshot), filters.store)) return false;
    if (filters.visitCode && !matchesText(visitCodeForSnapshot(snapshot), filters.visitCode)) return false;
    if (filters.createdFrom && !matchesCreatedFrom(snapshot.captured_at, filters.createdFrom)) return false;
    if (filters.createdTo && !matchesCreatedTo(snapshot.captured_at, filters.createdTo)) return false;
    return true;
  });
}

function buildPriceSnapshotCsvCells(snapshot: PriceSnapshot, locale: PriceSnapshotExportLocale) {
  const region = storeRegionForSnapshot(snapshot);
  return [
    formatSnapshotCapturedAt(snapshot),
    snapshotBrandName(snapshot),
    snapshotProductName(snapshot),
    snapshotSkuCode(snapshot),
    snapshotBusinessSegment(snapshot),
    snapshotPackageType(snapshot),
    snapshotSpec(snapshot),
    snapshotPieceCount(snapshot),
    snapshotPromoTypeLabel(snapshot, locale === "zh"),
    formatIdr(snapshotPackagePrice(snapshot)),
    formatIdr(snapshotDiscountAmount(snapshot)),
    formatIdr(snapshot.net_price_idr),
    formatPricePerPiece(snapshot.price_per_piece),
    storeNameForSnapshot(snapshot),
    region.province ?? "-",
    region.cityName ?? "-",
    region.district ?? "-",
    uploaderNameForSnapshot(snapshot),
    formatSnapshotCreatedAt(snapshot),
    visitCodeForSnapshot(snapshot),
    imageIdForSnapshot(snapshot),
  ];
}

function buildPriceSnapshotCsvRow(snapshot: PriceSnapshot, locale: PriceSnapshotExportLocale) {
  return buildPriceSnapshotCsvCells(snapshot, locale).map(csvEscape).join(",");
}

function csvEscape(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function applyOwnerFilter(snapshots: PriceSnapshot[], owner: string) {
  if (owner === "makuku") return snapshots.filter((snapshot) => snapshotOwnerType(snapshot) === "makuku");
  if (owner === "competitor") return snapshots.filter((snapshot) => snapshotOwnerType(snapshot) === "competitor");
  return snapshots;
}

type PriceSnapshotForStoreRegion = {
  captured_at?: string | null;
  created_at?: string | null;
  source?: string | null;
  offline_store_visits?: {
    store_name?: string | null;
    visit_code?: string | null;
    city?: string | null;
    province?: string | null;
    city_name?: string | null;
    district?: string | null;
    visit_date?: string | null;
    uploader_name?: string | null;
  } | null;
  offline_stores?: {
    name?: string | null;
    city?: string | null;
    province?: string | null;
    city_name?: string | null;
    district?: string | null;
    channel_type?: string | null;
  } | null;
  competitor_products?: { shop_name?: string | null; normalized_name?: string | null } | null;
  ai_price_candidates?: {
    offline_store_visits?: {
      store_name?: string | null;
      visit_code?: string | null;
      city?: string | null;
      province?: string | null;
      city_name?: string | null;
      district?: string | null;
      visit_date?: string | null;
      uploader_name?: string | null;
    } | null;
  }[];
};

function snapshotOwnerType(snapshot: PriceSnapshot) {
  return (snapshot.sku_master_id || snapshot.material_sku_code) && !snapshot.competitor_product_id ? "makuku" : "competitor";
}

function snapshotBrandName(snapshot: PriceSnapshot) {
  return priceBrandSeriesLabel(snapshot) || "-";
}

function snapshotProductName(snapshot: PriceSnapshot) {
  return snapshotOwnerType(snapshot) === "makuku"
    ? priceSnapshotBenchmarkMaterial(snapshot)?.tenant_sku_name ?? priceSnapshotBenchmarkSku(snapshot)?.makuku_sku_name ?? "-"
    : snapshot.competitor_products?.normalized_name ?? "-";
}

function snapshotSkuCode(snapshot: PriceSnapshot) {
  if (snapshotOwnerType(snapshot) === "makuku") {
    return cleanDisplayText(priceSnapshotMakukuMaterialCode(snapshot)) ?? "-";
  }
  return cleanDisplayText(snapshot.competitor_products?.competitor_sku_code) ?? cleanDisplayText(snapshot.competitor_products?.id) ?? "-";
}

function snapshotBusinessSegment(snapshot: PriceSnapshot) {
  return priceSnapshotBusinessSegment(snapshot) || "-";
}

function snapshotPackageType(snapshot: PriceSnapshot) {
  if (snapshotOwnerType(snapshot) === "makuku") {
    return cleanDisplayText(priceSnapshotBenchmarkMaterial(snapshot)?.type) ?? cleanDisplayText(snapshot.sku_master?.pack_type) ?? "-";
  }
  return cleanDisplayText(snapshot.competitor_products?.package_type) ?? cleanDisplayText(snapshot.competitor_products?.pack_type) ?? "-";
}

function snapshotSpec(snapshot: PriceSnapshot) {
  if (snapshotOwnerType(snapshot) === "makuku") {
    return cleanDisplayText(priceSnapshotBenchmarkMaterial(snapshot)?.sub_type) ?? cleanDisplayText(snapshot.sku_master?.size) ?? "-";
  }
  return cleanDisplayText(snapshot.competitor_products?.size) ?? "-";
}

function snapshotPieceCount(snapshot: PriceSnapshot) {
  if (snapshotOwnerType(snapshot) === "makuku") {
    return priceSnapshotBenchmarkMaterial(snapshot)?.pack_count ?? snapshot.sku_master?.piece_count ?? "-";
  }
  return snapshot.competitor_products?.piece_count ?? "-";
}

function snapshotPackagePrice(snapshot: PriceSnapshot) {
  return snapshot.package_price_idr ?? null;
}

function snapshotDiscountAmount(snapshot: PriceSnapshot) {
  const netPrice = Number(snapshot.net_price_idr);
  const packagePrice = Number(snapshotPackagePrice(snapshot));
  if (!Number.isFinite(netPrice) || !Number.isFinite(packagePrice)) return null;
  return packagePrice - netPrice;
}

function snapshotPromoTypeLabel(snapshot: PriceSnapshot, isZh: boolean) {
  const text = cleanDisplayText(snapshot.promo_type);
  if (!text || text === "offline_ai_confirmed") return isZh ? "\u65e0\u6d3b\u52a8" : "No Activity";
  return text;
}

function storeVisitForSnapshot(snapshot: PriceSnapshotForStoreRegion) {
  if (snapshot.offline_store_visits) return snapshot.offline_store_visits;
  return snapshot.ai_price_candidates?.find((candidate) => candidate.offline_store_visits)?.offline_store_visits ?? null;
}

function storeNameForSnapshot(snapshot: PriceSnapshotForStoreRegion) {
  return cleanDisplayText(storeVisitForSnapshot(snapshot)?.store_name)
    ?? cleanDisplayText(snapshot.offline_stores?.name)
    ?? cleanDisplayText(snapshot.competitor_products?.shop_name)
    ?? "-";
}

function uploaderNameForSnapshot(snapshot: PriceSnapshotForStoreRegion) {
  if (String(snapshot.source ?? "").startsWith("excel_import")) return "Excel";
  return cleanDisplayText(storeVisitForSnapshot(snapshot)?.uploader_name) ?? "-";
}

function visitCodeForSnapshot(snapshot: PriceSnapshotForStoreRegion) {
  return cleanDisplayText(storeVisitForSnapshot(snapshot)?.visit_code) ?? "-";
}

function imageIdForSnapshot(snapshot: PriceSnapshot) {
  return formatShortImageId(snapshot.source_image_id);
}

function formatSnapshotCapturedAt(snapshot: PriceSnapshotForStoreRegion) {
  const visitDate = cleanDisplayText(storeVisitForSnapshot(snapshot)?.visit_date);
  if (visitDate) return visitDate.slice(0, 10);
  return formatJakartaDateTimeSeconds(snapshot.captured_at);
}

function formatSnapshotCreatedAt(snapshot: PriceSnapshotForStoreRegion) {
  return formatJakartaDateTimeSeconds(snapshot.created_at);
}

function storeRegionForSnapshot(snapshot: PriceSnapshotForStoreRegion) {
  const visit = storeVisitForSnapshot(snapshot);
  const store = snapshot.offline_stores;
  const legacyRegion = splitLegacyRegion(visit?.city);
  return {
    province: cleanDisplayText(visit?.province) ?? cleanDisplayText(store?.province) ?? legacyRegion.province,
    cityName: cleanDisplayText(visit?.city_name) ?? cleanDisplayText(store?.city_name) ?? legacyRegion.cityName ?? cleanDisplayText(store?.city),
    district: cleanDisplayText(visit?.district) ?? cleanDisplayText(store?.district) ?? legacyRegion.district,
  };
}

function cleanDisplayText(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text && text !== "-" ? text : null;
}

function splitLegacyRegion(value: string | null | undefined) {
  const parts = String(value ?? "")
    .replaceAll("\uFF0C", ",")
    .split(/[/>|,]/)
    .map((part) => cleanDisplayText(part))
    .filter(Boolean) as string[];
  if (parts.length >= 3) return { province: parts[0], cityName: parts[1], district: parts[2] };
  if (parts.length === 2) return { province: null, cityName: parts[0], district: parts[1] };
  if (parts.length === 1) return { province: null, cityName: parts[0], district: null };
  return { province: null, cityName: null, district: null };
}

function matchesText(value: string | null | undefined, query: string) {
  return String(value ?? "").toLowerCase().includes(query.trim().toLowerCase());
}

function matchesCreatedFrom(value: string | null | undefined, dateText: string) {
  const createdAt = Date.parse(String(value ?? ""));
  const from = Date.parse(`${dateText}T00:00:00.000Z`);
  if (!Number.isFinite(createdAt) || !Number.isFinite(from)) return true;
  return createdAt >= from;
}

function matchesCreatedTo(value: string | null | undefined, dateText: string) {
  const createdAt = Date.parse(String(value ?? ""));
  const to = Date.parse(`${dateText}T23:59:59.999Z`);
  if (!Number.isFinite(createdAt) || !Number.isFinite(to)) return true;
  return createdAt <= to;
}
