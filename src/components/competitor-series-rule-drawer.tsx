"use client";

import { Loader2, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { seriesKey } from "@/lib/competitor-series-mapping";
import type { CompetitorSeriesMapping } from "@/lib/types";

type CompetitorBrandOption = { id: string; name: string };
type CompetitorSeriesGroup = { brand_id: string; brand_name: string; product_series: string | null };

export function CompetitorSeriesRuleDrawer({
  locale,
  rule,
  brands,
  groups,
  group2Options,
  submitting,
  onClose,
  onSubmit,
}: {
  locale: string;
  rule: CompetitorSeriesMapping | null;
  brands: CompetitorBrandOption[];
  groups: CompetitorSeriesGroup[];
  group2Options: string[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (body: {
    brand_id: string;
    product_series: string;
    target_material_group2: string[];
  }) => void;
}) {
  const isZh = locale === "zh";
  const initialBrandName = rule
    ? (brands.find((brand) => brand.id === rule.brand_id)?.name ?? "")
    : "";
  const [brandName, setBrandName] = useState(initialBrandName);
  const [productSeries, setProductSeries] = useState(rule?.product_series ?? "");
  const [selectedTargets, setSelectedTargets] = useState<string[]>(
    Array.isArray(rule?.target_material_group2s) ? rule.target_material_group2s.filter(Boolean) : [],
  );
  const [group2Query, setGroup2Query] = useState("");

  const brandId = useMemo(() => {
    const normalized = brandName.trim().toLowerCase();
    if (!normalized) return "";
    return brands.find((brand) => brand.name.trim().toLowerCase() === normalized)?.id ?? "";
  }, [brandName, brands]);

  const seriesOptions = useMemo(() => {
    if (!brandId) return [];
    const byBrand = groups.filter((group) => group.brand_id === brandId);
    const merged = new Map<string, CompetitorSeriesGroup>();
    for (const group of byBrand) {
      const key = seriesKey(group.product_series);
      if (!merged.has(key)) merged.set(key, group);
    }
    return Array.from(merged.values()).sort((left, right) =>
      String(left.product_series ?? "").localeCompare(String(right.product_series ?? "")),
    );
  }, [brandId, groups]);
  const filteredGroup2Options = useMemo(() => {
    const query = group2Query.trim().toLowerCase();
    if (!query) return group2Options;
    return group2Options.filter((item) => item.toLowerCase().includes(query));
  }, [group2Options, group2Query]);

  const fieldClassName =
    "mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!brandId) {
      window.alert(isZh ? "请从列表中选择有效的竞品品牌" : "Select a valid competitor brand from the list");
      return;
    }
    if (!selectedTargets.length) {
      window.alert(isZh ? "请至少选择一个 GPL2" : "Select at least one GPL2");
      return;
    }
    onSubmit({
      brand_id: brandId,
      product_series: productSeries,
      target_material_group2: selectedTargets,
    });
  }

  function toggleTarget(value: string) {
    setSelectedTargets((current) => (
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    ));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={rule ? (isZh ? "编辑映射规则" : "Edit mapping rule") : (isZh ? "新增映射规则" : "Add mapping rule")}
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <section className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              {rule ? (isZh ? "编辑映射规则" : "Edit mapping rule") : (isZh ? "新增映射规则" : "Add mapping rule")}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {isZh
                ? "一个竞品系列可勾选多个 GPL2（material_group2）。"
                : "One competitor series can map to multiple GPL2 (material_group2) values."}
            </p>
          </div>
          <button
            type="button"
            aria-label={isZh ? "关闭" : "Close"}
            title={isZh ? "关闭" : "Close"}
            disabled={submitting}
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-950 disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-5">
          <label className="block text-sm font-medium text-slate-700">
            {isZh ? "竞品品牌" : "Competitor Brand"}
            <input
              value={brandName}
              required
              onChange={(event) => {
                setBrandName(event.target.value);
                setProductSeries("");
              }}
              list="competitor-brand-rule-options"
              placeholder={isZh ? "选择或输入竞品品牌" : "Select or type competitor brand"}
              className={fieldClassName}
            />
          </label>
          <datalist id="competitor-brand-rule-options">
            {brands.map((brand) => (
              <option key={brand.id} value={brand.name} />
            ))}
          </datalist>

          <label className="block text-sm font-medium text-slate-700">
            {isZh ? "竞品系列" : "Competitor Series"}
            <input
              value={productSeries}
              onChange={(event) => setProductSeries(event.target.value)}
              list="competitor-series-rule-options"
              placeholder={isZh ? "先选品牌，再选或输入系列；无系列留空" : "Select brand first; leave empty for no series"}
              disabled={!brandId}
              className={fieldClassName}
            />
          </label>
          <datalist id="competitor-series-rule-options">
            {seriesOptions.map((group) => (
              <option
                key={`${group.brand_id}:${seriesKey(group.product_series)}`}
                value={group.product_series ?? ""}
              >
                {group.product_series || (isZh ? "无系列" : "No series")}
              </option>
            ))}
          </datalist>

          <div className="block text-sm font-medium text-slate-700">
            {isZh ? "GPL2（material_group2）" : "GPL2 (material_group2)"}
            <input
              value={group2Query}
              onChange={(event) => setGroup2Query(event.target.value)}
              placeholder={isZh ? "搜索 GPL2" : "Search GPL2"}
              className={fieldClassName}
            />
            <div className="mt-2 max-h-48 overflow-auto rounded-md border border-slate-300 bg-white p-2">
              {filteredGroup2Options.length ? filteredGroup2Options.map((group2) => (
                <label key={group2} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm font-normal text-slate-700 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selectedTargets.includes(group2)}
                    onChange={() => toggleTarget(group2)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="min-w-0 flex-1 truncate">{group2}</span>
                </label>
              )) : (
                <p className="px-1 py-2 text-xs text-slate-500">
                  {group2Options.length
                    ? (isZh ? "没有匹配的 GPL2" : "No matching GPL2")
                    : (isZh ? "暂无 material_group2，请先在自有产品中维护" : "No material_group2 values yet. Maintain them in Own Products first.")}
                </p>
              )}
            </div>
            {selectedTargets.length ? (
              <p className="mt-2 text-xs font-normal text-slate-500">
                {isZh ? `已选 ${selectedTargets.length} 项` : `${selectedTargets.length} selected`}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="h-9 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {isZh ? "取消" : "Cancel"}
            </button>
            <button
              type="submit"
              disabled={submitting || !group2Options.length}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {rule ? (isZh ? "保存修改" : "Save changes") : (isZh ? "保存规则" : "Save rule")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
