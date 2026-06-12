"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ProductMasterSearchSelect } from "@/components/product-master-search-select";
import { Badge, Button, SelectInput } from "@/components/ui";
import { translateEnum } from "@/lib/i18n/get-dictionary";
import type { Dictionary } from "@/lib/i18n/get-dictionary";
import { productGradeLabel, productGradeOptions } from "@/lib/segments";
import type { CompetitorProduct, MaterialMaster, Segment, SkuMaster } from "@/lib/types";

type CompetitorMappingTableProps = {
  products: CompetitorProduct[];
  materials: MaterialMaster[];
  locale: string;
  dict: Dictionary;
};

export function CompetitorMappingTable({ products, materials, locale, dict }: CompetitorMappingTableProps) {
  const router = useRouter();
  const copy = getCopy(locale);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, Segment>>({});
  const [savedGrades, setSavedGrades] = useState<Record<string, Segment>>(() => Object.fromEntries(products.map((product) => [product.id, product.segment])));
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const [bulkGrade, setBulkGrade] = useState<Segment>("unknown");

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = products.length > 0 && products.every((product) => selectedSet.has(product.id));
  const selectedCount = selectedIds.length;

  function toggleProduct(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function togglePage() {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(products.map((product) => product.id));
  }

  function gradeForProduct(product: CompetitorProduct) {
    return gradeDrafts[product.id] ?? savedGrades[product.id] ?? product.segment;
  }

  async function saveGrades(ids: string[], segment: Segment) {
    setSavingIds(ids);
    try {
      const response = await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "update_segment", ids, segment }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? copy.saveFailed);
      setSavedGrades((current) => ({ ...current, ...Object.fromEntries(ids.map((id) => [id, segment])) }));
      setGradeDrafts((current) => ({ ...current, ...Object.fromEntries(ids.map((id) => [id, segment])) }));
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : copy.saveFailed);
      setGradeDrafts((current) => {
        const next = { ...current };
        for (const id of ids) next[id] = savedGrades[id] ?? "unknown";
        return next;
      });
    } finally {
      setSavingIds([]);
    }
  }

  async function maybeSaveGrade(product: CompetitorProduct) {
    const nextGrade = gradeForProduct(product);
    const savedGrade = savedGrades[product.id] ?? product.segment;
    if (nextGrade === savedGrade) return;
    if (!window.confirm(copy.confirmSaveGrade)) {
      setGradeDrafts((current) => ({ ...current, [product.id]: savedGrade }));
      return;
    }
    await saveGrades([product.id], nextGrade);
  }

  async function applyBulkGrade() {
    if (selectedIds.length === 0) return;
    if (!window.confirm(copy.confirmBulkGrade(selectedIds.length))) return;
    await saveGrades(selectedIds, bulkGrade);
    setSelectedIds([]);
  }

  return (
    <div className="space-y-3">
      {selectedCount > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-950">
          <span className="font-medium">{copy.selected(selectedCount)}</span>
          <SelectInput value={bulkGrade} onChange={(event) => setBulkGrade(event.target.value as Segment)} className="h-9 w-40 bg-white">
            {productGradeOptions().map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </SelectInput>
          <Button type="button" onClick={applyBulkGrade} disabled={savingIds.length > 0} className="h-9 whitespace-nowrap">
            {copy.applyToSelected}
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[1500px] table-fixed text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="w-12 px-3 py-2">
                <input type="checkbox" checked={allSelected} onChange={togglePage} aria-label={copy.selectCurrentPage} />
              </th>
              <th className="w-36 px-3 py-2 whitespace-nowrap">{dict.common.brand}</th>
              <th className="w-72 px-3 py-2 whitespace-nowrap">{dict.common.product}</th>
              <th className="w-28 px-3 py-2 whitespace-nowrap">{dict.common.channel}</th>
              <th className="w-24 px-3 py-2 whitespace-nowrap">{dict.common.size}</th>
              <th className="w-20 px-3 py-2 whitespace-nowrap">{dict.common.pcs}</th>
              <th className="w-56 px-3 py-2 whitespace-nowrap">{copy.competitorGrade}</th>
              <th className="w-36 px-3 py-2 whitespace-nowrap">{copy.makukuGrade}</th>
              <th className="w-96 px-3 py-2 whitespace-nowrap">{copy.mapProductMaster}</th>
              <th className="w-28 px-3 py-2 whitespace-nowrap">{copy.mappingStatus}</th>
              <th className="w-32 px-3 py-2 whitespace-nowrap">{copy.mappingMethod}</th>
              <th className="w-36 px-3 py-2 whitespace-nowrap">{copy.benchmark}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {products.map((product) => {
              const match = product.sku_matches?.[0];
              const selectedMaterialCode = findMaterialCodeForSku(match?.sku_master, materials);
              const setBenchmarkHref = match?.sku_master
                ? `/${locale}/market-benchmarks?competitorProductId=${encodeURIComponent(product.id)}`
                : null;
              const currentGrade = gradeForProduct(product);
              const isSaving = savingIds.includes(product.id);
              return (
                <tr key={product.id} className="hover:bg-slate-50">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(product.id)}
                      onChange={() => toggleProduct(product.id)}
                      aria-label={`${copy.selectProduct} ${product.brands?.name ?? ""} ${product.normalized_name}`}
                    />
                  </td>
                  <td className="px-3 py-3 font-medium whitespace-nowrap">{product.brands?.name}</td>
                  <td className="px-3 py-3">
                    <div className="truncate" title={product.normalized_name}>{product.normalized_name}</div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap"><Badge>{translateEnum(dict, "channel", product.channel)}</Badge></td>
                  <td className="px-3 py-3 whitespace-nowrap">{product.size}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{product.piece_count}</td>
                  <td className="px-3 py-3">
                    <SelectInput
                      value={currentGrade}
                      onChange={(event) => setGradeDrafts((current) => ({ ...current, [product.id]: event.target.value as Segment }))}
                      onBlur={() => maybeSaveGrade(product)}
                      disabled={isSaving}
                      aria-label={`${copy.competitorGrade} ${product.brands?.name ?? ""} ${product.normalized_name}`}
                      className="h-9 w-40"
                    >
                      {productGradeOptions().map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </SelectInput>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{match?.sku_master ? productGradeLabel(match.sku_master.segment) : "-"}</td>
                  <td className="px-3 py-3">
                    <form action="/api/sku-matches" method="post" className="flex min-w-0 items-center gap-2">
                      <input type="hidden" name="return_to" value={`/${locale}/competitors`} />
                      <input type="hidden" name="competitor_product_id" value={product.id} />
                      {match?.id ? <input type="hidden" name="match_id" value={match.id} /> : null}
                      <ProductMasterSearchSelect materials={materials} selectedCode={selectedMaterialCode} locale={locale} />
                      <Button type="submit" className="h-9 whitespace-nowrap">{copy.saveMapping}</Button>
                    </form>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <Badge tone={match ? "low" : "neutral"}>{match ? copy.mapped : copy.unmapped}</Badge>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{match ? formatMatchMethod(match.match_method, locale) : "-"}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {setBenchmarkHref ? (
                      <Link href={setBenchmarkHref} className="font-medium text-blue-700 hover:underline">
                        {copy.setBenchmark}
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-400">{copy.missingProductMaster}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
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

function getCopy(locale: string) {
  const isZh = locale === "zh";
  return {
    competitorGrade: isZh ? "竞品商品等级" : "Competitor Grade",
    makukuGrade: isZh ? "Makuku商品等级" : "Makuku Grade",
    mapProductMaster: isZh ? "关联产品主数据" : "Map product master",
    mappingStatus: isZh ? "关联状态" : "Mapping status",
    mappingMethod: isZh ? "关联方式" : "Mapping method",
    benchmark: isZh ? "标杆" : "Benchmark",
    saveMapping: isZh ? "保存关联" : "Save",
    mapped: isZh ? "已关联" : "Mapped",
    unmapped: isZh ? "未关联" : "Unmapped",
    setBenchmark: isZh ? "设为市场标杆" : "Set benchmark",
    missingProductMaster: isZh ? "未关联产品主数据" : "Missing product master",
    selectCurrentPage: isZh ? "选择当前页竞品商品" : "Select current page competitor products",
    selectProduct: isZh ? "选择竞品商品" : "Select competitor product",
    selected: (count: number) => isZh ? `已选 ${count} 条` : `${count} selected`,
    applyToSelected: isZh ? "应用到选中" : "Apply to selected",
    confirmSaveGrade: isZh ? "是否保存本次商品等级修改？" : "Save this product grade change?",
    confirmBulkGrade: (count: number) => isZh ? `确认把 ${count} 条竞品商品设置为该商品等级？` : `Apply this grade to ${count} selected products?`,
    saveFailed: isZh ? "保存商品等级失败" : "Failed to save product grade",
  };
}
