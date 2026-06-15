import { AppShell } from "@/components/app-shell";
import { MarketBenchmarkBackfillDialog } from "@/components/market-benchmark-backfill-dialog";
import { MarketBenchmarkRuleDialog } from "@/components/market-benchmark-rule-dialog";
import { Badge, Button, Card, DataNotice, SelectInput, TextInput } from "@/components/ui";
import { getCompetitorProducts, getMarketBenchmarkRules } from "@/lib/data";
import { formatPricePerPiece } from "@/lib/format";
import { getPageI18n } from "@/lib/i18n/server";
import { benchmarkRegionLabel, benchmarkSeriesLabel, formatBenchmarkPeriod } from "@/lib/market-benchmark-rules";
import type { MarketBenchmarkPeriodPrice, MarketBenchmarkRule } from "@/lib/types";

type BenchmarkPeriodRow = {
  rule: MarketBenchmarkRule;
  price: MarketBenchmarkPeriodPrice | null;
};

export default async function MarketBenchmarksPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ province?: string; cityName?: string; district?: string; brand?: string; series?: string; status?: string }>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const query = await searchParams;
  const isZh = locale === "zh";
  const [ruleResult, competitorResult] = await Promise.all([
    getMarketBenchmarkRules(),
    getCompetitorProducts(),
  ]);
  const competitors = competitorResult.data.filter((product) => !product.brands?.name?.toLowerCase().includes("makuku"));
  const brands = Array.from(new Map(
    competitors
      .filter((product) => product.brands?.id && product.brands?.name)
      .map((product) => [product.brands?.id as string, { id: product.brands?.id as string, name: product.brands?.name as string }]),
  ).values()).sort((left, right) => left.name.localeCompare(right.name));
  const seriesOptions = Array.from(new Set(competitors.map((product) => product.product_series?.trim() || "__none__")))
    .sort((left, right) => seriesLabel(left, isZh).localeCompare(seriesLabel(right, isZh)));
  const currentPath = "/market-benchmarks";
  const rows: BenchmarkPeriodRow[] = ruleResult.data.flatMap((rule): BenchmarkPeriodRow[] => {
    const prices = rule.market_benchmark_period_prices ?? [];
    if (prices.length === 0) return [{ rule, price: null }];
    return [...prices]
      .sort((left, right) => right.start_date.localeCompare(left.start_date))
      .map((price) => ({ rule, price }));
  });
  const visibleRows = rows.filter(({ rule, price }) => {
    if (query.province && !sameText(rule.province, query.province)) return false;
    if (query.cityName && !sameText(rule.city_name, query.cityName)) return false;
    if (query.district && !sameText(rule.district, query.district)) return false;
    if (query.brand && rule.brand_id !== query.brand) return false;
    if (query.series && !sameText(rule.product_series || "__none__", query.series)) return false;
    if (query.status === "carried_forward" && price?.status !== "carried_forward") return false;
    if (query.status === "missing" && price) return false;
    if (query.status === "calculated" && price?.status !== "calculated") return false;
    return true;
  });
  const ruleOptions = ruleResult.data.map((rule) => ({
    id: rule.id,
    label: `${benchmarkRegionLabel(rule)} / ${benchmarkSeriesLabel(rule) || "-"}`,
  }));

  return (
    <AppShell locale={locale} dict={dict} title={isZh ? "市场标杆管理" : "Market Benchmarks"} currentPath={currentPath} isDemo={ruleResult.isDemo || competitorResult.isDemo}>
      <DataNotice dict={dict} error={ruleResult.error ?? competitorResult.error} />

      <Card className="mb-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">{isZh ? "筛选" : "Filters"}</h2>
            <p className="mt-1 text-sm text-slate-500">{isZh ? "按区域、竞品品牌、系列和标杆价状态筛选列表。" : "Filter by region, competitor brand, series, and benchmark price status."}</p>
          </div>
        </div>
        <form className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
          <TextInput name="province" placeholder={isZh ? "省" : "Province"} defaultValue={query.province ?? ""} />
          <TextInput name="cityName" placeholder={isZh ? "市" : "City"} defaultValue={query.cityName ?? ""} />
          <TextInput name="district" placeholder={isZh ? "区" : "District"} defaultValue={query.district ?? ""} />
          <SelectInput name="brand" defaultValue={query.brand ?? ""}>
            <option value="">{isZh ? "全部品牌" : "All brands"}</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>{brand.name}</option>
            ))}
          </SelectInput>
          <SelectInput name="series" defaultValue={query.series ?? ""}>
            <option value="">{isZh ? "全部系列" : "All series"}</option>
            {seriesOptions.map((series) => (
              <option key={series} value={series}>{seriesLabel(series, isZh)}</option>
            ))}
          </SelectInput>
          <SelectInput name="status" defaultValue={query.status ?? ""}>
            <option value="">{isZh ? "全部状态" : "All status"}</option>
            <option value="calculated">{isZh ? "已计算" : "Calculated"}</option>
            <option value="carried_forward">{isZh ? "沿用上一期" : "Carried forward"}</option>
            <option value="missing">{isZh ? "待采价" : "No price"}</option>
          </SelectInput>
          <div className="flex gap-2">
            <Button type="submit">{isZh ? "筛选" : "Filter"}</Button>
            <a href={`/${locale}/market-benchmarks`} className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {isZh ? "重置" : "Reset"}
            </a>
          </div>
        </form>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">{isZh ? "市场标杆列表" : "Market Benchmarks"}</h2>
            <div className="mt-1 text-sm text-slate-500">{visibleRows.length} / {rows.length} {isZh ? "条周期价" : "period rows"}</div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <MarketBenchmarkBackfillDialog locale={locale} isZh={isZh} rules={ruleOptions} />
            <MarketBenchmarkRuleDialog
              locale={locale}
              isZh={isZh}
              brands={brands}
              seriesOptions={seriesOptions.filter((series) => series !== "__none__")}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">{isZh ? "状态" : "Status"}</th>
                <th className="py-2 pr-3">{isZh ? "区域" : "Region"}</th>
                <th className="py-2 pr-3">{isZh ? "竞品品牌 / 系列" : "Brand / Series"}</th>
                <th className="py-2 pr-3">{isZh ? "周期" : "Period"}</th>
                <th className="py-2 pr-3">{isZh ? "标杆单片价" : "Per Piece"}</th>
                <th className="py-2 pr-3">{isZh ? "样本数" : "Samples"}</th>
                <th className="py-2 pr-3">{isZh ? "备注" : "Notes"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {visibleRows.map(({ rule, price }) => {
                return (
                  <tr key={`${rule.id}-${price?.id ?? "pending"}`}>
                    <td className="py-3 pr-3">
                      <Badge tone={price?.status === "carried_forward" ? "medium" : rule.active ? "low" : "neutral"}>
                        {statusLabel(rule.active, price?.status, isZh)}
                      </Badge>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="font-medium">{benchmarkRegionLabel(rule) || "-"}</div>
                    </td>
                    <td className="py-3 pr-3 font-medium">{benchmarkSeriesLabel(rule) || "-"}</td>
                    <td className="py-3 pr-3">
                      <div>{periodTypeLabel(price?.period_type ?? "week", isZh)}</div>
                      <div className="text-xs text-slate-500">{price ? formatBenchmarkPeriod(price) : (isZh ? "待生成" : "Pending")}</div>
                    </td>
                    <td className="py-3 pr-3 font-semibold">
                      {price ? formatPricePerPiece(price.benchmark_price_per_piece) : "-"}
                      {price ? <span className="ml-1 text-xs text-slate-500">{price.currency}</span> : null}
                    </td>
                    <td className="py-3 pr-3">{price?.sample_count ?? "-"}</td>
                    <td className="py-3 pr-3">{rule.notes ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}

function statusLabel(active: boolean, priceStatus: string | undefined, isZh: boolean) {
  if (!active) return isZh ? "停用" : "Inactive";
  if (priceStatus === "carried_forward") return isZh ? "沿用上一期" : "Carried forward";
  if (priceStatus === "calculated") return isZh ? "已计算" : "Calculated";
  return isZh ? "待采价" : "No price";
}

function seriesLabel(value: string, isZh: boolean) {
  return value === "__none__" ? (isZh ? "无系列" : "No series") : value;
}

function sameText(left: string | null | undefined, right: string | null | undefined) {
  return String(left ?? "").trim().toLowerCase() === String(right ?? "").trim().toLowerCase();
}

function periodTypeLabel(value: string, isZh: boolean) {
  if (value === "month") return isZh ? "自然月" : "Month";
  return isZh ? "自然周" : "Week";
}
