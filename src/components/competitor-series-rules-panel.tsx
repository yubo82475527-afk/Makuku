"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CompetitorSeriesRuleDrawer } from "@/components/competitor-series-rule-drawer";
import { materialGroup2Options, seriesKey } from "@/lib/competitor-series-mapping";
import type { CompetitorProduct, CompetitorSeriesMapping, MaterialMaster } from "@/lib/types";

type CompetitorSeriesRulesPanelProps = {
  products: CompetitorProduct[];
  materials: MaterialMaster[];
  rules: CompetitorSeriesMapping[];
  locale: string;
};

export function CompetitorSeriesRulesPanel({ products, materials, rules, locale }: CompetitorSeriesRulesPanelProps) {
  const router = useRouter();
  const copy = getCopy(locale);
  const isZh = locale === "zh";
  const [activeRule, setActiveRule] = useState<CompetitorSeriesMapping | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CompetitorSeriesMapping | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const group2Options = useMemo(() => materialGroup2Options(materials), [materials]);
  const competitorGroups = useMemo(() => buildCompetitorGroups(products), [products]);
  const competitorBrands = useMemo(() => buildCompetitorBrands(competitorGroups), [competitorGroups]);
  const activeRules = useMemo(() => rules.filter((rule) => rule.active), [rules]);
  const ruleStats = useMemo(() => activeRules.map((rule) => ({ rule, stats: statsForRule(rule, products) })), [activeRules, products]);
  const coverage = ruleCoverageSummary(ruleStats.map(({ stats }) => stats), locale);

  async function submitRequest(body: Record<string, unknown>) {
    if (submitting) return false;
    setSubmitting(true);
    try {
      const response = await fetch("/api/competitor-series-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Request failed");
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : (isZh ? "请求失败" : "Request failed"));
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function saveRule(body: {
    brand_id: string;
    product_series: string;
    target_material_group2: string[];
  }) {
    if (!await submitRequest(body)) return;
    setActiveRule(null);
    router.refresh();
  }

  async function setBenchmark(rule: CompetitorSeriesMapping) {
    if (!await submitRequest({
      intent: "set_benchmark",
      brand_id: rule.brand_id,
      product_series: rule.product_series ?? "",
    })) return;
    router.refresh();
  }

  async function clearBenchmark(rule: CompetitorSeriesMapping) {
    if (!await submitRequest({
      intent: "clear_benchmark",
      brand_id: rule.brand_id,
      product_series: rule.product_series ?? "",
    })) return;
    router.refresh();
  }

  async function deleteRule() {
    if (!pendingDelete) return;
    if (!await submitRequest({
      intent: "delete_rule",
      brand_id: pendingDelete.brand_id,
      product_series: pendingDelete.product_series ?? "",
    })) return;
    setPendingDelete(null);
    router.refresh();
  }

  return (
    <div data-role="automatic-mapping-rules" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">{copy.title}</h2>
          <p className="mt-1 text-xs text-slate-500">{coverage}</p>
        </div>
        <button
          type="button"
          onClick={() => setActiveRule("new")}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {copy.addRule}
        </button>
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-white text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">{copy.brand}</th>
              <th className="px-3 py-2">{copy.competitorSeries}</th>
              <th className="px-3 py-2">{copy.makukuSeries}</th>
              <th className="px-3 py-2">{copy.coveredSkus}</th>
              <th className="px-3 py-2">{copy.defaultBenchmark}</th>
              <th className="w-24 px-3 py-2 text-right">{copy.actions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {ruleStats.length > 0 ? ruleStats.map(({ rule, stats }) => (
              <tr key={rule.id}>
                <td className="px-3 py-2 font-medium">
                  {rule.brands?.name ?? competitorBrands.find((brand) => brand.id === rule.brand_id)?.name ?? "-"}
                </td>
                <td className="px-3 py-2">{rule.product_series || copy.noSeries}</td>
                <td className="px-3 py-2">{formatTargets(rule.target_material_group2s)}</td>
                <td className="px-3 py-2">{stats.coveredSkus}</td>
                <td className="px-3 py-2">
                  {rule.is_default_benchmark ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                        {copy.currentBenchmark}
                      </span>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => clearBenchmark(rule)}
                        className="text-sm font-medium text-slate-600 hover:underline disabled:opacity-50"
                      >
                        {copy.clearBenchmark}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => setBenchmark(rule)}
                      className="text-sm font-medium text-blue-700 hover:underline disabled:opacity-50"
                    >
                      {copy.setBenchmark}
                    </button>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      aria-label={copy.editRule}
                      title={copy.editRule}
                      onClick={() => setActiveRule(rule)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={copy.clearRule}
                      title={copy.clearRule}
                      onClick={() => setPendingDelete(rule)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td className="px-3 py-8 text-center text-sm text-slate-500" colSpan={6}>{copy.empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {activeRule ? (
        <CompetitorSeriesRuleDrawer
          key={activeRule === "new" ? "new" : activeRule.id}
          locale={locale}
          rule={activeRule === "new" ? null : activeRule}
          brands={competitorBrands}
          groups={competitorGroups}
          group2Options={group2Options}
          submitting={submitting}
          onClose={() => setActiveRule(null)}
          onSubmit={saveRule}
        />
      ) : null}

      {pendingDelete ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={copy.confirmDeleteTitle}
          onClick={(event) => {
            if (event.target === event.currentTarget && !submitting) setPendingDelete(null);
          }}
        >
          <section className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl">
            <h2 className="text-base font-semibold text-slate-950">{copy.confirmDeleteTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {copy.confirmDeleteBody(
                pendingDelete.brands?.name
                  ?? competitorBrands.find((brand) => brand.id === pendingDelete.brand_id)?.name
                  ?? "-",
                pendingDelete.product_series || copy.noSeries,
              )}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setPendingDelete(null)}
                className="h-9 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {copy.cancel}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={deleteRule}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-rose-600 px-3 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {copy.confirmDelete}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function formatTargets(targets: string[] | null | undefined) {
  const list = Array.isArray(targets) ? targets.filter(Boolean) : [];
  return list.length ? list.join(", ") : "-";
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
    addRule: isZh ? "新增规则" : "Add rule",
    editRule: isZh ? "编辑规则" : "Edit rule",
    brand: isZh ? "竞品品牌" : "Competitor Brand",
    competitorSeries: isZh ? "竞品系列" : "Competitor Series",
    makukuSeries: isZh ? "GPL2（material_group2）" : "GPL2 (material_group2)",
    noSeries: isZh ? "无系列" : "No series",
    coveredSkus: isZh ? "适用竞品 SKU 数" : "Applicable competitor SKUs",
    defaultBenchmark: isZh ? "默认标杆" : "Default benchmark",
    currentBenchmark: isZh ? "已是标杆" : "Current benchmark",
    setBenchmark: isZh ? "设为标杆" : "Set benchmark",
    clearBenchmark: isZh ? "取消标杆" : "Clear benchmark",
    actions: isZh ? "操作" : "Action",
    clearRule: isZh ? "删除规则" : "Delete rule",
    empty: isZh ? "暂无自动映射规则" : "No automatic mapping rules",
    cancel: isZh ? "取消" : "Cancel",
    confirmDelete: isZh ? "确认删除" : "Confirm delete",
    confirmDeleteTitle: isZh ? "确认删除规则" : "Confirm delete rule",
    confirmDeleteBody: (brand: string, series: string) => (
      isZh
        ? `确认删除“${brand} / ${series}”的映射规则吗？规则会停止生效。`
        : `Delete the mapping rule for "${brand} / ${series}"? It will stop applying.`
    ),
  };
}
