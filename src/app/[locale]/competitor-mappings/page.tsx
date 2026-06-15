import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CompetitorMappingsTable } from "@/components/competitor-mappings-table";
import { CompetitorSeriesRulesPanel } from "@/components/competitor-series-rules-panel";
import { Button, Card, DataNotice, SelectInput, TextInput } from "@/components/ui";
import { getBrands, getCompetitorProducts, getCompetitorSeriesMappings, getMaterialMaster } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";

export default async function CompetitorMappingsPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ brand?: string; series?: string; product?: string; size?: string; mapping?: string }>;
}) {
  const { locale, dict } = await getPageI18n(routeParams);
  const params = await searchParams;
  const mappingStatus = normalizeMappingStatus(params.mapping);
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
    return true;
  });
  const brandOptions = competitorBrandOptions(competitorProducts);
  const seriesOptions = competitorSeriesOptions(competitorProducts, params.brand);
  const filteredProducts = competitorProducts.filter((product) => {
    if (params.brand && product.brand_id !== params.brand) return false;
    if (params.series && seriesKey(product.product_series) !== seriesKey(params.series)) return false;
    if (params.product && !productNameMatches(product, params.product)) return false;
    if (params.size && product.size !== params.size) return false;
    return true;
  });
  const products = filteredProducts.filter((product) => {
    if (mappingStatus === "pending" && product.sku_matches?.[0]) return false;
    if (mappingStatus === "mapped" && !product.sku_matches?.[0]) return false;
    return true;
  });
  const copy = getCopy(locale);

  return (
    <AppShell locale={locale} dict={dict} title={copy.title} currentPath="/competitor-mappings" isDemo={productsResult.isDemo || materialResult.isDemo || seriesMappingsResult.isDemo}>
      <DataNotice dict={dict} error={productsResult.error ?? brandsResult.error ?? materialResult.error ?? seriesMappingsResult.error} />
      <Card className="mb-4">
        <form className="grid gap-3 md:grid-cols-5">
          <input type="hidden" name="mapping" value={mappingStatus} />
          <SelectInput name="brand" defaultValue={params.brand ?? ""}>
            <option value="">{dict.common.allBrands}</option>
            {brandOptions.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </SelectInput>
          <SelectInput name="series" defaultValue={params.series ?? ""}>
            <option value="">{copy.allSeries}</option>
            {seriesOptions.map((series) => <option key={series.value} value={series.value}>{series.label}</option>)}
          </SelectInput>
          <TextInput name="product" placeholder={dict.common.product} defaultValue={params.product ?? ""} />
          <TextInput name="size" placeholder={dict.common.size} defaultValue={params.size ?? ""} />
          <Button type="submit">{dict.common.filter}</Button>
        </form>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <MappingStatusTabs locale={locale} params={params} active={mappingStatus} labels={copy} />
          <Link href={`/${locale}/competitor-products`} className="text-sm font-medium text-blue-700 hover:underline">
            {copy.productMasterLink}
          </Link>
        </div>
        <CompetitorSeriesRulesPanel
          products={filteredProducts}
          materials={materialResult.data}
          rules={seriesMappingsResult.data}
          locale={locale}
        />
        <CompetitorMappingsTable products={products} materials={materialResult.data} locale={locale} dict={dict} mappingStatus={mappingStatus} />
      </Card>
    </AppShell>
  );
}

function isOwnBrandName(value: string | null | undefined) {
  return value?.trim().toLowerCase() === "makuku";
}

function productNameMatches(product: { raw_title: string; normalized_name: string }, keyword: string) {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) return true;
  return `${product.raw_title} ${product.normalized_name}`.toLowerCase().includes(normalizedKeyword);
}

type MappingStatus = "pending" | "mapped" | "all";

function normalizeMappingStatus(value: string | undefined): MappingStatus {
  if (value === "mapped" || value === "all") return value;
  return "pending";
}

function MappingStatusTabs({
  locale,
  params,
  active,
  labels,
}: {
  locale: string;
  params: { brand?: string; series?: string; product?: string; size?: string };
  active: MappingStatus;
  labels: ReturnType<typeof getCopy>;
}) {
  const tabs: Array<{ value: MappingStatus; label: string }> = [
    { value: "pending", label: labels.pending },
    { value: "mapped", label: labels.mapped },
    { value: "all", label: labels.all },
  ];

  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
      {tabs.map((tab) => {
        const selected = active === tab.value;
        return (
          <Link
            key={tab.value}
            href={mappingStatusHref(locale, params, tab.value)}
            className={selected
              ? "inline-flex h-8 items-center rounded-md bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm"
              : "inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-slate-600 hover:bg-white"}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

function mappingStatusHref(locale: string, params: { brand?: string; series?: string; product?: string; size?: string }, mapping: MappingStatus) {
  const nextParams = new URLSearchParams();
  if (mapping !== "pending") nextParams.set("mapping", mapping);
  if (params.brand) nextParams.set("brand", params.brand);
  if (params.series) nextParams.set("series", params.series);
  if (params.product) nextParams.set("product", params.product);
  if (params.size) nextParams.set("size", params.size);
  const query = nextParams.toString();
  return `/${locale}/competitor-mappings${query ? `?${query}` : ""}`;
}

function getCopy(locale: string) {
  const isZh = locale === "zh";
  return {
    title: isZh ? "竞品映射" : "Competitor Mapping",
    pending: isZh ? "待关联" : "Pending",
    mapped: isZh ? "已关联" : "Mapped",
    all: isZh ? "全部" : "All",
    allSeries: isZh ? "全部系列" : "All series",
    noSeries: isZh ? "无系列" : "No series",
    productMasterLink: isZh ? "进入竞品主数据" : "Go to Competitor Product Master",
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
