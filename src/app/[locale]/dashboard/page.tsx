import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button, Card, DataNotice, SelectInput, TextInput } from "@/components/ui";
import { getWeeklyPriceCoefficientBoard, type WeeklyPriceCoefficientFilters } from "@/lib/data";
import { formatPricePerPiece } from "@/lib/format";
import { getPageI18n } from "@/lib/i18n/server";
import type { WeeklyPriceCoefficientBoard } from "@/lib/types";

type DashboardSearchParams = {
  month?: string;
  ownSeries?: string;
  sku?: string;
  benchmarkRuleId?: string;
  region?: string;
};

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<DashboardSearchParams>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const query = await searchParams;
  const filters: WeeklyPriceCoefficientFilters = {
    month: query.month || undefined,
    ownSeries: query.ownSeries || undefined,
    sku: query.sku || undefined,
    benchmarkRuleId: query.benchmarkRuleId || undefined,
    region: query.region || undefined,
  };
  const result = await getWeeklyPriceCoefficientBoard(locale, filters);
  const board = result.data;
  const isZh = locale === "zh";

  return (
    <AppShell locale={locale} dict={dict} title={isZh ? "首页" : "Dashboard"} currentPath={`/dashboard${toQueryString(query)}`} isDemo={result.isDemo}>
      <DataNotice dict={dict} error={result.error} />
      <section className="mb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">{isZh ? "周度价格系数" : "Weekly Price Coefficient"}</div>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">{board.title}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {isZh ? "按自有系列和 SKU 查看各区域周均单片价，并对比标杆系列计算系数。" : "Compare weekly own SKU average price per piece against benchmark series by region."}
            </p>
          </div>
          <Link href={`/${locale}/market-benchmarks`} className="text-sm font-medium text-slate-700 hover:underline">
            {isZh ? "维护标杆规则" : "Maintain benchmark rules"}
          </Link>
        </div>
      </section>

      <Card>
        <WeeklyPriceCoefficientFilters board={board} isZh={isZh} />
        <WeeklyPriceCoefficientTable board={board} isZh={isZh} />
      </Card>
    </AppShell>
  );
}

function WeeklyPriceCoefficientFilters({ board, isZh }: { board: WeeklyPriceCoefficientBoard; isZh: boolean }) {
  return (
    <form className="mb-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      <TextInput name="month" type="month" defaultValue={board.month} />
      <SelectInput name="ownSeries" defaultValue={board.selectedOwnSeries ?? ""}>
        <option value="">{isZh ? "全部自有系列" : "All own series"}</option>
        {board.ownSeriesOptions.map((series) => <option key={series} value={series}>{series}</option>)}
      </SelectInput>
      <SelectInput name="sku" defaultValue={board.selectedSku ?? ""}>
        <option value="">{isZh ? "全部 SKU" : "All SKUs"}</option>
        {board.skuOptions.map((sku) => <option key={sku.code} value={sku.code}>{sku.code} {sku.name}</option>)}
      </SelectInput>
      <SelectInput name="benchmarkRuleId" defaultValue={board.selectedBenchmarkRuleId ?? ""}>
        <option value="">{isZh ? "默认标杆规则" : "Default benchmark"}</option>
        {board.benchmarkOptions.map((rule) => <option key={rule.id} value={rule.id}>{rule.label}</option>)}
      </SelectInput>
      <SelectInput name="region" defaultValue={board.selectedRegion ?? ""}>
        <option value="">{isZh ? "全部区域" : "All regions"}</option>
        {board.regionOptions.map((region) => <option key={region} value={region}>{region}</option>)}
      </SelectInput>
      <Button type="submit">{isZh ? "筛选" : "Filter"}</Button>
    </form>
  );
}

function WeeklyPriceCoefficientTable({ board, isZh }: { board: WeeklyPriceCoefficientBoard; isZh: boolean }) {
  const ownLabel = board.selectedOwnSeries ? `MAKUKU ${board.selectedOwnSeries}` : "MAKUKU";
  const benchmarkLabel = board.benchmarkLabel ?? (isZh ? "标杆系列" : "Benchmark");
  return (
    <div className="overflow-x-auto rounded-md border border-slate-900">
      <table className="w-full min-w-[1320px] border-collapse text-right text-sm">
        <thead className="bg-[#082d6f] text-white">
          <tr>
            <th colSpan={1 + board.weeks.length * 3} className="border border-slate-950 px-2 py-1 text-center text-sm font-semibold tracking-normal">
              {board.title}
            </th>
          </tr>
          <tr>
            <th rowSpan={2} className="w-44 border border-slate-950 px-2 py-2 text-center font-medium">REGION</th>
            <th colSpan={board.weeks.length} className="border border-slate-950 px-2 py-1 text-center font-medium">{ownLabel}</th>
            <th colSpan={board.weeks.length} className="border border-slate-950 px-2 py-1 text-center font-medium">{benchmarkLabel}</th>
            <th colSpan={board.weeks.length} className="border border-slate-950 px-2 py-1 text-center font-medium">{isZh ? "系数" : "COEFFICIENT"}</th>
          </tr>
          <tr>
            {board.weeks.map((week) => <th key={`own-${week.key}`} className="border border-slate-950 px-2 py-1 font-medium">PRICE/PCS {week.label}</th>)}
            {board.weeks.map((week) => <th key={`benchmark-${week.key}`} className="border border-slate-950 px-2 py-1 font-medium">PRICE/PCS {week.label}</th>)}
            {board.weeks.map((week) => <th key={`coefficient-${week.key}`} className="border border-slate-950 px-2 py-1 font-medium">{week.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {board.rows.map((row) => (
            <tr key={row.region} className={row.isNational ? "bg-[#082d6f] text-white" : "bg-white text-slate-900"}>
              <td className="border border-slate-700 px-2 py-1 text-left font-medium">{row.region}</td>
              {row.cells.map((cell) => (
                <PriceCell key={`own-${row.region}-${cell.week}`} href={cell.ownHref} value={cell.ownAvgPrice} sampleCount={cell.ownSampleCount} />
              ))}
              {row.cells.map((cell) => (
                <PriceCell key={`benchmark-${row.region}-${cell.week}`} href={cell.benchmarkHref} value={cell.benchmarkAvgPrice} sampleCount={cell.benchmarkSampleCount} />
              ))}
              {row.cells.map((cell) => (
                <td key={`coefficient-${row.region}-${cell.week}`} className="border border-slate-700 px-2 py-1 tabular-nums">
                  {formatCoefficient(cell.coefficient)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriceCell({ href, value, sampleCount }: { href: string; value: number | null; sampleCount: number }) {
  return (
    <td className="border border-slate-700 px-2 py-1 tabular-nums" title={`samples: ${sampleCount}`}>
      {value === null ? "-" : <Link href={href} className="hover:underline">{formatPricePerPiece(value)}</Link>}
    </td>
  );
}

function formatCoefficient(value: number | null) {
  return value === null ? "-" : value.toFixed(2);
}

function toQueryString(query: DashboardSearchParams) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}
