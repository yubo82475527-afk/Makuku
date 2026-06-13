"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Button, SelectInput, TextInput } from "@/components/ui";
import type { Dictionary } from "@/lib/i18n/get-dictionary";
import { productGradeOptions } from "@/lib/segments";
import type { CompetitorProduct, PackType, Segment } from "@/lib/types";

type CompetitorStatus = "active" | "disabled";

type CompetitorProductsTableProps = {
  products: CompetitorProduct[];
  locale: string;
  dict: Dictionary;
};

export function CompetitorProductsTable({ products, locale, dict }: CompetitorProductsTableProps) {
  const router = useRouter();
  const copy = getCopy(locale);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ProductDraft>>(() => Object.fromEntries(products.map((product) => [product.id, draftFromProduct(product)])));
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const [bulkGrade, setBulkGrade] = useState<Segment>("unknown");

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = products.length > 0 && products.every((product) => selectedSet.has(product.id));

  function toggleProduct(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function togglePage() {
    setSelectedIds(allSelected ? [] : products.map((product) => product.id));
  }

  function productDraft(product: CompetitorProduct) {
    return drafts[product.id] ?? draftFromProduct(product);
  }

  function setDraftField<K extends keyof ProductDraft>(product: CompetitorProduct, field: K, value: ProductDraft[K]) {
    setDrafts((current) => ({
      ...current,
      [product.id]: {
        ...(current[product.id] ?? draftFromProduct(product)),
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

  async function applyBulkGrade() {
    if (selectedIds.length === 0) return;
    if (!window.confirm(copy.confirmBulkGrade(selectedIds.length))) return;
    setSavingIds(selectedIds);
    try {
      const response = await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "update_segment", ids: selectedIds, segment: bulkGrade }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? copy.saveFailed);
      setDrafts((current) => {
        const next = { ...current };
        for (const id of selectedIds) next[id] = { ...(next[id] ?? emptyDraft()), segment: bulkGrade };
        return next;
      });
      setSelectedIds([]);
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : copy.saveFailed);
    } finally {
      setSavingIds([]);
    }
  }

  return (
    <div className="space-y-3">
      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-950">
          <span className="font-medium">{copy.selected(selectedIds.length)}</span>
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
        <table className="min-w-[1500px] w-full table-fixed text-left text-sm">
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
              <th className="w-28 px-3 py-2 whitespace-nowrap">{copy.mappingStatus}</th>
              <th className="w-40 px-3 py-2 whitespace-nowrap">{copy.createdAt}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {products.map((product) => {
              const draft = productDraft(product);
              const isSaving = savingIds.includes(product.id);
              const isMapped = Boolean(product.sku_matches?.[0]);
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
                  </td>
                  <td className="overflow-hidden px-3 py-3">
                    <div className="truncate" title={product.normalized_name}>{product.normalized_name}</div>
                    {missingMasterFields(product).length > 0 ? (
                      <div className="mt-1 text-xs text-amber-700">{copy.missingFields(missingMasterFields(product))}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <SelectInput
                      value={draft.pack_type}
                      onChange={(event) => setDraftField(product, "pack_type", event.target.value as PackType)}
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
                      onChange={(event) => setDraftField(product, "package_type", event.target.value)}
                      onBlur={() => saveProductFields(product, { package_type: draft.package_type }, copy.confirmSaveProduct)}
                      disabled={isSaving}
                      className="w-28"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <TextInput
                      value={draft.size}
                      onChange={(event) => setDraftField(product, "size", event.target.value.toUpperCase())}
                      onBlur={() => saveProductFields(product, { size: draft.size }, copy.confirmSaveProduct)}
                      disabled={isSaving}
                      className="w-20"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <TextInput
                      value={draft.piece_count}
                      inputMode="numeric"
                      onChange={(event) => setDraftField(product, "piece_count", event.target.value.replace(/[^\d]/g, ""))}
                      onBlur={() => saveProductFields(product, { piece_count: draft.piece_count }, copy.confirmSaveProduct)}
                      disabled={isSaving}
                      className="w-20"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <SelectInput
                      value={draft.segment}
                      onChange={(event) => setDraftField(product, "segment", event.target.value as Segment)}
                      onBlur={() => saveProductFields(product, { segment: draft.segment }, copy.confirmSaveGrade)}
                      disabled={isSaving}
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
                      onChange={(event) => setDraftField(product, "status", event.target.value as CompetitorStatus)}
                      onBlur={() => saveProductFields(product, { status: draft.status }, copy.confirmSaveProduct)}
                      disabled={isSaving}
                      className="h-9"
                    >
                      <option value="active">{copy.active}</option>
                      <option value="disabled">{copy.disabled}</option>
                    </SelectInput>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <Link href={`/${locale}/competitor-mappings?mapping=${isMapped ? "mapped" : "pending"}&product=${encodeURIComponent(product.normalized_name)}`} className="inline-flex items-center gap-2 text-blue-700 hover:underline">
                      <Badge tone={isMapped ? "low" : "neutral"}>{isMapped ? copy.mapped : copy.unmapped}</Badge>
                    </Link>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-600">{formatDateTime(product.created_at, locale)}</td>
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

function emptyDraft(): ProductDraft {
  return {
    pack_type: "unknown",
    package_type: "unknown",
    size: "",
    piece_count: "",
    segment: "unknown",
    status: "active",
  };
}

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
  if (!product.package_type || product.package_type === "unknown") fields.push("Package Type");
  if (!product.size) fields.push("Size");
  if (!product.piece_count) fields.push("Pcs");
  if (!product.segment || product.segment === "unknown") fields.push("Grade");
  return fields;
}

function formatDateTime(value: string | null | undefined, locale: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function getCopy(locale: string) {
  const isZh = locale === "zh";
  return {
    confirmSaveProduct: isZh ? "是否保存本次竞品主数据修改？" : "Save this competitor product master change?",
    competitorGrade: isZh ? "商品等级" : "Product Grade",
    productType: isZh ? "产品类型" : "Product Type",
    packageType: isZh ? "包装类型" : "Package Type",
    mappingStatus: isZh ? "映射状态" : "Mapping Status",
    createdAt: isZh ? "创建时间" : "Created At",
    mapped: isZh ? "已映射" : "Mapped",
    unmapped: isZh ? "未映射" : "Unmapped",
    active: isZh ? "启用" : "Active",
    disabled: isZh ? "禁用" : "Disabled",
    selectCurrentPage: isZh ? "选择当前页竞品商品" : "Select current page competitor products",
    selectProduct: isZh ? "选择竞品商品" : "Select competitor product",
    selected: (count: number) => isZh ? `已选 ${count} 条` : `${count} selected`,
    applyToSelected: isZh ? "应用到选中" : "Apply to selected",
    confirmSaveGrade: isZh ? "是否保存本次商品等级修改？" : "Save this product grade change?",
    confirmBulkGrade: (count: number) => isZh ? `确认把 ${count} 条竞品商品设置为该商品等级？` : `Apply this grade to ${count} selected products?`,
    saveFailed: isZh ? "保存竞品主数据失败" : "Failed to save competitor product master",
    missingFields: (fields: string[]) => isZh ? `待补：${fields.join("、")}` : `Missing: ${fields.join(", ")}`,
  };
}
