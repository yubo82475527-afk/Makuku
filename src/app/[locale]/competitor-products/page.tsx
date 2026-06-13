import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CompetitorProductsTable } from "@/components/competitor-products-table";
import { Button, Card, DataNotice, SelectInput, TextInput } from "@/components/ui";
import { getBrands, getCompetitorProducts } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";

export default async function CompetitorProductsPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ brand?: string; product?: string; size?: string; status?: string }>;
}) {
  const { locale, dict } = await getPageI18n(routeParams);
  const params = await searchParams;
  const [productsResult, brandsResult] = await Promise.all([getCompetitorProducts(), getBrands()]);
  const ownBrandIds = new Set(brandsResult.data.filter((brand) => brand.is_own_brand || isOwnBrandName(brand.name)).map((brand) => brand.id));
  const products = productsResult.data.filter((product) => {
    if (ownBrandIds.has(product.brand_id)) return false;
    if (isOwnBrandName(product.brands?.name)) return false;
    if (params.brand && product.brand_id !== params.brand) return false;
    if (params.product && !productNameMatches(product, params.product)) return false;
    if (params.size && product.size !== params.size) return false;
    if (params.status === "active" && product.status === "disabled") return false;
    if (params.status === "disabled" && product.status !== "disabled") return false;
    return true;
  });
  const copy = getCopy(locale);

  return (
    <AppShell locale={locale} dict={dict} title={copy.title} currentPath="/competitor-products" isDemo={productsResult.isDemo}>
      <DataNotice dict={dict} error={productsResult.error ?? brandsResult.error} />
      <Card className="mb-4">
        <form className="grid gap-3 md:grid-cols-5">
          <SelectInput name="brand" defaultValue={params.brand ?? ""}>
            <option value="">{dict.common.allBrands}</option>
            {brandsResult.data.filter((brand) => !brand.is_own_brand && !isOwnBrandName(brand.name)).map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </SelectInput>
          <TextInput name="product" placeholder={dict.common.product} defaultValue={params.product ?? ""} />
          <TextInput name="size" placeholder={dict.common.size} defaultValue={params.size ?? ""} />
          <SelectInput name="status" defaultValue={params.status ?? ""}>
            <option value="">{copy.allStatus}</option>
            <option value="active">{copy.active}</option>
            <option value="disabled">{copy.disabled}</option>
          </SelectInput>
          <Button type="submit">{dict.common.filter}</Button>
        </form>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">{copy.productCount(products.length)}</div>
            <div className="text-xs text-slate-500">{copy.hint}</div>
          </div>
          <Link
            href={`/${locale}/internal/excel-price-import`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {copy.excelImport}
          </Link>
        </div>
        <CompetitorProductsTable products={products} locale={locale} dict={dict} />
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

function getCopy(locale: string) {
  const isZh = locale === "zh";
  return {
    title: isZh ? "竞品主数据" : "Competitor Product Master",
    hint: isZh ? "维护竞品商品规格字段；Makuku 对标关系请到竞品映射维护。" : "Maintain competitor product fields here. Manage Makuku links in Competitor Mapping.",
    excelImport: isZh ? "Excel 导入" : "Excel Import",
    allStatus: isZh ? "全部状态" : "All Status",
    active: isZh ? "启用" : "Active",
    disabled: isZh ? "禁用" : "Disabled",
    productCount: (count: number) => isZh ? `${count} 条竞品商品` : `${count} competitor products`,
  };
}
