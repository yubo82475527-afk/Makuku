"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, SelectInput, TextInput } from "@/components/ui";
import type { Dictionary } from "@/lib/i18n/get-dictionary";
import type { CompetitorProduct } from "@/lib/types";

type CompetitorStatus = "active" | "disabled";

type CompetitorProductsTableProps = {
  products: CompetitorProduct[];
  locale: string;
  dict: Dictionary;
};

export function CompetitorProductsTable({ products, locale, dict }: CompetitorProductsTableProps) {
  const router = useRouter();
  const copy = getCopy(locale);
  const [drafts, setDrafts] = useState<Record<string, ProductDraft>>(() => Object.fromEntries(products.map((product) => [product.id, draftFromProduct(product)])));
  const [savingIds, setSavingIds] = useState<string[]>([]);

  function productDraft(product: CompetitorProduct) {
    return drafts[product.id] ?? draftFromProduct(product);
  }

  function setDraftField<K extends keyof ProductDraft>(product: CompetitorProduct, field: K, value: ProductDraft[K]) {
    setDrafts((current) => ({
      ...current,
      [product.id]: {
        ...(current[product.id] ?? emptyDraft()),
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

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-[1120px] w-full table-fixed text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="w-44 px-3 py-2 whitespace-nowrap">{dict.common.brand}</th>
              <th className="w-72 px-3 py-2 whitespace-nowrap">{dict.common.product}</th>
              <th className="w-32 px-3 py-2 whitespace-nowrap">{copy.packageType}</th>
              <th className="w-24 px-3 py-2 whitespace-nowrap">{dict.common.size}</th>
              <th className="w-24 px-3 py-2 whitespace-nowrap">{dict.common.pcs}</th>
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
  package_type: string;
  size: string;
  piece_count: string;
  status: CompetitorStatus;
};

function emptyDraft(): ProductDraft {
  return {
    package_type: "unknown",
    size: "",
    piece_count: "",
    status: "active",
  };
}

function draftFromProduct(product: CompetitorProduct): ProductDraft {
  return {
    package_type: product.package_type ?? "unknown",
    size: product.size ?? "",
    piece_count: product.piece_count ? String(product.piece_count) : "",
    status: product.status === "disabled" ? "disabled" : "active",
  };
}

function missingMasterFields(product: CompetitorProduct) {
  const fields: string[] = [];
  if (!product.package_type || product.package_type === "unknown") fields.push("Package Type");
  if (!product.size) fields.push("Size");
  if (!product.piece_count) fields.push("Pcs");
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
    packageType: isZh ? "包装类型" : "Package Type",
    mappingStatus: isZh ? "映射状态" : "Mapping Status",
    createdAt: isZh ? "创建时间" : "Created At",
    mapped: isZh ? "已映射" : "Mapped",
    unmapped: isZh ? "未映射" : "Unmapped",
    active: isZh ? "启用" : "Active",
    disabled: isZh ? "禁用" : "Disabled",
    saveFailed: isZh ? "保存竞品主数据失败" : "Failed to save competitor product master",
    missingFields: (fields: string[]) => isZh ? `待补：${fields.join("、")}` : `Missing: ${fields.join(", ")}`,
  };
}
