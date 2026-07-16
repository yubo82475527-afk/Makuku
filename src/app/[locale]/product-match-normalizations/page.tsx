import { PageShellState } from "@/components/page-shell-state";
import { ProductMatchNormalizationsPanel } from "@/components/product-match-normalizations-panel";
import { Card, DataNotice } from "@/components/ui";
import { getCompetitorProducts, getMaterialMaster, getProductMatchNormalizations } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import type { ProductMatchNormalizationField } from "@/lib/types";

export default async function ProductMatchNormalizationsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { locale, dict } = await getPageI18n(params);
  const query = await searchParams;
  const [materialsResult, productsResult, rulesResult] = await Promise.all([
    getMaterialMaster(),
    getCompetitorProducts(),
    getProductMatchNormalizations(),
  ]);
  const options = canonicalOptions(materialsResult.data, productsResult.data);
  const title = locale === "zh" ? "商品匹配标准化" : "Product Match Normalization";
  const editingRule = rulesResult.data.find((rule) => rule.id === query.edit) ?? null;
  return (
    <>
      <PageShellState locale={locale} dict={dict} title={title} currentPath="/product-match-normalizations" isDemo={materialsResult.isDemo || productsResult.isDemo || rulesResult.isDemo} />
      <DataNotice dict={dict} error={materialsResult.error ?? productsResult.error ?? rulesResult.error} />
      <Card>
        <div className="mb-4">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{locale === "zh" ? "新建巡店解析与匹配重跑共用这些规则。" : "New Visit analysis and matching reruns use the same rules."}</p>
        </div>
        <ProductMatchNormalizationsPanel locale={locale} rules={rulesResult.data} brandOptions={options.brand} canonicalOptions={options} editingRule={editingRule} />
      </Card>
    </>
  );
}

function canonicalOptions(materials: Array<{ brand: string; sub_brand: string | null; sub_type: string | null; pack_count: number }>, products: Array<{ brands?: { name?: string | null } | null; product_series?: string | null; size: string | null; piece_count: number | null }>) {
  const values: Record<ProductMatchNormalizationField, Set<string>> = {
    brand: new Set(),
    series: new Set(),
    size: new Set(),
    piece_count: new Set(),
  };
  for (const material of materials) {
    values.brand.add(material.brand);
    if (material.sub_brand) values.series.add(material.sub_brand);
    if (material.sub_type) values.size.add(material.sub_type);
    if (material.pack_count > 0) values.piece_count.add(String(material.pack_count));
  }
  for (const product of products) {
    if (product.brands?.name) values.brand.add(product.brands.name);
    if (product.product_series) values.series.add(product.product_series);
    if (product.size) values.size.add(product.size);
    if (Number(product.piece_count) > 0) values.piece_count.add(String(product.piece_count));
  }
  return {
    brand: Array.from(values.brand).sort(),
    series: Array.from(values.series).sort(),
    size: Array.from(values.size).sort(),
    piece_count: Array.from(values.piece_count).sort((left, right) => Number(left) - Number(right)),
  };
}
