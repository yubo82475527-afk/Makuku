"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Button, SelectInput, TextInput } from "@/components/ui";
import type { Dictionary } from "@/lib/i18n/get-dictionary";
import type { Brand, CompetitorProduct, PackType, Segment } from "@/lib/types";

type CompetitorStatus = "active" | "disabled";

type CompetitorProductsTableProps = {
  products: CompetitorProduct[];
  brands: Brand[];
  locale: string;
  dict: Dictionary;
};

export function CompetitorProductsTable({ products, brands, locale, dict }: CompetitorProductsTableProps) {
  const router = useRouter();
  const copy = getCopy(locale);
  const [selectedProduct, setSelectedProduct] = useState<CompetitorProduct | null>(null);
  const [draft, setDraft] = useState<ProductDraft>(() => emptyDraft());
  const [saving, setSaving] = useState(false);
  const brandOptions = useMemo(() => brands.filter((brand) => !brand.is_own_brand && brand.name.trim().toLowerCase() !== "makuku"), [brands]);

  function openProduct(product: CompetitorProduct) {
    setSelectedProduct(product);
    setDraft(draftFromProduct(product));
  }

  function closeDrawer() {
    if (saving) return;
    setSelectedProduct(null);
  }

  async function saveProduct() {
    if (!selectedProduct) return;
    setSaving(true);
    try {
      const response = await fetch("/api/competitors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedProduct.id,
          brand_id: draft.brand_id,
          raw_title: draft.raw_title,
          normalized_name: draft.normalized_name,
          product_series: draft.product_series,
          package_type: draft.package_type,
          pack_type: draft.pack_type,
          size: draft.size,
          piece_count: draft.piece_count,
          segment: draft.segment,
          status: draft.status,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? copy.saveFailed);
      setSelectedProduct(null);
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : copy.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-[1240px] w-full table-fixed text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="w-36 px-3 py-2 whitespace-nowrap">{copy.competitorCode}</th>
              <th className="w-44 px-3 py-2 whitespace-nowrap">{dict.common.brand}</th>
              <th className="w-36 px-3 py-2 whitespace-nowrap">{copy.series}</th>
              <th className="w-72 px-3 py-2 whitespace-nowrap">{dict.common.product}</th>
              <th className="w-32 px-3 py-2 whitespace-nowrap">{copy.packageType}</th>
              <th className="w-24 px-3 py-2 whitespace-nowrap">{dict.common.size}</th>
              <th className="w-24 px-3 py-2 whitespace-nowrap">{dict.common.pcs}</th>
              <th className="w-28 px-3 py-2 whitespace-nowrap">{dict.common.status}</th>
              <th className="w-40 px-3 py-2 whitespace-nowrap">{copy.createdAt}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {products.map((product) => (
                <tr
                  key={product.id}
                  onClick={() => openProduct(product)}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="overflow-hidden px-3 py-3 font-medium text-slate-700">
                    <div className="truncate" title={product.competitor_sku_code ?? ""}>{product.competitor_sku_code ?? "-"}</div>
                  </td>
                  <td className="overflow-hidden px-3 py-3 font-medium">
                    <div className="truncate" title={product.brands?.name ?? ""}>{product.brands?.name}</div>
                  </td>
                  <td className="overflow-hidden px-3 py-3">
                    <div className="truncate" title={product.product_series ?? ""}>{product.product_series ?? "-"}</div>
                  </td>
                  <td className="overflow-hidden px-3 py-3">
                    <div className="truncate" title={product.normalized_name}>{product.normalized_name}</div>
                    {missingMasterFields(product).length > 0 ? (
                      <div className="mt-1 text-xs text-amber-700">{copy.missingFields(missingMasterFields(product))}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">{product.package_type || "-"}</td>
                  <td className="px-3 py-3">{product.size || "-"}</td>
                  <td className="px-3 py-3">{product.piece_count ?? "-"}</td>
                  <td className="px-3 py-3">
                    <Badge tone={product.status === "disabled" ? "medium" : "low"}>{product.status === "disabled" ? copy.disabled : copy.active}</Badge>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-600">{formatDateTime(product.created_at, locale)}</td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedProduct ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" onClick={closeDrawer}>
          <aside className="h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <div className="text-base font-semibold text-slate-950">{copy.drawerTitle}</div>
                <div className="mt-1 text-xs text-slate-500">{copy.drawerHint}</div>
              </div>
              <button type="button" onClick={closeDrawer} className="rounded-md border border-slate-300 p-2 text-slate-600 hover:bg-slate-50" aria-label={copy.close}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <Field label={copy.competitorCode}>
                <TextInput value={selectedProduct.competitor_sku_code ?? selectedProduct.id} disabled />
              </Field>
              <Field label={dict.common.brand}>
                <SelectInput value={draft.brand_id} onChange={(event) => setDraft((current) => ({ ...current, brand_id: event.target.value }))}>
                  {brandOptions.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                </SelectInput>
              </Field>
              <Field label={copy.series}>
                <TextInput value={draft.product_series} onChange={(event) => setDraft((current) => ({ ...current, product_series: event.target.value }))} />
              </Field>
              <Field label={dict.common.product}>
                <TextInput value={draft.normalized_name} onChange={(event) => setDraft((current) => ({ ...current, normalized_name: event.target.value }))} />
              </Field>
              <Field label={copy.rawTitle}>
                <TextInput value={draft.raw_title} onChange={(event) => setDraft((current) => ({ ...current, raw_title: event.target.value }))} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={copy.packageType}>
                  <TextInput value={draft.package_type} onChange={(event) => setDraft((current) => ({ ...current, package_type: event.target.value }))} />
                </Field>
                <Field label={copy.packType}>
                  <SelectInput value={draft.pack_type} onChange={(event) => setDraft((current) => ({ ...current, pack_type: event.target.value as PackType }))}>
                    <option value="unknown">{copy.unknown}</option>
                    <option value="pants">Pants</option>
                    <option value="tape">Tape</option>
                  </SelectInput>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={dict.common.size}>
                  <TextInput value={draft.size} onChange={(event) => setDraft((current) => ({ ...current, size: event.target.value.toUpperCase() }))} />
                </Field>
                <Field label={dict.common.pcs}>
                  <TextInput value={draft.piece_count} inputMode="numeric" onChange={(event) => setDraft((current) => ({ ...current, piece_count: event.target.value.replace(/[^\d]/g, "") }))} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={copy.segment}>
                  <SelectInput value={draft.segment} onChange={(event) => setDraft((current) => ({ ...current, segment: event.target.value as Segment }))}>
                    <option value="AD">AD</option>
                    <option value="BD Eco">BD Eco</option>
                    <option value="BD MID">BD MID</option>
                    <option value="unknown">{copy.unknown}</option>
                  </SelectInput>
                </Field>
                <Field label={dict.common.status}>
                  <SelectInput value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as CompetitorStatus }))}>
                    <option value="active">{copy.active}</option>
                    <option value="disabled">{copy.disabled}</option>
                  </SelectInput>
                </Field>
              </div>
            </div>
            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
              <button type="button" onClick={closeDrawer} disabled={saving} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {copy.cancel}
              </button>
              <Button type="button" onClick={saveProduct} disabled={saving || !draft.brand_id || !draft.normalized_name.trim() || !draft.raw_title.trim() || !draft.piece_count.trim()}>
                {saving ? copy.saving : copy.save}
              </Button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

type ProductDraft = {
  brand_id: string;
  raw_title: string;
  normalized_name: string;
  product_series: string;
  package_type: string;
  pack_type: PackType;
  size: string;
  piece_count: string;
  segment: Segment;
  status: CompetitorStatus;
};

function emptyDraft(): ProductDraft {
  return {
    brand_id: "",
    raw_title: "",
    normalized_name: "",
    product_series: "",
    package_type: "unknown",
    pack_type: "unknown",
    size: "",
    piece_count: "",
    segment: "unknown",
    status: "active",
  };
}

function draftFromProduct(product: CompetitorProduct): ProductDraft {
  return {
    brand_id: product.brand_id,
    raw_title: product.raw_title,
    normalized_name: product.normalized_name,
    product_series: product.product_series ?? "",
    package_type: product.package_type ?? "unknown",
    pack_type: product.pack_type ?? "unknown",
    size: product.size ?? "",
    piece_count: product.piece_count ? String(product.piece_count) : "",
    segment: product.segment ?? "unknown",
    status: product.status === "disabled" ? "disabled" : "active",
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
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
    series: isZh ? "系列" : "Series",
    packageType: isZh ? "包装类型" : "Package Type",
    packType: isZh ? "包装形态" : "Pack Type",
    mappingStatus: isZh ? "映射状态" : "Mapping Status",
    createdAt: isZh ? "创建时间" : "Created At",
    mapped: isZh ? "已映射" : "Mapped",
    unmapped: isZh ? "未映射" : "Unmapped",
    active: isZh ? "启用" : "Active",
    disabled: isZh ? "禁用" : "Disabled",
    drawerTitle: isZh ? "编辑竞品商品" : "Edit Competitor Product",
    drawerHint: isZh ? "竞品编码不可编辑，其余主数据字段可维护。" : "Competitor code is locked. Other master fields are editable.",
    competitorCode: isZh ? "竞品编码" : "Competitor Code",
    rawTitle: isZh ? "原始商品名" : "Raw Title",
    segment: isZh ? "商品等级" : "Segment",
    unknown: isZh ? "未知" : "Unknown",
    close: isZh ? "关闭" : "Close",
    cancel: isZh ? "取消" : "Cancel",
    save: isZh ? "保存" : "Save",
    saving: isZh ? "保存中..." : "Saving...",
    saveFailed: isZh ? "保存竞品主数据失败" : "Failed to save competitor product master",
    missingFields: (fields: string[]) => isZh ? `待补：${fields.join("、")}` : `Missing: ${fields.join(", ")}`,
  };
}
