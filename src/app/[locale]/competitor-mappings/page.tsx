import Link from "next/link";
import { PageShellState } from "@/components/page-shell-state";
import { CompetitorSeriesRulesPanel } from "@/components/competitor-series-rules-panel";
import { QueryForm, QuerySubmitButton } from "@/components/query-form";
import { Card, DataNotice } from "@/components/ui";
import { getBrands, getCompetitorProducts, getCompetitorSeriesMappings, getMaterialMaster } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";

export default async function CompetitorMappingsPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ brand?: string; series?: string }>;
}) {
  const { locale, dict } = await getPageI18n(routeParams);
  const params = await searchParams;
  const [productsResult, brandsResult, materialResult, seriesMappingsResult] = await Promise.all([
    getCompetitorProducts(),
    getBrands(),
    getMaterialMaster(),
    getCompetitorSeriesMappings(),
  ]);
  const ownBrandIds = new Set(brandsResult.data.filter((brand) => brand.is_own_brand || isOwnBrandName(brand.name)).map((brand) => brand.id));
  const competitorProducts = productsResult.data.filter((product) => {
    if (ownBrandIds.has(product.brand_id)) return false;
    if (isOwnBrandName(product.brands?.name)) return false;
    // Mapping options follow Active master data only; disabled rows are historical dirty spellings.
    if (product.status === "disabled") return false;
    return true;
  });
  const brandOptions = competitorBrandOptions(competitorProducts);
  const seriesOptions = competitorSeriesOptions(competitorProducts, params.brand);
  const filteredRules = seriesMappingsResult.data.filter((rule) => {
    if (params.brand && rule.brand_id !== params.brand) return false;
    if (params.series && seriesKey(rule.product_series) !== seriesKey(params.series)) return false;
    return true;
  });
  const copy = getCopy(locale);

  return (
    <>
      <PageShellState locale={locale} dict={dict} title={copy.title} currentPath="/competitor-mappings" isDemo={productsResult.isDemo || materialResult.isDemo || seriesMappingsResult.isDemo} />
      <DataNotice dict={dict} error={productsResult.error ?? brandsResult.error ?? materialResult.error ?? seriesMappingsResult.error} />
      <Card className="mb-4">
        <QueryForm className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_minmax(120px,180px)]">
          <BrandFilter
            locale={locale}
            brand={params.brand ?? ""}
            options={brandOptions}
            allBrandsLabel={dict.common.allBrands}
          />
          <SeriesFilter
            locale={locale}
            series={params.series ?? ""}
            options={seriesOptions}
            allSeriesLabel={copy.allSeries}
          />
          <QuerySubmitButton
            idleLabel={dict.common.filter}
            pendingLabel={locale === "zh" ? "筛选中..." : "Filtering..."}
          />
        </QueryForm>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link href={`/${locale}/competitor-products`} className="text-sm font-medium text-blue-700 hover:underline">
            {copy.productMasterLink}
          </Link>
        </div>
        <CompetitorSeriesRulesPanel
          products={competitorProducts}
          materials={materialResult.data}
          rules={filteredRules}
          locale={locale}
        />
      </Card>
    </>
  );
}

const filterControlClassName =
  "flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200";

function BrandFilter({
  locale,
  brand,
  options,
  allBrandsLabel,
}: {
  locale: string;
  brand: string;
  options: Array<{ id: string; name: string }>;
  allBrandsLabel: string;
}) {
  const isZh = locale === "zh";
  return (
    <label className={filterControlClassName}>
      <span className="mr-2 shrink-0 text-xs font-medium text-slate-500">{isZh ? "竞品品牌" : "Competitor Brand"}</span>
      <select name="brand" defaultValue={brand} className="min-w-0 flex-1 bg-transparent py-2 outline-none">
        <option value="">{allBrandsLabel}</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>{item.name}</option>
        ))}
      </select>
    </label>
  );
}

function SeriesFilter({
  locale,
  series,
  options,
  allSeriesLabel,
}: {
  locale: string;
  series: string;
  options: Array<{ value: string; label: string }>;
  allSeriesLabel: string;
}) {
  const isZh = locale === "zh";
  return (
    <label className={filterControlClassName}>
      <span className="mr-2 shrink-0 text-xs font-medium text-slate-500">{isZh ? "竞品系列" : "Competitor Series"}</span>
      <select name="series" defaultValue={series} className="min-w-0 flex-1 bg-transparent py-2 outline-none">
        <option value="">{allSeriesLabel}</option>
        {options.map((item) => (
          <option key={item.value} value={item.value}>{item.label}</option>
        ))}
      </select>
    </label>
  );
}

function isOwnBrandName(value: string | null | undefined) {
  return value?.trim().toLowerCase() === "makuku";
}

function getCopy(locale: string) {
  const isZh = locale === "zh";
  return {
    title: isZh ? "竞品对标" : "Competitor Benchmarking",
    allSeries: isZh ? "全部系列" : "All series",
    noSeries: isZh ? "无系列" : "No series",
    productMasterLink: isZh ? "进入竞品产品" : "Go to Competitor Products",
  };
}

function competitorBrandOptions(products: Array<{ brand_id: string; brands?: { name?: string | null } | null }>) {
  const brands = new Map<string, string>();
  for (const product of products) {
    if (!brands.has(product.brand_id)) brands.set(product.brand_id, product.brands?.name ?? "");
  }
  return Array.from(brands, ([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name));
}

function competitorSeriesOptions(products: Array<{ brand_id: string; product_series?: string | null }>, brandId: string | undefined) {
  const values = new Map<string, string>();
  for (const product of products) {
    if (brandId && product.brand_id !== brandId) continue;
    const value = product.product_series ?? "";
    const key = seriesKey(value);
    if (!values.has(key)) values.set(key, value);
  }
  return Array.from(values.values())
    .map((value) => ({ value, label: value || getCopy("zh").noSeries }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function seriesKey(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
