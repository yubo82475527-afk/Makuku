"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { ProductMatchNormalization, ProductMatchNormalizationField } from "@/lib/types";

type ProductMatchNormalizationsPanelProps = {
  locale: string;
  rules: ProductMatchNormalization[];
  brandOptions: string[];
  canonicalOptions: Record<ProductMatchNormalizationField, string[]>;
  editingRule?: ProductMatchNormalization | null;
};

const fields: Array<{ value: ProductMatchNormalizationField; zh: string; en: string }> = [
  { value: "brand", zh: "品牌", en: "Brand" },
  { value: "series", zh: "系列", en: "Series" },
  { value: "size", zh: "尺码", en: "Size" },
  { value: "piece_count", zh: "片数", en: "Pieces" },
];

export function ProductMatchNormalizationsPanel({ locale, rules, brandOptions, canonicalOptions, editingRule = null }: ProductMatchNormalizationsPanelProps) {
  const router = useRouter();
  const isZh = locale === "zh";
  const formPath = `/${locale}/product-match-normalizations`;
  const [submitting, setSubmitting] = useState(false);
  const label = (field: ProductMatchNormalizationField) => fields.find((item) => item.value === field)?.[isZh ? "zh" : "en"] ?? field;

  async function submitRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/product-match-normalizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Request failed");
      router.replace(formPath);
      router.refresh();
    } catch (error) {
      window.alert(formatError(error, isZh));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submitRule} className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 md:grid-cols-4">
        <input type="hidden" name="return_to" value={formPath} />
        {editingRule ? <input type="hidden" name="editing_rule_id" value={editingRule.id} /> : null}
        <label className="text-sm font-medium text-slate-700">
          {isZh ? "字段" : "Field"}
          <select name="field" required defaultValue={editingRule?.field ?? "series"} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm">
            {fields.map((field) => <option key={field.value} value={field.value}>{field[isZh ? "zh" : "en"]}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          {isZh ? "品牌范围" : "Brand scope"}
          <input name="brand_scope" list="match-normalization-brands" defaultValue={editingRule?.brand_scope ?? ""} placeholder={isZh ? "留空表示全品牌" : "Empty for all brands"} className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm" />
        </label>
        <datalist id="match-normalization-brands">
          {brandOptions.map((brand) => <option key={brand} value={brand} />)}
        </datalist>
        <label className="text-sm font-medium text-slate-700">
          {isZh ? "原始写法" : "Source value"}
          <input name="source_value" required defaultValue={editingRule?.source_value ?? ""} placeholder="SLIMCARE" className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          {isZh ? "规范值" : "Canonical value"}
          <input name="canonical_value" list="match-normalization-values" required defaultValue={editingRule?.canonical_value ?? ""} placeholder={isZh ? "选择当前主档值" : "Select a current master value"} className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm" />
        </label>
        <datalist id="match-normalization-values">
          {fields.flatMap((field) => canonicalOptions[field.value].map((value) => <option key={`${field.value}:${value}`} value={value}>{label(field.value)}</option>))}
        </datalist>
        <div className="md:col-span-4 flex justify-end gap-3">
          {editingRule ? <Link href={formPath} className="inline-flex h-9 items-center text-sm font-medium text-slate-600 hover:underline">{isZh ? "取消" : "Cancel"}</Link> : null}
          <button type="submit" disabled={submitting} className="h-9 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
            {editingRule ? (isZh ? "保存修改" : "Save changes") : (isZh ? "保存规则" : "Save rule")}
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">{isZh ? "字段" : "Field"}</th>
              <th className="px-3 py-2">{isZh ? "品牌范围" : "Brand scope"}</th>
              <th className="px-3 py-2">{isZh ? "原始写法" : "Source value"}</th>
              <th className="px-3 py-2">{isZh ? "规范值" : "Canonical value"}</th>
              <th className="px-3 py-2">{isZh ? "操作" : "Action"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td className="px-3 py-2">{label(rule.field)}</td>
                <td className="px-3 py-2">{rule.brand_scope ?? (isZh ? "全品牌" : "All brands")}</td>
                <td className="px-3 py-2 font-medium">{rule.source_value}</td>
                <td className="px-3 py-2">{rule.canonical_value}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <Link href={`${formPath}?edit=${encodeURIComponent(rule.id)}`} className="text-sm font-medium text-blue-700 hover:underline">{isZh ? "编辑" : "Edit"}</Link>
                  <form onSubmit={submitRule}>
                    <input type="hidden" name="intent" value="deactivate" />
                    <input type="hidden" name="id" value={rule.id} />
                    <input type="hidden" name="return_to" value={formPath} />
                    <button type="submit" disabled={submitting} className="text-sm font-medium text-red-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50">{isZh ? "删除" : "Delete"}</button>
                  </form>
                  </div>
                </td>
              </tr>
            ))}
            {rules.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-slate-500">{isZh ? "暂无标准化规则" : "No normalization rules"}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatError(error: unknown, isZh: boolean) {
  const message = error instanceof Error ? error.message : "Request failed";
  if (!isZh) return message;
  if (message === "canonical_value must exist in active product master data") {
    return "规范值不在当前启用的商品主档中，请从下拉建议中选择。";
  }
  if (message === "source_value must differ from canonical_value") {
    return "原始写法不能与规范值相同。";
  }
  if (message === "piece_count rules cannot remap a bare integer") {
    return "片数规则不能把单独的整数改为另一个片数。";
  }
  return `操作失败：${message}`;
}
