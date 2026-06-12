import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button, Card, DataNotice, SelectInput, TextInput } from "@/components/ui";
import { CompetitorMappingTable } from "@/components/competitor-mapping-table";
import { getBrands, getCompetitorProducts, getMaterialMaster } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";

export default async function CompetitorsPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ brand?: string; product?: string; size?: string; mapping?: string }>;
}) {
  const { locale, dict } = await getPageI18n(routeParams);
  const params = await searchParams;
  const mappingStatus = normalizeMappingStatus(params.mapping);
  const [productsResult, brandsResult, materialResult] = await Promise.all([
    getCompetitorProducts(),
    getBrands(),
    getMaterialMaster(),
  ]);
  const ownBrandIds = new Set(brandsResult.data.filter((brand) => brand.is_own_brand || isOwnBrandName(brand.name)).map((brand) => brand.id));
  const products = productsResult.data.filter((product) => {
    if (ownBrandIds.has(product.brand_id)) return false;
    if (isOwnBrandName(product.brands?.name)) return false;
    if (params.brand && product.brand_id !== params.brand) return false;
    if (params.product && !productNameMatches(product, params.product)) return false;
    if (params.size && product.size !== params.size) return false;
    if (mappingStatus === "pending" && product.sku_matches?.[0]) return false;
    if (mappingStatus === "mapped" && !product.sku_matches?.[0]) return false;
    return true;
  });
  const mappingCopy = getMappingCopy(locale);

  return (
    <AppShell locale={locale} dict={dict} title={dict.competitors.title} currentPath="/competitors" isDemo={productsResult.isDemo || materialResult.isDemo}>
      <DataNotice dict={dict} error={productsResult.error ?? brandsResult.error ?? materialResult.error} />
      <Card className="mb-4">
        <form className="grid gap-3 md:grid-cols-4">
          <input type="hidden" name="mapping" value={mappingStatus} />
          <SelectInput name="brand" defaultValue={params.brand ?? ""}>
            <option value="">{dict.common.allBrands}</option>
            {brandsResult.data.filter((brand) => !brand.is_own_brand && !isOwnBrandName(brand.name)).map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </SelectInput>
          <TextInput name="product" placeholder={dict.common.product} defaultValue={params.product ?? ""} />
          <TextInput name="size" placeholder={dict.common.size} defaultValue={params.size ?? ""} />
          <Button type="submit">{dict.common.filter}</Button>
        </form>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <MappingStatusTabs locale={locale} params={params} active={mappingStatus} labels={mappingCopy} />
        </div>
        <CompetitorMappingTable products={products} materials={materialResult.data} locale={locale} dict={dict} mappingStatus={mappingStatus} />
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
  params: { brand?: string; product?: string; size?: string };
  active: MappingStatus;
  labels: ReturnType<typeof getMappingCopy>;
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

function mappingStatusHref(locale: string, params: { brand?: string; product?: string; size?: string }, mapping: MappingStatus) {
  const nextParams = new URLSearchParams();
  if (mapping !== "pending") nextParams.set("mapping", mapping);
  if (params.brand) nextParams.set("brand", params.brand);
  if (params.product) nextParams.set("product", params.product);
  if (params.size) nextParams.set("size", params.size);
  const query = nextParams.toString();
  return `/${locale}/competitors${query ? `?${query}` : ""}`;
}

function getMappingCopy(locale: string) {
  const isZh = locale === "zh";
  return {
    pending: isZh ? "待关联" : "Pending",
    mapped: isZh ? "已关联" : "Mapped",
    all: isZh ? "全部" : "All",
  };
}
