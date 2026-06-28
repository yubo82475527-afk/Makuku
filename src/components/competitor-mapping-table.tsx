"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ProductMasterSearchSelect } from "@/components/product-master-search-select";
import { Badge, Button, SelectInput, TextInput } from "@/components/ui";
import type { Dictionary } from "@/lib/i18n/get-dictionary";
import { productGradeOptions } from "@/lib/segments";
import type { CompetitorProduct, MaterialMaster, PackType, Segment, SkuMaster } from "@/lib/types";

type MappingStatus = "pending" | "mapped" | "all";
type CompetitorStatus = "active" | "disabled";

type CompetitorMappingTableProps = {
  products: CompetitorProduct[];
  materials: MaterialMaster[];
  locale: string;
  dict: Dictionary;
  mappingStatus: MappingStatus;
};

export function CompetitorMappingTable({ products, materials, locale, dict, mappingStatus }: CompetitorMappingTableProps) {
  const router = useRouter();
  const copy = getCopy(locale);
  const showMappingSummaryColumns = mappingStatus !== "pending";
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ProductDraft>>(() => Object.fromEntries(products.map((product) => [product.id, draftFromProduct(product)])));
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const [bulkGrade, setBulkGrade] = useState<Segment>("unknown");

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = products.length > 0 && products.every((product) => selectedSet.has(product.id));
  const selectedCount = selectedIds.length;

  function toggleProduct(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function togglePage() {
    setSelectedIds(allSelected ? [] : products.map((product) => product.id));
  }

  function productDraft(product: CompetitorProduct) {
    return drafts[product.id] ?? draftFromProduct(product);
  }

  function setDraftField<K extends keyof ProductDraft>(productId: string, field: K, value: ProductDraft[K]) {
    setDrafts((current) => ({
      ...current,
      [productId]: {
        ...(current[productId] ?? draftFromProduct(products.find((product) => product.id === productId)!)),
        [field]: value,
      },
    }));
  }

  async function saveProductFields(product: CompetitorProduct, fields: Partial<ProductDraft>, confirmMessage: string) {
    const current = draftFromProduct(product);
    const changed = Object.entries(fields).some(([key, value]) => String(value ?? "") !== String(current[key as keyof ProductDraft] ?? ""));
    if (!changed) return;
    if (!window.confirm(confirmMessage)) {
      setDrafts((draft) => ({ ...draft, [product.id]: current }));
      return;
    }

    setSavingIds([product.id]);
    try {
      const response = await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "update_fields", id: product.id, ...fields }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? copy.saveFailed);
      setDrafts((draft) => ({ ...draft, [product.id]: { ...productDraft(product), ...fields } }));
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : copy.saveFailed);
      setDrafts((draft) => ({ ...draft, [product.id]: current }));
    } finally {
      setSavingIds([]);
    }
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
      setDrafts((current) => {
        const next = { ...current };
        for (const id of ids) next[id] = { ...(next[id] ?? draftFromProduct(products.find((product) => product.id === id)!)), segment };
        return next;
      });
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : copy.saveFailed);
    } finally {
      setSavingIds([]);
    }
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
        <table className={`${showMappingSummaryColumns ? "min-w-[1640px]" : "min-w-[1320px]"} w-full table-fixed text-left text-sm`}>
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="w-12 px-3 py-2">
                <input type="checkbox" checked={allSelected} onChange={togglePage} aria-label={copy.selectCurrentPage} />
              </th>
              <th className="w-44 px-3 py-2 whitespace-nowrap">{dict.common.brand}</th>
              <th className="w-72 px-3 py-2 whitespace-nowrap">{dict.common.product}</th>
              <th className="w-28 px-3 py-2 whitespace-nowrap">{copy.productType}</th>
              <th className="w-32 px-3 py-2 whitespace-nowrap">{copy.packageType}</th>
              <th className="w-24 px-3 py-2 whitespace-nowrap">{dict.common.size}</th>
              <th className="w-24 px-3 py-2 whitespace-nowrap">{dict.common.pcs}</th>
              <th className="w-40 px-3 py-2 whitespace-nowrap">{copy.competitorGrade}</th>
              <th className="w-28 px-3 py-2 whitespace-nowrap">{dict.common.status}</th>
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
                ? `/${locale}/competitor-mappings?competitorProductId=${encodeURIComponent(product.id)}`
                : null;
              const draft = productDraft(product);
              const isSaving = savingIds.includes(product.id);
              const missingFields = missingMasterFields(product);
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
                  <td className="overflow-hidden px-3 py-3 font-medium">
                    <div className="truncate" title={product.brands?.name ?? ""}>{product.brands?.name}</div>
                    {mappingStatus === "pending" && missingFields.length > 0 ? (
                      <div className="mt-1 text-xs text-amber-700">{copy.missingFields(missingFields)}</div>
                    ) : null}
                  </td>
                  <td className="overflow-hidden px-3 py-3">
                    <div className="truncate" title={product.normalized_name}>{product.normalized_name}</div>
                  </td>
                  <td className="px-3 py-3">
                    <SelectInput
                      value={draft.pack_type}
                      onChange={(event) => setDraftField(product.id, "pack_type", event.target.value as PackType)}
                      onBlur={() => saveProductFields(product, { pack_type: draft.pack_type }, copy.confirmSaveProduct)}
                      disabled={isSaving}
                      className="h-9"
                    >
                      <option value="pants">Pants</option>
                      <option value="tape">Tape</option>
                      <option value="unknown">unknown</option>
                    </SelectInput>
                  </td>
                  <td className="px-3 py-3">
                    <TextInput
                      value={draft.package_type}
                      onChange={(event) => setDraftField(product.id, "package_type", event.target.value)}
                      onBlur={() => saveProductFields(product, { package_type: draft.package_type }, copy.confirmSaveProduct)}
                      disabled={isSaving}
                      aria-label={`${copy.packageType} ${product.brands?.name ?? ""} ${product.normalized_name}`}
                      className="w-28"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <TextInput
                      value={draft.size}
                      onChange={(event) => setDraftField(product.id, "size", event.target.value.toUpperCase())}
                      onBlur={() => saveProductFields(product, { size: draft.size }, copy.confirmSaveProduct)}
                      disabled={isSaving}
                      aria-label={`${dict.common.size} ${product.brands?.name ?? ""} ${product.normalized_name}`}
                      className="w-20"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <TextInput
                      value={draft.piece_count}
                      inputMode="numeric"
                      onChange={(event) => setDraftField(product.id, "piece_count", event.target.value.replace(/[^\d]/g, ""))}
                      onBlur={() => saveProductFields(product, { piece_count: draft.piece_count }, copy.confirmSaveProduct)}
                      disabled={isSaving}
                      aria-label={`${dict.common.pcs} ${product.brands?.name ?? ""} ${product.normalized_name}`}
                      className="w-20"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <SelectInput
                      value={draft.segment}
                      onChange={(event) => setDraftField(product.id, "segment", event.target.value as Segment)}
                      onBlur={() => saveProductFields(product, { segment: draft.segment }, copy.confirmSaveGrade)}
                      disabled={isSaving}
                      aria-label={`${copy.competitorGrade} ${product.brands?.name ?? ""} ${product.normalized_name}`}
                      className="h-9 w-36"
                    >
                      {productGradeOptions().map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </SelectInput>
                  </td>
                  <td className="px-3 py-3">
                    <SelectInput
                      value={draft.status}
                      onChange={(event) => setDraftField(product.id, "status", event.target.value as CompetitorStatus)}
                      onBlur={() => saveProductFields(product, { status: draft.status }, copy.confirmSaveProduct)}
                      disabled={isSaving}
                      className="h-9"
                    >
                      <option value="active">{copy.active}</option>
                      <option value="disabled">{copy.disabled}</option>
                    </SelectInput>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <form action="/api/sku-matches" method="post" className="flex min-w-0 flex-1 items-center gap-2">
                        <input type="hidden" name="return_to" value={`/${locale}/competitors`} />
                        <input type="hidden" name="competitor_product_id" value={product.id} />
                        <ProductMasterSearchSelect materials={materials} selectedCode={selectedMaterialCode} locale={locale} />
                        <Button type="submit" className="h-9 whitespace-nowrap">{copy.saveMapping}</Button>
                      </form>
                      {match ? (
                        <form action="/api/sku-matches" method="post">
                          <input type="hidden" name="return_to" value={`/${locale}/competitors`} />
                          <input type="hidden" name="competitor_product_id" value={product.id} />
                          <button type="submit" className="h-9 whitespace-nowrap rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                            {copy.clearMapping}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                  {showMappingSummaryColumns ? (
                    <td className="px-3 py-3 whitespace-nowrap">
                      <Badge tone={match ? "low" : "neutral"}>{match ? copy.mapped : copy.unmapped}</Badge>
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
    </div>
  );
}

type ProductDraft = {
  pack_type: PackType;
  package_type: string;
  size: string;
  piece_count: string;
  segment: Segment;
  status: CompetitorStatus;
};

function draftFromProduct(product: CompetitorProduct): ProductDraft {
  return {
    pack_type: product.pack_type ?? "unknown",
    package_type: product.package_type ?? "unknown",
    size: product.size ?? "",
    piece_count: product.piece_count ? String(product.piece_count) : "",
    segment: product.segment ?? "unknown",
    status: product.status === "disabled" ? "disabled" : "active",
  };
}

function missingMasterFields(product: CompetitorProduct) {
  const fields: string[] = [];
  if (!product.sku_matches?.[0]) fields.push("Makuku SKU");
  if (!product.package_type || product.package_type === "unknown") fields.push("包装类型");
  if (!product.size) fields.push("尺码");
  if (!product.piece_count) fields.push("片数");
  if (!product.segment || product.segment === "unknown") fields.push("商品等级");
  return fields;
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
    confirmSaveProduct: isZh ? "是否保存本次竞品商品主数据修改？" : "Save this competitor product master change?",
    competitorGrade: isZh ? "竞品商品等级" : "Competitor Grade",
    productType: isZh ? "产品类型" : "Product Type",
    packageType: isZh ? "包装类型" : "Package Type",
    mapProductMaster: isZh ? "对标 Makuku SKU" : "Mapped Makuku SKU",
    mappingStatus: isZh ? "关联状态" : "Mapping status",
    mappingMethod: isZh ? "关联方式" : "Mapping method",
    benchmark: isZh ? "标杆" : "Benchmark",
    saveMapping: isZh ? "保存关联" : "Save",
    clearMapping: isZh ? "清空" : "Clear",
    mapped: isZh ? "已关联" : "Mapped",
    unmapped: isZh ? "未关联" : "Unmapped",
    active: isZh ? "启用" : "Active",
    disabled: isZh ? "禁用" : "Disabled",
    setBenchmark: isZh ? "设为市场标杆" : "Set benchmark",
    missingProductMaster: isZh ? "未关联产品主数据" : "Missing product master",
    selectCurrentPage: isZh ? "选择当前页竞品商品" : "Select current page competitor products",
    selectProduct: isZh ? "选择竞品商品" : "Select competitor product",
    selected: (count: number) => isZh ? `已选 ${count} 条` : `${count} selected`,
    applyToSelected: isZh ? "应用到选中" : "Apply to selected",
    confirmSaveGrade: isZh ? "是否保存本次商品等级修改？" : "Save this product grade change?",
    confirmBulkGrade: (count: number) => isZh ? `确认把 ${count} 条竞品商品设置为该商品等级？` : `Apply this grade to ${count} selected products?`,
    saveFailed: isZh ? "保存竞品商品主数据失败" : "Failed to save competitor product master",
    missingFields: (fields: string[]) => isZh ? `待补：${fields.join("、")}` : `Missing: ${fields.join(", ")}`,
  };
}
