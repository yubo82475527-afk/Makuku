"use client";

import { Loader2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { ProductMatchNormalization, ProductMatchNormalizationField } from "@/lib/types";

type FieldOption = { value: ProductMatchNormalizationField; zh: string; en: string };

export function ProductMatchNormalizationDrawer({
  locale,
  fields,
  rule,
  brandOptions,
  canonicalOptions,
  submitting,
  onClose,
  onSubmit,
}: {
  locale: string;
  fields: FieldOption[];
  rule: ProductMatchNormalization | null;
  brandOptions: string[];
  canonicalOptions: Record<ProductMatchNormalizationField, string[]>;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, string>) => void;
}) {
  const isZh = locale === "zh";
  const [field, setField] = useState<ProductMatchNormalizationField>(rule?.field ?? "series");
  const [brandScope, setBrandScope] = useState(rule?.brand_scope ?? "");
  const [sourceValue, setSourceValue] = useState(rule?.source_value ?? "");
  const [canonicalValue, setCanonicalValue] = useState(rule?.canonical_value ?? "");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      field,
      brand_scope: brandScope,
      source_value: sourceValue,
      canonical_value: canonicalValue,
      ...(rule ? { editing_rule_id: rule.id } : {}),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label={rule ? (isZh ? "编辑标准化规则" : "Edit normalization rule") : (isZh ? "新增标准化规则" : "Add normalization rule")} onClick={(event) => {
      if (event.target === event.currentTarget && !submitting) onClose();
    }}>
      <section className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{rule ? (isZh ? "编辑标准化规则" : "Edit normalization rule") : (isZh ? "新增标准化规则" : "Add normalization rule")}</h2>
            <p className="mt-1 text-sm text-slate-500">{isZh ? "规范值仅可选择当前字段在启用商品主档中的值。" : "Canonical values are limited to active product master values for the selected field."}</p>
          </div>
          <button type="button" aria-label={isZh ? "关闭" : "Close"} title={isZh ? "关闭" : "Close"} disabled={submitting} onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-950 disabled:opacity-50">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-5">
          <label className="block text-sm font-medium text-slate-700">
            {isZh ? "字段" : "Field"}
            <select value={field} onChange={(event) => {
              setField(event.target.value as ProductMatchNormalizationField);
              setCanonicalValue("");
            }} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200">
              {fields.map((item) => <option key={item.value} value={item.value}>{item[isZh ? "zh" : "en"]}</option>)}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            {isZh ? "品牌范围" : "Brand scope"}
            <input value={brandScope} onChange={(event) => setBrandScope(event.target.value)} list="match-normalization-brands" placeholder={isZh ? "留空表示全品牌" : "Empty for all brands"} className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
          </label>
          <datalist id="match-normalization-brands">
            {brandOptions.map((brand) => <option key={brand} value={brand} />)}
          </datalist>

          <label className="block text-sm font-medium text-slate-700">
            {isZh ? "原始写法" : "Source value"}
            <input value={sourceValue} onChange={(event) => setSourceValue(event.target.value)} required placeholder="SLIMCARE" className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            {isZh ? "规范值" : "Canonical value"}
            <select value={canonicalValue} onChange={(event) => setCanonicalValue(event.target.value)} required className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200">
              <option value="">{isZh ? "请选择规范值" : "Select canonical value"}</option>
              {canonicalOptions[field].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" disabled={submitting} onClick={onClose} className="h-9 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{isZh ? "取消" : "Cancel"}</button>
            <button type="submit" disabled={submitting} className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {rule ? (isZh ? "保存修改" : "Save changes") : (isZh ? "保存规则" : "Save rule")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
