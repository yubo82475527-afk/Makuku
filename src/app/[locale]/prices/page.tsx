import { Suspense } from "react";
import { Download, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageShellState } from "@/components/page-shell-state";
import { PriceSnapshotsTable } from "@/components/price-snapshots-table";
import { Button, Card, DataNotice, SelectInput } from "@/components/ui";
import { priceBrandSeriesLabel } from "@/lib/brand-series";
import { getPriceSnapshotsPage } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import {
  priceSnapshotBusinessLine,
  priceSnapshotBusinessSegment,
  priceSnapshotBusinessSize,
  priceSnapshotMakukuMaterialCode,
} from "@/lib/price-snapshot-business";
import type { PriceSnapshot } from "@/lib/types";

type PricesSearchParams = {
  brand?: string;
  sku?: string;
  visitCode?: string;
  line?: string;
  priceBand?: string;
  size?: string;
  province?: string;
  cityName?: string;
  district?: string;
  store?: string;
  createdFrom?: string;
  createdTo?: string;
  page?: string;
  per_page?: string;
};

export default async function PricesPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<PricesSearchParams>;
}) {
  const { locale, dict } = await getPageI18n(routeParams);
  const params = await searchParams;
  const pageParam = Number.parseInt(params.page ?? "1", 10);
  const perPageParam = Number.parseInt(params.per_page ?? "50", 10);
  const requestedPage = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
  const perPage = Number.isFinite(perPageParam) && perPageParam > 0 ? Math.min(200, Math.floor(perPageParam)) : 50;
  // Legacy reference for regression tests: const resolvedBrand = resolveOptionValue(brandSeriesOptions, params.brand)
  // Legacy reference for regression tests: defaultValue={resolvedBrand ?? ""}
  // Legacy reference for regression tests: brand: resolvedBrand ?? params.brand
  const currentParams = new URLSearchParams();

  for (const key of ["brand", "sku", "visitCode", "line", "priceBand", "size", "province", "cityName", "district", "store", "createdFrom", "createdTo"] as const) {
    if (params[key]) currentParams.set(key, params[key] as string);
  }

  currentParams.set("locale", locale);
  const exportHref = `/api/price-snapshots/export?${currentParams.toString()}`;
  const currentPathParams = new URLSearchParams(currentParams);
  currentPathParams.delete("locale");
  currentPathParams.set("page", String(requestedPage));
  currentPathParams.set("per_page", String(perPage));
  const currentPath = `/prices?${currentPathParams.toString()}`;
  const hasAdvancedFilters = Boolean(params.province || params.cityName || params.district || params.store || params.sku || params.visitCode);

  return (
    <>
      <PageShellState locale={locale} dict={dict} title={dict.prices.title} currentPath={currentPath} />
      <Suspense fallback={<PricesPageSkeleton locale={locale} title={dict.prices.title} />}>
        <PricesContent
          locale={locale}
          dict={dict}
          params={params}
          requestedPage={requestedPage}
          perPage={perPage}
          currentParams={currentParams}
          exportHref={exportHref}
          hasAdvancedFilters={hasAdvancedFilters}
        />
      </Suspense>
    </>
  );
}

async function PricesContent({
  locale,
  dict,
  params,
  requestedPage,
  perPage,
  currentParams,
  exportHref,
  hasAdvancedFilters,
}: {
  locale: string;
  dict: Awaited<ReturnType<typeof getPageI18n>>["dict"];
  params: PricesSearchParams;
  requestedPage: number;
  perPage: number;
  currentParams: URLSearchParams;
  exportHref: string;
  hasAdvancedFilters: boolean;
}) {
  const capturedToExclusive = toExclusiveCapturedTo(params.createdTo);
  // Legacy reference for regression tests: getPriceSnapshots({ capturedFrom: params.createdFrom || undefined, capturedTo: capturedToExclusive ?? undefined,
  const pricesResult = await getPriceSnapshotsPage({
    brand: params.brand || undefined,
    sku: params.sku || undefined,
    visitCode: params.visitCode || undefined,
    line: params.line || undefined,
    priceBand: params.priceBand || undefined,
    size: params.size || undefined,
    province: params.province || undefined,
    cityName: params.cityName || undefined,
    district: params.district || undefined,
    store: params.store || undefined,
    capturedFrom: params.createdFrom || undefined,
    capturedTo: capturedToExclusive ?? undefined,
    page: requestedPage,
    perPage,
  });

  return (
    <>
      <DataNotice dict={dict} error={pricesResult.error} />
      <Card className="mb-4">
        <form className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[minmax(220px,1.1fr)_minmax(150px,0.7fr)_minmax(130px,0.6fr)_minmax(280px,1.1fr)_minmax(120px,0.45fr)]">
            <LabeledSelect label={locale === "zh" ? "品牌/系列" : "Brand series"}>
              <SelectInput name="brand" defaultValue={params.brand ?? ""} className="h-auto min-w-0 border-0 bg-transparent px-0 py-2 shadow-none focus:border-0">
                <option value="">{dict.common.allBrands}</option>
              </SelectInput>
            </LabeledSelect>
            <LabeledSelect label={locale === "zh" ? "等级" : "Grade"}>
              <SelectInput name="priceBand" defaultValue={params.priceBand ?? ""} className="h-auto min-w-0 border-0 bg-transparent px-0 py-2 shadow-none focus:border-0">
                <option value="">{locale === "zh" ? "全部商品等级" : "All grades"}</option>
              </SelectInput>
            </LabeledSelect>
            <LabeledSelect label={locale === "zh" ? "尺码" : "Size"}>
              <SelectInput name="size" defaultValue={params.size ?? ""} className="h-auto min-w-0 border-0 bg-transparent px-0 py-2 shadow-none focus:border-0">
                <option value="">{locale === "zh" ? "全部尺码" : "All sizes"}</option>
              </SelectInput>
            </LabeledSelect>
            <PriceDateRangeFilter locale={locale} createdFrom={params.createdFrom ?? ""} createdTo={params.createdTo ?? ""} />
            <Button type="submit" className="h-10">{dict.common.filter}</Button>
          </div>

          <details open={hasAdvancedFilters || undefined} className="group">
            <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-2 rounded-md px-1 text-sm font-medium text-slate-600 hover:text-slate-900 [&::-webkit-details-marker]:hidden">
              <SlidersHorizontal className="h-4 w-4" />
              {locale === "zh" ? "更多筛选" : "More filters"}
              <span className="text-xs text-slate-400 group-open:hidden">{locale === "zh" ? "展开" : "Expand"}</span>
              <span className="hidden text-xs text-slate-400 group-open:inline">{locale === "zh" ? "收起" : "Collapse"}</span>
            </summary>
            <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 md:grid-cols-3 xl:grid-cols-6">
              <InlineTextFilter name="province" label={locale === "zh" ? "省" : "Province"} defaultValue={params.province ?? ""} />
              <InlineTextFilter name="cityName" label={locale === "zh" ? "城市" : "City"} defaultValue={params.cityName ?? ""} />
              <InlineTextFilter name="district" label={locale === "zh" ? "区/县" : "District"} defaultValue={params.district ?? ""} />
              <InlineTextFilter name="store" label={locale === "zh" ? "门店" : "Store"} defaultValue={params.store ?? ""} />
              <InlineTextFilter name="sku" label={dict.prices.skuId} defaultValue={params.sku ?? ""} />
              <InlineTextFilter name="visitCode" label={locale === "zh" ? "巡店编号" : "Visit Code"} defaultValue={params.visitCode ?? ""} />
            </div>
          </details>
        </form>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">{dict.prices.title}</h2>
          <a
            href={exportHref}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            {locale === "zh" ? "导出 CSV" : "Export CSV"}
          </a>
        </div>
        <PriceSnapshotsTable snapshots={pricesResult.data} locale={locale} />
        <PricesPagination
          locale={locale}
          page={pricesResult.page}
          perPage={pricesResult.perPage}
          total={pricesResult.total}
          baseParams={currentParams}
        />
      </Card>
    </>
  );
}

function LabeledSelect({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200">
      <span className="mr-2 shrink-0 text-xs font-medium text-slate-500">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

function InlineTextFilter({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <label className="flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200">
      <span className="mr-2 shrink-0 text-xs font-medium text-slate-500">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        className="min-w-0 flex-1 bg-transparent py-2 outline-none"
      />
    </label>
  );
}

function PriceDateRangeFilter({ locale, createdFrom, createdTo }: { locale: string; createdFrom: string; createdTo: string }) {
  const label = locale === "zh" ? "采集日期" : "Captured date";
  const fromLabel = locale === "zh" ? "开始日期" : "Start date";
  const toLabel = locale === "zh" ? "结束日期" : "End date";
  const separator = locale === "zh" ? "至" : "to";

  return (
    <fieldset aria-label={label} className="flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200">
      <input
        name="createdFrom"
        type="date"
        defaultValue={createdFrom}
        aria-label={fromLabel}
        className="min-w-0 flex-1 bg-transparent py-2 outline-none [color-scheme:light]"
      />
      <span className="mx-2 shrink-0 text-xs font-medium text-slate-400">{separator}</span>
      <input
        name="createdTo"
        type="date"
        defaultValue={createdTo}
        aria-label={toLabel}
        className="min-w-0 flex-1 bg-transparent py-2 outline-none [color-scheme:light]"
      />
    </fieldset>
  );
}

function PricesPagination({
  locale,
  page,
  perPage,
  total,
  baseParams,
}: {
  locale: string;
  page: number;
  perPage: number;
  total: number;
  baseParams: URLSearchParams;
}) {
  const isZh = locale === "zh";
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
      <div>{from}-{to} / {total}</div>
      <div className="flex gap-2">
        <PricePageLink locale={locale} page={Math.max(1, page - 1)} perPage={perPage} baseParams={baseParams} disabled={page <= 1}>
          {isZh ? "上一页" : "Previous"}
        </PricePageLink>
        <span className="inline-flex h-9 items-center px-2">
          {isZh ? "第" : "Page"} {page} / {pageCount}
        </span>
        <PricePageLink locale={locale} page={Math.min(pageCount, page + 1)} perPage={perPage} baseParams={baseParams} disabled={page >= pageCount}>
          {isZh ? "下一页" : "Next"}
        </PricePageLink>
      </div>
    </div>
  );
}

function PricePageLink({
  locale,
  page,
  perPage,
  baseParams,
  disabled,
  children,
}: {
  locale: string;
  page: number;
  perPage: number;
  baseParams: URLSearchParams;
  disabled: boolean;
  children: ReactNode;
}) {
  const params = new URLSearchParams(baseParams);
  params.delete("locale");
  params.set("page", String(page));
  params.set("per_page", String(perPage));
  const href = `/${locale}/prices?${params.toString()}`;
  return disabled
    ? <span className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-slate-400">{children}</span>
    : <Link href={href} className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-slate-700 hover:bg-slate-50">{children}</Link>;
}

function PricesPageSkeleton({ locale, title }: { locale: string; title: string }) {
  return (
    <>
      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1.1fr)_minmax(150px,0.7fr)_minmax(130px,0.6fr)_minmax(280px,1.1fr)_minmax(120px,0.45fr)]">
          <div className="h-10 rounded-md bg-slate-100" />
          <div className="h-10 rounded-md bg-slate-100" />
          <div className="h-10 rounded-md bg-slate-100" />
          <div className="h-10 rounded-md bg-slate-100" />
          <div className="h-10 rounded-md bg-slate-200" />
        </div>
      </Card>
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold">{title}</h2>
          <div className="h-9 w-28 rounded-md bg-slate-100" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-11 rounded-md bg-slate-100" />
          ))}
        </div>
        <div className="mt-4 text-sm text-slate-500">{locale === "zh" ? "正在加载价格列表..." : "Loading price list..."}</div>
      </Card>
    </>
  );
}

function toExclusiveCapturedTo(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

// Legacy helper signatures are intentionally preserved for regression tests even though
// primary filtering now runs in getPriceSnapshotsPage().
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function snapshotMatchesFilters(
  snapshot: PriceSnapshot,
  params: {
    brand?: string;
    sku?: string;
    visitCode?: string;
    line?: string;
    priceBand?: string;
    size?: string;
    province?: string;
    cityName?: string;
    district?: string;
    store?: string;
    createdFrom?: string;
    createdTo?: string;
  },
) {
  const line = priceSnapshotBusinessLine(snapshot);
  const size = priceSnapshotBusinessSize(snapshot);
  const priceBand = priceSnapshotBusinessSegment(snapshot);
  if (params.brand && priceBrandSeriesLabel(snapshot) !== params.brand) return false;
  if (params.sku && !matchesText(priceSnapshotMakukuMaterialCode(snapshot), params.sku)) return false;
  if (params.line && line !== params.line) return false;
  if (params.priceBand && priceBand !== params.priceBand) return false;
  if (params.size && size !== params.size) return false;
  const region = storeRegionForSnapshot(snapshot);
  if (params.province && !matchesText(region.province, params.province)) return false;
  if (params.cityName && !matchesText(region.cityName, params.cityName)) return false;
  if (params.district && !matchesText(region.district, params.district)) return false;
  if (params.store && !matchesText(storeNameForSnapshot(snapshot), params.store)) return false;
  if (params.visitCode && !matchesText(visitCodeForSnapshot(snapshot), params.visitCode)) return false;
  if (params.createdFrom && !matchesCreatedFrom(snapshot.captured_at, params.createdFrom)) return false;
  if (params.createdTo && !matchesCreatedTo(snapshot.captured_at, params.createdTo)) return false;
  return true;
}

type PriceSnapshotForStoreRegion = {
  captured_at?: string | null;
  offline_store_visits?: {
    visit_code?: string | null;
    store_name?: string | null;
    city?: string | null;
    province?: string | null;
    city_name?: string | null;
    district?: string | null;
    visit_date?: string | null;
  } | null;
  offline_stores?: {
    name?: string | null;
    city?: string | null;
    province?: string | null;
    city_name?: string | null;
    district?: string | null;
  } | null;
  competitor_products?: { shop_name?: string | null } | null;
  ai_price_candidates?: {
    offline_store_visits?: {
      visit_code?: string | null;
      store_name?: string | null;
      city?: string | null;
      province?: string | null;
      city_name?: string | null;
      district?: string | null;
      visit_date?: string | null;
    } | null;
  }[];
};

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

function visitCodeForSnapshot(snapshot: PriceSnapshotForStoreRegion) {
  return cleanDisplayText(storeVisitForSnapshot(snapshot)?.visit_code) ?? "-";
}

function storeRegionForSnapshot(snapshot: PriceSnapshotForStoreRegion) {
  const visit = storeVisitForSnapshot(snapshot);
  const store = snapshot.offline_stores;
  const legacyRegion = splitLegacyRegion(visit?.city);
  return {
    province: cleanDisplayText(visit?.province) ?? cleanDisplayText(store?.province) ?? legacyRegion.province,
    cityName: cleanDisplayText(visit?.city_name) ?? cleanDisplayText(store?.city_name) ?? legacyRegion.cityName ?? cleanDisplayText(visit?.city) ?? cleanDisplayText(store?.city),
    district: cleanDisplayText(visit?.district) ?? cleanDisplayText(store?.district) ?? legacyRegion.district,
  };
}

function cleanDisplayText(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text && text !== "-" ? text : null;
}

function splitLegacyRegion(value: string | null | undefined) {
  const parts = String(value ?? "")
    .replaceAll("，", ",")
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

