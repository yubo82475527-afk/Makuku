import { Download } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { PriceSnapshotsTable } from "@/components/price-snapshots-table";
import { Button, Card, DataNotice, SelectInput, TextInput } from "@/components/ui";
import { priceBrandSeriesLabel } from "@/lib/brand-series";
import { getPriceSnapshots } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import {
  priceSnapshotBusinessLine,
  priceSnapshotBusinessSegment,
  priceSnapshotBusinessSize,
  priceSnapshotMakukuMaterialCode,
} from "@/lib/price-snapshot-business";
import { productGradeOptions } from "@/lib/segments";
import type { PriceSnapshot } from "@/lib/types";

export default async function PricesPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    brand?: string;
    sku?: string;
    line?: string;
    priceBand?: string;
    size?: string;
    province?: string;
    cityName?: string;
    district?: string;
    store?: string;
    page?: string;
    per_page?: string;
  }>;
}) {
  const { locale, dict } = await getPageI18n(routeParams);
  const params = await searchParams;
  const pageParam = Number.parseInt(params.page ?? "1", 10);
  const perPageParam = Number.parseInt(params.per_page ?? "50", 10);
  const requestedPage = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
  const perPage = Number.isFinite(perPageParam) && perPageParam > 0 ? Math.min(200, Math.floor(perPageParam)) : 50;
  const currentParams = new URLSearchParams();
  for (const key of ["brand", "sku", "line", "priceBand", "size", "province", "cityName", "district", "store"] as const) {
    if (params[key]) currentParams.set(key, params[key]);
  }
  currentParams.set("locale", locale);
  const exportHref = `/api/price-snapshots/export?${currentParams.toString()}`;

  const pricesResult = await getPriceSnapshots();

  const productSizes = Array.from(new Set([...pricesResult.data.map(priceSnapshotBusinessSize), params.size].filter(Boolean) as string[])).sort();
  const brandSeriesOptions = uniqueOptions(pricesResult.data.map(priceBrandSeriesLabel));
  const prices = pricesResult.data.filter((snapshot) => snapshotMatchesFilters(snapshot, params));
  const total = prices.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(requestedPage, pageCount);
  const pagedPrices = prices.slice((page - 1) * perPage, page * perPage);
  const currentPathParams = new URLSearchParams(currentParams);
  currentPathParams.delete("locale");
  currentPathParams.set("page", String(page));
  currentPathParams.set("per_page", String(perPage));
  const currentPath = `/prices?${currentPathParams.toString()}`;

  return (
    <AppShell locale={locale} dict={dict} title={dict.prices.title} currentPath={currentPath} isDemo={pricesResult.isDemo}>
      <DataNotice dict={dict} error={pricesResult.error} />
      <Card className="mb-4">
        <form className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
          <SelectInput name="brand" defaultValue={params.brand ?? ""}>
            <option value="">{dict.common.allBrands}</option>
            {brandSeriesOptions.map((brand) => (
              <option key={brand} value={brand}>{brand}</option>
            ))}
          </SelectInput>
          <SelectInput name="priceBand" defaultValue={params.priceBand ?? ""}>
            <option value="">{locale === "zh" ? "全部商品等级" : "All grades"}</option>
            {productGradeOptions().map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </SelectInput>
          <SelectInput name="size" defaultValue={params.size ?? ""}>
            <option value="">{locale === "zh" ? "全部尺码" : "All sizes"}</option>
            {productSizes.map((size) => <option key={size} value={size}>{size}</option>)}
          </SelectInput>
          <TextInput name="province" placeholder={locale === "zh" ? "省" : "Province"} defaultValue={params.province ?? ""} />
          <TextInput name="cityName" placeholder={locale === "zh" ? "城市" : "City"} defaultValue={params.cityName ?? ""} />
          <TextInput name="district" placeholder={locale === "zh" ? "区/县" : "District"} defaultValue={params.district ?? ""} />
          <TextInput name="store" placeholder={locale === "zh" ? "门店" : "Store"} defaultValue={params.store ?? ""} />
          <TextInput name="sku" placeholder={dict.prices.skuId} defaultValue={params.sku ?? ""} />
          <Button type="submit">{dict.common.filter}</Button>
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
        <PriceSnapshotsTable snapshots={pagedPrices} locale={locale} />
        <PricesPagination
          locale={locale}
          page={page}
          perPage={perPage}
          total={total}
          baseParams={currentParams}
        />
      </Card>
    </AppShell>
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

function snapshotMatchesFilters(
  snapshot: PriceSnapshot,
  params: {
    brand?: string;
    sku?: string;
    line?: string;
    priceBand?: string;
    size?: string;
    province?: string;
    cityName?: string;
    district?: string;
    store?: string;
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
  return true;
}

type PriceSnapshotForStoreRegion = {
  captured_at?: string | null;
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
  return snapshot.ai_price_candidates?.find((candidate) => candidate.offline_store_visits)?.offline_store_visits ?? null;
}

function storeNameForSnapshot(snapshot: PriceSnapshotForStoreRegion) {
  return cleanDisplayText(storeVisitForSnapshot(snapshot)?.store_name)
    ?? cleanDisplayText(snapshot.offline_stores?.name)
    ?? cleanDisplayText(snapshot.competitor_products?.shop_name)
    ?? "-";
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

function uniqueOptions(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}

