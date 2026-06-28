import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CompetitorSeriesRulesPanel } from "@/components/competitor-series-rules-panel";
import { Button, Card, DataNotice, SelectInput } from "@/components/ui";
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
    return true;
  });
  const brandOptions = competitorBrandOptions(competitorProducts);
  const seriesOptions = competitorSeriesOptions(competitorProducts, params.brand);
  const filteredProducts = competitorProducts.filter((product) => {
    if (params.brand && product.brand_id !== params.brand) return false;
    if (params.series && seriesKey(product.product_series) !== seriesKey(params.series)) return false;
    return true;
  });
  const filteredRules = seriesMappingsResult.data.filter((rule) => {
    if (params.brand && rule.brand_id !== params.brand) return false;
    if (params.series && seriesKey(rule.product_series) !== seriesKey(params.series)) return false;
    return true;
  });
  const copy = getCopy(locale);

  return (
    <AppShell locale={locale} dict={dict} title={copy.title} currentPath="/competitor-mappings" isDemo={productsResult.isDemo || materialResult.isDemo || seriesMappingsResult.isDemo}>
      <DataNotice dict={dict} error={productsResult.error ?? brandsResult.error ?? materialResult.error ?? seriesMappingsResult.error} />
      <Card className="mb-4">
        <form className="grid gap-3 md:grid-cols-3">
          <SelectInput name="brand" defaultValue={params.brand ?? ""}>
            <option value="">{dict.common.allBrands}</option>
            {brandOptions.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </SelectInput>
          <SelectInput name="series" defaultValue={params.series ?? ""}>
            <option value="">{copy.allSeries}</option>
            {seriesOptions.map((series) => <option key={series.value} value={series.value}>{series.label}</option>)}
          </SelectInput>
          <Button type="submit">{dict.common.filter}</Button>
        </form>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link href={`/${locale}/competitor-products`} className="text-sm font-medium text-blue-700 hover:underline">
            {copy.productMasterLink}
          </Link>
        </div>
        <CompetitorSeriesRulesPanel
          products={filteredProducts}
          materials={materialResult.data}
          rules={filteredRules}
          locale={locale}
        />
      </Card>
    </AppShell>
  );
}

function isOwnBrandName(value: string | null | undefined) {
  return value?.trim().toLowerCase() === "makuku";
}

function getCopy(locale: string) {
  const isZh = locale === "zh";
  return {
    title: isZh ? "自动 SKU 映射" : "Auto SKU Mapping",
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
