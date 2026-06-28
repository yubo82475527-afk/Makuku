"use client";

import { useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { makukuSeriesOptions, seriesKey } from "@/lib/competitor-series-mapping";
import type { CompetitorProduct, CompetitorSeriesMapping, MaterialMaster } from "@/lib/types";

type CompetitorSeriesRulesPanelProps = {
  products: CompetitorProduct[];
  materials: MaterialMaster[];
  rules: CompetitorSeriesMapping[];
  locale: string;
};

export function CompetitorSeriesRulesPanel({ products, materials, rules, locale }: CompetitorSeriesRulesPanelProps) {
  const copy = getCopy(locale);
  const [open, setOpen] = useState(true);
  const seriesOptions = useMemo(() => makukuSeriesOptions(materials), [materials]);
  const competitorGroups = useMemo(() => buildCompetitorGroups(products), [products]);
  const competitorBrands = useMemo(() => buildCompetitorBrands(competitorGroups), [competitorGroups]);
  const activeRules = useMemo(() => rules.filter((rule) => rule.active), [rules]);
  const ruleStats = useMemo(() => activeRules.map((rule) => ({ rule, stats: statsForRule(rule, products) })), [activeRules, products]);
  const selectedBrandId = competitorBrands[0]?.id ?? "";
  const selectedGroup = competitorGroups.find((group) => group.brand_id === selectedBrandId);
  const coverage = ruleCoverageSummary(ruleStats.map(({ stats }) => stats), locale);

  return (
    <div data-role="automatic-mapping-rules" className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="inline-flex items-center gap-2 font-semibold text-slate-900">
            <Settings2 className="h-4 w-4" />
            {copy.title}
          </span>
          <span className="mt-1 block text-xs text-slate-500">{coverage}</span>
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
                  <th className="px-3 py-2">{copy.coveredSkus}</th>
                  <th className="px-3 py-2">{copy.defaultBenchmark}</th>
                  <th className="px-3 py-2">{copy.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {ruleStats.length > 0 ? ruleStats.map(({ rule, stats }) => (
                  <tr key={rule.id}>
                    <td className="px-3 py-2 font-medium">{rule.brands?.name ?? competitorBrands.find((brand) => brand.id === rule.brand_id)?.name ?? "-"}</td>
                    <td className="px-3 py-2">{rule.product_series || copy.noSeries}</td>
                    <td className="px-3 py-2">{rule.target_makuku_series}</td>
                    <td className="px-3 py-2">{stats.coveredSkus}</td>
                    <td className="px-3 py-2">
                      {rule.is_default_benchmark ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                            {copy.currentBenchmark}
                          </span>
                          <form action="/api/competitor-series-matches" method="post">
                            <input type="hidden" name="intent" value="clear_benchmark" />
                            <input type="hidden" name="return_to" value={`/${locale}/competitor-mappings`} />
                            <input type="hidden" name="brand_id" value={rule.brand_id} />
                            <input type="hidden" name="product_series" value={rule.product_series ?? ""} />
                            <button type="submit" className="text-sm font-medium text-slate-600 hover:underline">
                              {copy.clearBenchmark}
                            </button>
                          </form>
                        </div>
                      ) : (
                        <form action="/api/competitor-series-matches" method="post">
                          <input type="hidden" name="intent" value="set_benchmark" />
                          <input type="hidden" name="return_to" value={`/${locale}/competitor-mappings`} />
                          <input type="hidden" name="brand_id" value={rule.brand_id} />
                          <input type="hidden" name="product_series" value={rule.product_series ?? ""} />
                          <input type="hidden" name="target_makuku_series" value={rule.target_makuku_series} />
                          <button type="submit" className="text-sm font-medium text-blue-700 hover:underline">
                            {copy.setBenchmark}
                          </button>
                        </form>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <form action="/api/competitor-series-matches" method="post">
                        <input type="hidden" name="intent" value="delete_rule" />
                        <input type="hidden" name="return_to" value={`/${locale}/competitor-mappings?mapping=all`} />
                        <input type="hidden" name="brand_id" value={rule.brand_id} />
                        <input type="hidden" name="product_series" value={rule.product_series ?? ""} />
                        <button type="submit" className="text-sm font-medium text-red-700 hover:underline">{copy.clearRule}</button>
                      </form>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td className="px-3 py-4 text-sm text-slate-500" colSpan={6}>{copy.empty}</td>
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

function statsForRule(rule: CompetitorSeriesMapping, products: CompetitorProduct[]) {
  const groupProducts = products.filter((product) => product.brand_id === rule.brand_id && seriesKey(product.product_series) === seriesKey(rule.product_series));
  return { coveredSkus: groupProducts.length };
}

function ruleCoverageSummary(stats: Array<{ coveredSkus: number }>, locale: string) {
  const total = stats.reduce((sum, item) => sum + item.coveredSkus, 0);
  return locale === "zh"
    ? `当前自动规则适用于 ${total} 个竞品 SKU`
    : `${total} competitor SKUs are covered by active automatic rules`;
}

function getCopy(locale: string) {
  const isZh = locale === "zh";
  return {
    title: isZh ? "自动映射规则" : "Automatic Mapping Rules",
    expand: isZh ? "展开设置" : "Expand",
    collapse: isZh ? "收起" : "Collapse",
    brand: isZh ? "竞品品牌" : "Competitor Brand",
    competitorSeries: isZh ? "竞品系列" : "Competitor Series",
    makukuSeries: isZh ? "Makuku 系列" : "Makuku Series",
    selectSeries: isZh ? "选择 Makuku 系列" : "Select Makuku series",
    noSeries: isZh ? "无系列" : "No series",
    noSeriesPlaceholder: isZh ? "无系列留空" : "Leave empty for no series",
    saveRule: isZh ? "保存并应用规则" : "Save and Apply",
    coveredSkus: isZh ? "适用竞品 SKU 数" : "Applicable competitor SKUs",
    defaultBenchmark: isZh ? "默认标杆" : "Default benchmark",
    currentBenchmark: isZh ? "已是标杆" : "Current benchmark",
    setBenchmark: isZh ? "设为标杆" : "Set benchmark",
    clearBenchmark: isZh ? "取消标杆" : "Clear benchmark",
    actions: isZh ? "操作" : "Actions",
    clearRule: isZh ? "删除规则" : "Delete rule",
    empty: isZh ? "暂无自动映射规则" : "No automatic mapping rules",
  };
}
