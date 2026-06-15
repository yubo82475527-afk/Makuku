"use client";

import { useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { findMatchingMaterialForSeries, makukuSeriesOptions, seriesKey } from "@/lib/competitor-series-mapping";
import type { CompetitorProduct, CompetitorSeriesMapping, MaterialMaster } from "@/lib/types";

type CompetitorSeriesRulesPanelProps = {
  products: CompetitorProduct[];
  materials: MaterialMaster[];
  rules: CompetitorSeriesMapping[];
  locale: string;
};

export function CompetitorSeriesRulesPanel({ products, materials, rules, locale }: CompetitorSeriesRulesPanelProps) {
  const copy = getCopy(locale);
  const [open, setOpen] = useState(false);
  const seriesOptions = useMemo(() => makukuSeriesOptions(materials), [materials]);
  const competitorGroups = useMemo(() => buildCompetitorGroups(products), [products]);
  const competitorBrands = useMemo(() => buildCompetitorBrands(competitorGroups), [competitorGroups]);
  const ruleStats = useMemo(() => rules.map((rule) => ({ rule, stats: statsForRule(rule, products, materials) })), [rules, products, materials]);
  const selectedBrandId = competitorBrands[0]?.id ?? "";
  const selectedGroup = competitorGroups.find((group) => group.brand_id === selectedBrandId);

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="inline-flex items-center gap-2 font-semibold text-slate-900">
          <Settings2 className="h-4 w-4" />
          {copy.title}
        </span>
        <span className="text-sm text-slate-500">{open ? copy.collapse : copy.expand}</span>
      </button>

      {open ? (
        <div className="mt-3 space-y-4">
          <form action="/api/competitor-series-matches" method="post" className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 md:grid-cols-4">
            <input type="hidden" name="return_to" value={`/${locale}/competitor-mappings?mapping=all`} />
            <label className="text-sm font-medium text-slate-700">
              {copy.brand}
              <select name="brand_id" required defaultValue={selectedBrandId} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm">
                {competitorBrands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              {copy.competitorSeries}
              <input
                name="product_series"
                list="competitor-series-options"
                defaultValue={selectedGroup?.product_series ?? ""}
                placeholder={copy.noSeriesPlaceholder}
                className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
              />
            </label>
            <datalist id="competitor-series-options">
              {competitorGroups.map((group) => (
                <option key={`${group.brand_id}:${group.product_series ?? ""}`} value={group.product_series ?? ""}>
                  {group.brand_name} {group.product_series || copy.noSeries}
                </option>
              ))}
            </datalist>
            <label className="text-sm font-medium text-slate-700">
              {copy.makukuSeries}
              <select name="target_makuku_series" required className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm">
                <option value="">{copy.selectSeries}</option>
                {seriesOptions.map((series) => <option key={series} value={series}>{series}</option>)}
              </select>
            </label>
            <div className="flex items-end">
              <button type="submit" className="h-9 w-full rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800">
                {copy.saveRule}
              </button>
            </div>
          </form>

          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-white text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">{copy.brand}</th>
                  <th className="px-3 py-2">{copy.competitorSeries}</th>
                  <th className="px-3 py-2">{copy.makukuSeries}</th>
                  <th className="px-3 py-2">{copy.products}</th>
                  <th className="px-3 py-2">{copy.ruleMatched}</th>
                  <th className="px-3 py-2">{copy.manualOverride}</th>
                  <th className="px-3 py-2">{copy.unmatched}</th>
                  <th className="px-3 py-2">{copy.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {ruleStats.length > 0 ? ruleStats.map(({ rule, stats }) => (
                  <tr key={rule.id}>
                    <td className="px-3 py-2 font-medium">{rule.brands?.name ?? competitorBrands.find((brand) => brand.id === rule.brand_id)?.name ?? "-"}</td>
                    <td className="px-3 py-2">{rule.product_series || copy.noSeries}</td>
                    <td className="px-3 py-2">{rule.target_makuku_series}</td>
                    <td className="px-3 py-2">{stats.total}</td>
                    <td className="px-3 py-2">{stats.seriesMatched}</td>
                    <td className="px-3 py-2">{stats.manualOverrides}</td>
                    <td className="px-3 py-2">{stats.unmatched}</td>
                    <td className="px-3 py-2">
                      <form action="/api/competitor-series-matches" method="post">
                        <input type="hidden" name="intent" value="clear" />
                        <input type="hidden" name="return_to" value={`/${locale}/competitor-mappings?mapping=all`} />
                        <input type="hidden" name="brand_id" value={rule.brand_id} />
                        <input type="hidden" name="product_series" value={rule.product_series ?? ""} />
                        <button type="submit" className="text-sm font-medium text-red-700 hover:underline">{copy.clearRule}</button>
                      </form>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td className="px-3 py-4 text-sm text-slate-500" colSpan={8}>{copy.empty}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildCompetitorGroups(products: CompetitorProduct[]) {
  const groups = new Map<string, { brand_id: string; brand_name: string; product_series: string | null }>();
  for (const product of products) {
    const key = `${product.brand_id}:${seriesKey(product.product_series)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        brand_id: product.brand_id,
        brand_name: product.brands?.name ?? "",
        product_series: product.product_series ?? null,
      });
    }
  }
  return Array.from(groups.values()).sort((left, right) => `${left.brand_name} ${left.product_series ?? ""}`.localeCompare(`${right.brand_name} ${right.product_series ?? ""}`));
}

function buildCompetitorBrands(groups: Array<{ brand_id: string; brand_name: string }>) {
  const brands = new Map<string, { id: string; name: string }>();
  for (const group of groups) {
    if (group.brand_id && !brands.has(group.brand_id)) brands.set(group.brand_id, { id: group.brand_id, name: group.brand_name });
  }
  return Array.from(brands.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function statsForRule(rule: CompetitorSeriesMapping, products: CompetitorProduct[], materials: MaterialMaster[]) {
  const groupProducts = products.filter((product) => product.brand_id === rule.brand_id && seriesKey(product.product_series) === seriesKey(rule.product_series));
  let seriesMatched = 0;
  let manualOverrides = 0;
  let unmatched = 0;
  for (const product of groupProducts) {
    const match = product.sku_matches?.[0];
    if (match?.match_method === "manual") {
      manualOverrides += 1;
      continue;
    }
    if (match?.match_method === "series_rule") {
      seriesMatched += 1;
      continue;
    }
    const materialMatch = findMatchingMaterialForSeries(product, rule.target_makuku_series, materials);
    if (materialMatch.status !== "matched") unmatched += 1;
  }
  return { total: groupProducts.length, seriesMatched, manualOverrides, unmatched };
}

function getCopy(locale: string) {
  const isZh = locale === "zh";
  return {
    title: isZh ? "系列映射规则" : "Series Mapping Rules",
    expand: isZh ? "展开设置" : "Expand",
    collapse: isZh ? "收起" : "Collapse",
    brand: isZh ? "竞品品牌" : "Competitor Brand",
    competitorSeries: isZh ? "竞品系列" : "Competitor Series",
    makukuSeries: isZh ? "Makuku 系列" : "Makuku Series",
    selectSeries: isZh ? "选择 Makuku 系列" : "Select Makuku series",
    noSeries: isZh ? "无系列" : "No series",
    noSeriesPlaceholder: isZh ? "无系列留空" : "Leave empty for no series",
    saveRule: isZh ? "保存并应用规则" : "Save and Apply",
    products: isZh ? "商品数" : "Products",
    ruleMatched: isZh ? "规则匹配" : "Rule matched",
    manualOverride: isZh ? "人工覆盖" : "Manual",
    unmatched: isZh ? "未匹配规格" : "Unmatched",
    actions: isZh ? "操作" : "Actions",
    clearRule: isZh ? "清空规则" : "Clear rule",
    empty: isZh ? "暂无系列映射规则" : "No series mapping rules",
  };
}
