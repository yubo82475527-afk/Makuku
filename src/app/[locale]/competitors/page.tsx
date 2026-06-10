import { AppShell } from "@/components/app-shell";
import { ProductMasterSearchSelect } from "@/components/product-master-search-select";
import { Badge, Button, Card, DataNotice, SelectInput, TextInput } from "@/components/ui";
import { getBrands, getCompetitorProducts, getMaterialMaster } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import { translateEnum } from "@/lib/i18n/get-dictionary";
import type { MaterialMaster, SkuMaster } from "@/lib/types";
import Link from "next/link";

export default async function CompetitorsPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ brand?: string; channel?: string; size?: string }>;
}) {
  const { locale, dict } = await getPageI18n(routeParams);
  const params = await searchParams;
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
    if (params.channel && product.channel !== params.channel) return false;
    if (params.size && product.size !== params.size) return false;
    return true;
  });

  return (
    <AppShell locale={locale} dict={dict} title={dict.competitors.title} currentPath="/competitors" isDemo={productsResult.isDemo || materialResult.isDemo}>
      <DataNotice dict={dict} error={productsResult.error ?? brandsResult.error ?? materialResult.error} />
      <Card className="mb-4">
        <form className="grid gap-3 md:grid-cols-4">
          <SelectInput name="brand" defaultValue={params.brand ?? ""}>
            <option value="">{dict.common.allBrands}</option>
            {brandsResult.data.filter((brand) => !brand.is_own_brand && !isOwnBrandName(brand.name)).map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </SelectInput>
          <SelectInput name="channel" defaultValue={params.channel ?? ""}>
            <option value="">{dict.common.allChannels}</option>
            <option value="shopee">{translateEnum(dict, "channel", "shopee")}</option>
            <option value="offline">{translateEnum(dict, "channel", "offline")}</option>
            <option value="tiktok">{translateEnum(dict, "channel", "tiktok")}</option>
            <option value="manual">{translateEnum(dict, "channel", "manual")}</option>
          </SelectInput>
          <TextInput name="size" placeholder={dict.common.size} defaultValue={params.size ?? ""} />
          <Button type="submit">{dict.common.filter}</Button>
        </form>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">{dict.common.brand}</th>
                <th className="py-2 pr-3">{dict.common.product}</th>
                <th className="py-2 pr-3">{dict.common.channel}</th>
                <th className="py-2 pr-3">{dict.common.size}</th>
                <th className="py-2 pr-3">{dict.common.pcs}</th>
                <th className="py-2 pr-3">{dict.common.segment}</th>
                <th className="py-2 pr-3">{locale === "zh" ? "关联产品主数据" : "Map product master"}</th>
                <th className="py-2 pr-3">{locale === "zh" ? "关联状态" : "Mapping status"}</th>
                <th className="py-2 pr-3">{locale === "zh" ? "关联方式" : "Mapping method"}</th>
                <th className="py-2 pr-3">{locale === "zh" ? "标杆" : "Benchmark"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {products.map((product) => {
                const match = product.sku_matches?.[0];
                const selectedMaterialCode = findMaterialCodeForSku(match?.sku_master, materialResult.data);
                const setBenchmarkHref = match?.sku_master
                  ? `/${locale}/market-benchmarks?competitorProductId=${encodeURIComponent(product.id)}`
                  : null;
                return (
                  <tr key={product.id}>
                    <td className="py-3 pr-3 font-medium">{product.brands?.name}</td>
                    <td className="py-3 pr-3">{product.normalized_name}</td>
                    <td className="py-3 pr-3"><Badge>{translateEnum(dict, "channel", product.channel)}</Badge></td>
                    <td className="py-3 pr-3">{product.size}</td>
                    <td className="py-3 pr-3">{product.piece_count}</td>
                    <td className="py-3 pr-3">{translateEnum(dict, "segment", product.segment)}</td>
                    <td className="min-w-72 py-3 pr-3">
                      <form action="/api/sku-matches" method="post" className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="return_to" value={`/${locale}/competitors`} />
                        <input type="hidden" name="competitor_product_id" value={product.id} />
                        {match?.id ? <input type="hidden" name="match_id" value={match.id} /> : null}
                        <ProductMasterSearchSelect materials={materialResult.data} selectedCode={selectedMaterialCode} locale={locale} />
                        <Button type="submit" className="h-9 whitespace-nowrap">{locale === "zh" ? "保存关联" : "Save"}</Button>
                      </form>
                    </td>
                    <td className="py-3 pr-3">
                      <Badge tone={match ? "low" : "neutral"}>{match ? locale === "zh" ? "已关联" : "Mapped" : locale === "zh" ? "未关联" : "Unmapped"}</Badge>
                    </td>
                    <td className="py-3 pr-3">{match ? formatMatchMethod(match.match_method, locale) : "-"}</td>
                    <td className="py-3 pr-3">
                      {setBenchmarkHref ? (
                        <Link href={setBenchmarkHref} className="font-medium text-blue-700 hover:underline">
                          {locale === "zh" ? "设为市场标杆" : "Set benchmark"}
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">{locale === "zh" ? "未关联产品主数据" : "Missing product master"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}

function isOwnBrandName(value: string | null | undefined) {
  return value?.trim().toLowerCase() === "makuku";
}

function findMaterialCodeForSku(sku: SkuMaster | null | undefined, materials: MaterialMaster[]) {
  if (!sku) return "";
  const normalizedSkuName = normalizeText(sku.makuku_sku_name);
  const matched = materials.find((material) => {
    if (normalizeText(material.tenant_sku_name) !== normalizedSkuName) return false;
    if (normalizeText(material.sub_type) !== normalizeText(sku.size)) return false;
    return Number(material.pack_count) === Number(sku.piece_count);
  }) ?? materials.find((material) => normalizeText(material.tenant_sku_name) === normalizedSkuName);
  return matched?.tenant_sku_code ?? "";
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function formatMatchMethod(value: string | null | undefined, locale: string) {
  const method = normalizeText(value);
  if (method === "manual") return locale === "zh" ? "人工确认" : "Manual confirmed";
  if (method.includes("ai") || method.includes("auto") || method.includes("rule")) return locale === "zh" ? "AI建议" : "AI suggested";
  return locale === "zh" ? "系统导入" : "System import";
}
