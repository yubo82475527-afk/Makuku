"use client";

import Link from "next/link";
import { ProductMasterSearchSelect } from "@/components/product-master-search-select";
import { Badge, Button } from "@/components/ui";
import type { Dictionary } from "@/lib/i18n/get-dictionary";
import type { CompetitorProduct, MaterialMaster, SkuMaster } from "@/lib/types";

type MappingStatus = "pending" | "mapped" | "all";

type CompetitorMappingsTableProps = {
  products: CompetitorProduct[];
  materials: MaterialMaster[];
  locale: string;
  dict: Dictionary;
  mappingStatus: MappingStatus;
};

export function CompetitorMappingsTable({ products, materials, locale, dict, mappingStatus }: CompetitorMappingsTableProps) {
  const copy = getCopy(locale);
  const showMappingSummaryColumns = mappingStatus !== "pending";

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className={`${showMappingSummaryColumns ? "min-w-[1320px]" : "min-w-[1120px]"} w-full table-fixed text-left text-sm`}>
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
          <tr>
            <th className="w-44 px-3 py-2 whitespace-nowrap">{dict.common.brand}</th>
            <th className="w-72 px-3 py-2 whitespace-nowrap">{copy.competitorSku}</th>
            <th className="w-40 px-3 py-2 whitespace-nowrap">{copy.spec}</th>
            <th className="w-96 px-3 py-2 whitespace-nowrap">{copy.mapProductMaster}</th>
            {showMappingSummaryColumns ? <th className="w-28 px-3 py-2 whitespace-nowrap">{copy.mappingStatus}</th> : null}
            {showMappingSummaryColumns ? <th className="w-32 px-3 py-2 whitespace-nowrap">{copy.mappingMethod}</th> : null}
            {showMappingSummaryColumns ? <th className="w-36 px-3 py-2 whitespace-nowrap">{copy.benchmark}</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {products.map((product) => {
            const match = product.sku_matches?.[0];
            const selectedMaterialCode = findMaterialCodeForSku(match?.sku_master, materials);
            const setBenchmarkHref = match?.sku_master
              ? `/${locale}/market-benchmarks?competitorProductId=${encodeURIComponent(product.id)}`
              : null;
            return (
              <tr key={product.id} className="hover:bg-slate-50">
                <td className="overflow-hidden px-3 py-3 font-medium">
                  <div className="truncate" title={product.brands?.name ?? ""}>{product.brands?.name}</div>
                </td>
                <td className="overflow-hidden px-3 py-3">
                  <div className="truncate font-medium text-slate-900" title={product.normalized_name}>{product.normalized_name}</div>
                  <div className="mt-1 text-xs text-slate-500">{product.competitor_sku_code ?? product.raw_title}</div>
                </td>
                <td className="px-3 py-3 text-xs text-slate-600">
                  <div>{copy.packageType}: {product.package_type ?? "-"}</div>
                  <div>{dict.common.size}: {product.size ?? "-"} / {dict.common.pcs}: {product.piece_count ?? "-"}</div>
                </td>
                <td className="px-3 py-3">
                  <form action="/api/sku-matches" method="post" className="flex min-w-0 items-center gap-2">
                    <input type="hidden" name="return_to" value={`/${locale}/competitor-mappings`} />
                    <input type="hidden" name="competitor_product_id" value={product.id} />
                    <ProductMasterSearchSelect materials={materials} selectedCode={selectedMaterialCode} selectedLabel={formatSelectedSkuLabel(match?.sku_master)} locale={locale} />
                    <Button type="submit" className="h-9 whitespace-nowrap">{copy.saveMapping}</Button>
                  </form>
                </td>
                {showMappingSummaryColumns ? (
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex flex-col items-start gap-1">
                      <Badge tone={match ? "low" : "neutral"}>{match ? copy.mapped : copy.unmapped}</Badge>
                      {match ? (
                        <form action="/api/sku-matches" method="post">
                          <input type="hidden" name="return_to" value={`/${locale}/competitor-mappings?mapping=all`} />
                          <input type="hidden" name="competitor_product_id" value={product.id} />
                          <button type="submit" className="text-xs font-medium text-slate-500 hover:text-red-700 hover:underline">
                            {copy.clearMapping}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                ) : null}
                {showMappingSummaryColumns ? <td className="px-3 py-3 whitespace-nowrap">{match ? formatMatchMethod(match.match_method, locale) : "-"}</td> : null}
                {showMappingSummaryColumns ? (
                  <td className="px-3 py-3 whitespace-nowrap">
                    {setBenchmarkHref ? (
                      <Link href={setBenchmarkHref} className="font-medium text-blue-700 hover:underline">
                        {copy.setBenchmark}
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-400">{copy.missingProductMaster}</span>
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function findMaterialCodeForSku(sku: SkuMaster | null | undefined, materials: MaterialMaster[]) {
  if (!sku) return "";
  if (sku.material_sku_code) return sku.material_sku_code;
  const normalizedSkuName = normalizeText(sku.makuku_sku_name);
  const matched = materials.find((material) => {
    if (normalizeText(material.tenant_sku_name) !== normalizedSkuName) return false;
    if (normalizeText(material.sub_type) !== normalizeText(sku.size)) return false;
    return Number(material.pack_count) === Number(sku.piece_count);
  }) ?? materials.find((material) => normalizeText(material.tenant_sku_name) === normalizedSkuName);
  return matched?.tenant_sku_code ?? "";
}

function formatSelectedSkuLabel(sku: SkuMaster | null | undefined) {
  if (!sku) return "";
  return [sku.material_sku_code, sku.makuku_sku_name].filter(Boolean).join(" · ");
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

function getCopy(locale: string) {
  const isZh = locale === "zh";
  return {
    competitorSku: isZh ? "竞品 SKU" : "Competitor SKU",
    spec: isZh ? "规格摘要" : "Spec",
    packageType: isZh ? "包装类型" : "Package Type",
    mapProductMaster: isZh ? "对标 Makuku SKU" : "Mapped Makuku SKU",
    mappingStatus: isZh ? "关联状态" : "Mapping Status",
    mappingMethod: isZh ? "关联方式" : "Mapping Method",
    benchmark: isZh ? "标杆" : "Benchmark",
    saveMapping: isZh ? "保存关联" : "Save",
    clearMapping: isZh ? "清空" : "Clear",
    mapped: isZh ? "已关联" : "Mapped",
    unmapped: isZh ? "未关联" : "Unmapped",
    setBenchmark: isZh ? "设为市场标杆" : "Set benchmark",
    missingProductMaster: isZh ? "未关联 Makuku SKU" : "Missing Makuku SKU",
  };
}
