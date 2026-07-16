"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ProductMatchNormalizationDrawer } from "@/components/product-match-normalization-drawer";
import type { ProductMatchNormalization, ProductMatchNormalizationField } from "@/lib/types";

type ProductMatchNormalizationsPanelProps = {
  locale: string;
  rules: ProductMatchNormalization[];
  brandOptions: string[];
  canonicalOptions: Record<ProductMatchNormalizationField, string[]>;
};

const fields: Array<{ value: ProductMatchNormalizationField; zh: string; en: string }> = [
  { value: "brand", zh: "品牌", en: "Brand" },
  { value: "series", zh: "系列", en: "Series" },
  { value: "size", zh: "尺码", en: "Size" },
  { value: "piece_count", zh: "片数", en: "Pieces" },
];

export function ProductMatchNormalizationsPanel({ locale, rules, brandOptions, canonicalOptions }: ProductMatchNormalizationsPanelProps) {
  const router = useRouter();
  const isZh = locale === "zh";
  const [filterField, setFilterField] = useState<"all" | ProductMatchNormalizationField>("all");
  const [activeRule, setActiveRule] = useState<ProductMatchNormalization | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProductMatchNormalization | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const visibleRules = useMemo(
    () => filterField === "all" ? rules : rules.filter((rule) => rule.field === filterField),
    [filterField, rules],
  );
  const label = (field: ProductMatchNormalizationField) => fields.find((item) => item.value === field)?.[isZh ? "zh" : "en"] ?? field;

  async function submitRequest(body: Record<string, string>) {
    if (submitting) return false;
    setSubmitting(true);
    try {
      const response = await fetch("/api/product-match-normalizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Request failed");
      return true;
    } catch (error) {
      window.alert(formatError(error, isZh));
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function saveRule(body: Record<string, string>) {
    if (!await submitRequest(body)) return;
    setActiveRule(null);
    router.refresh();
  }

  async function deactivateRule() {
    if (!pendingDelete) return;
    if (!await submitRequest({ intent: "deactivate", id: pendingDelete.id })) return;
    setPendingDelete(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="text-sm font-medium text-slate-700">
          {isZh ? "字段筛选" : "Filter by field"}
          <select value={filterField} onChange={(event) => setFilterField(event.target.value as "all" | ProductMatchNormalizationField)} className="mt-1 block h-9 min-w-40 rounded-md border border-slate-300 bg-white px-2 text-sm font-normal text-slate-900">
            <option value="all">{isZh ? "全部字段" : "All fields"}</option>
            {fields.map((field) => <option key={field.value} value={field.value}>{field[isZh ? "zh" : "en"]}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => setActiveRule("new")} className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {isZh ? "新增规则" : "Add rule"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">{isZh ? "字段" : "Field"}</th>
              <th className="px-3 py-2">{isZh ? "品牌范围" : "Brand scope"}</th>
              <th className="px-3 py-2">{isZh ? "原始写法" : "Source value"}</th>
              <th className="px-3 py-2">{isZh ? "规范值" : "Canonical value"}</th>
              <th className="w-24 px-3 py-2 text-right">{isZh ? "操作" : "Action"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {visibleRules.map((rule) => (
              <tr key={rule.id}>
                <td className="px-3 py-2">{label(rule.field)}</td>
                <td className="px-3 py-2">{rule.brand_scope ?? (isZh ? "全品牌" : "All brands")}</td>
                <td className="px-3 py-2 font-medium">{rule.source_value}</td>
                <td className="px-3 py-2">{rule.canonical_value}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <button type="button" aria-label={isZh ? "编辑规则" : "Edit rule"} title={isZh ? "编辑" : "Edit"} onClick={() => setActiveRule(rule)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-950">
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button" aria-label={isZh ? "删除规则" : "Delete rule"} title={isZh ? "删除" : "Delete"} onClick={() => setPendingDelete(rule)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-rose-700 hover:bg-rose-50">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {visibleRules.length === 0 ? <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">{isZh ? "没有符合筛选条件的标准化规则" : "No normalization rules match this filter"}</td></tr> : null}
          </tbody>
        </table>
      </div>

      {activeRule ? (
        <ProductMatchNormalizationDrawer
          key={activeRule === "new" ? "new" : activeRule.id}
          locale={locale}
          fields={fields}
          rule={activeRule === "new" ? null : activeRule}
          brandOptions={brandOptions}
          canonicalOptions={canonicalOptions}
          submitting={submitting}
          onClose={() => setActiveRule(null)}
          onSubmit={saveRule}
        />
      ) : null}

      {pendingDelete ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label={isZh ? "确认删除规则" : "Confirm delete rule"} onClick={(event) => {
          if (event.target === event.currentTarget && !submitting) setPendingDelete(null);
        }}>
          <section className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl">
            <h2 className="text-base font-semibold text-slate-950">{isZh ? "确认删除规则" : "Confirm delete rule"}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{isZh ? `确认删除“${pendingDelete.source_value} -> ${pendingDelete.canonical_value}”吗？规则会停止生效，但会保留历史记录。` : `Delete "${pendingDelete.source_value} -> ${pendingDelete.canonical_value}"? It will stop applying while its history is retained.`}</p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" disabled={submitting} onClick={() => setPendingDelete(null)} className="h-9 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{isZh ? "取消" : "Cancel"}</button>
              <button type="button" disabled={submitting} onClick={deactivateRule} className="inline-flex h-9 items-center gap-2 rounded-md bg-rose-600 px-3 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {isZh ? "确认删除" : "Confirm delete"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function formatError(error: unknown, isZh: boolean) {
  const message = error instanceof Error ? error.message : "Request failed";
  if (!isZh) return message;
  if (message === "canonical_value must exist in active product master data") return "规范值不在当前启用的商品主档中，请从下拉列表中选择。";
  if (message === "source_value must differ from canonical_value") return "原始写法不能与规范值相同。";
  if (message === "piece_count rules cannot remap a bare integer") return "片数规则不能把单独的整数改为另一个片数。";
  return `操作失败：${message}`;
}
