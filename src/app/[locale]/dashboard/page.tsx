import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, Card, DataNotice, MetricCard, SelectInput } from "@/components/ui";
import { formatJakartaTime, formatPricePerPiece } from "@/lib/format";
import { getProductSegmentPriceIndexBattles, type ProductSegmentPriceIndexFilters } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import type { ProductSegmentBattle } from "@/lib/types";

type DashboardSearchParams = {
  province?: string;
  cityName?: string;
  district?: string;
  line?: string;
  priceBand?: string;
  size?: string;
  status?: ProductSegmentPriceIndexFilters["status"];
  sort?: ProductSegmentPriceIndexFilters["sort"];
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
  const filters: ProductSegmentPriceIndexFilters = {
    province: query.province || undefined,
    cityName: query.cityName || undefined,
    district: query.district || undefined,
    line: query.line || undefined,
    priceBand: query.priceBand || undefined,
    size: query.size || undefined,
    status: normalizeStatus(query.status),
    sort: normalizeSort(query.sort),
  };
  const result = await getProductSegmentPriceIndexBattles(locale, filters);
  const { summary, battles } = result.data;
  const isZh = locale === "zh";
  const currentPath = `/dashboard${toQueryString(query)}`;

  return (
    <AppShell locale={locale} dict={dict} title={isZh ? "仪表盘" : "Dashboard"} currentPath={currentPath} isDemo={result.isDemo}>
      <DataNotice dict={dict} error={result.error} />

      <section className="mb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-normal text-emerald-700">
              {isZh ? "首页主问题" : "Dashboard question"}
            </div>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">
              {isZh ? "产品段价格指数战况" : "Product Segment Price Index"}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              {isZh
                ? "主轴仍是产品段，但每行必须告诉你问题门店数、最严重门店、还有哪些门店同样异常。"
                : "Keep the product segment as the main axis, while exposing problem stores and evidence for execution."}
            </p>
          </div>
          <Link href={`/${locale}/market-benchmarks`} className="text-sm font-medium text-slate-700 hover:underline">
            {isZh ? "维护市场标杆" : "Maintain benchmarks"}
          </Link>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={isZh ? "指数低于 95" : "Index below 95"} value={summary.lowIndexSegmentCount} hint={isZh ? `涉及 ${summary.problemStoreCount} 家问题门店` : `${summary.problemStoreCount} problem stores`} />
        <MetricCard label={isZh ? "问题门店" : "Problem Stores"} value={summary.problemStoreCount} hint={isZh ? "低价 / 待复核 / 缺标杆信号" : "Low price, pending review, or benchmark gaps"} />
        <MetricCard label={isZh ? "无市场标杆" : "Missing Benchmarks"} value={summary.missingBenchmarkSegmentCount} hint={isZh ? "缺标杆则无法计算指数" : "Index cannot be calculated without a benchmark"} />
        <MetricCard label={isZh ? "价格证据" : "Price Evidence"} value={summary.evidenceCount} hint={isZh ? "SKU价格快照 + 照片复核" : "Snapshots plus photo review"} />
      </div>

      <ProductSegmentPriceIndexBoard battles={battles} query={query} locale={locale} isZh={isZh} />
    </AppShell>
  );
}

function ProductSegmentPriceIndexBoard({
  battles,
  query,
  locale,
  isZh,
}: {
  battles: ProductSegmentBattle[];
  query: DashboardSearchParams;
  locale: string;
  isZh: boolean;
}) {
  const options = buildFilterOptions(battles, query);
  return (
    <Card className="mt-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{isZh ? "产品段价格指数战况" : "Product Segment Price Index Board"}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {isZh ? "按省/市/区、产品线、商品等级、尺码聚合；点击看门店进入对应价格证据。" : "Filter by region, line, product grade, and size; drill into stores and price evidence."}
          </p>
        </div>
        <div className="text-sm text-slate-500">{isZh ? "默认：价格指数从低到高" : "Default: lowest index first"}</div>
      </div>

      <form className="mb-4 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
        <FilterSelect name="province" value={query.province} label={isZh ? "全部省/州" : "All provinces"} values={options.provinces} />
        <FilterSelect name="cityName" value={query.cityName} label={isZh ? "全部城市" : "All cities"} values={options.cityNames} />
        <FilterSelect name="district" value={query.district} label={isZh ? "全部区/县" : "All districts"} values={options.districts} />
        <FilterSelect name="line" value={query.line} label={isZh ? "全部产品线" : "All lines"} values={options.lines} />
        <FilterSelect name="priceBand" value={query.priceBand} label={isZh ? "全部商品等级" : "All grades"} values={options.priceBands} />
        <FilterSelect name="size" value={query.size} label={isZh ? "全部尺码" : "All sizes"} values={options.sizes} />
        <SelectInput name="sort" defaultValue={query.sort ?? "priceIndexAsc"}>
          <option value="priceIndexAsc">{isZh ? "价格指数：从低到高" : "Index: low to high"}</option>
          <option value="priceIndexDesc">{isZh ? "价格指数：从高到低" : "Index: high to low"}</option>
          <option value="problemStoresDesc">{isZh ? "问题门店：从多到少" : "Problem stores: high to low"}</option>
          <option value="latest">{isZh ? "最近采集优先" : "Latest first"}</option>
        </SelectInput>
        <Button type="submit">{isZh ? "筛选" : "Filter"}</Button>
      </form>

      <div className="mb-4 flex flex-wrap gap-2">
        <StatusLink locale={locale} query={query} status="all" active={!query.status || query.status === "all"} label={isZh ? `全部产品段 ${battles.length}` : `All ${battles.length}`} />
        <StatusLink locale={locale} query={query} status="low_index" active={query.status === "low_index"} label={isZh ? "低于标杆" : "Below benchmark"} />
        <StatusLink locale={locale} query={query} status="missing_benchmark" active={query.status === "missing_benchmark"} label={isZh ? "缺标杆" : "Missing benchmark"} />
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full min-w-[1260px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 pl-3 pr-3">{isZh ? "状态" : "Status"}</th>
              <th className="py-2 pr-3">{isZh ? "省/市/区" : "Region"}</th>
              <th className="py-2 pr-3">{isZh ? "产品段" : "Segment"}</th>
              <th className="py-2 pr-3">{isZh ? "Makuku 单片价" : "Makuku Per Piece"}</th>
              <th className="py-2 pr-3">{isZh ? "市场标杆" : "Benchmark"}</th>
              <th className="py-2 pr-3">{isZh ? "价格指数" : "Price Index"}</th>
              <th className="py-2 pr-3">{isZh ? "问题门店" : "Problem Stores"}</th>
              <th className="py-2 pr-3">{isZh ? "最严重门店" : "Worst Store"}</th>
              <th className="py-2 pr-3">{isZh ? "竞品最低" : "Competitor Low"}</th>
              <th className="py-2 pr-3">{isZh ? "证据" : "Evidence"}</th>
              <th className="py-2 pr-3">{isZh ? "最近采集" : "Latest"}</th>
              <th className="py-2 pr-3">{isZh ? "下钻" : "Drilldown"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {battles.map((battle) => (
              <ProductSegmentPriceIndexRow key={battle.id} battle={battle} isZh={isZh} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ProductSegmentPriceIndexRow({ battle, isZh }: { battle: ProductSegmentBattle; isZh: boolean }) {
  const status = battle.benchmarkPricePerPiece === null
    ? { label: isZh ? "缺标杆" : "Missing", tone: "medium" }
    : battle.priceIndex !== null && battle.priceIndex < 95
      ? { label: isZh ? "低于95" : "Below 95", tone: "critical" }
      : battle.priceIndex !== null && battle.priceIndex <= 105
        ? { label: "95-105", tone: "high" }
        : { label: isZh ? "健康" : "Healthy", tone: "low" };
  return (
    <tr className="align-top hover:bg-slate-50">
      <td className="py-3 pl-3 pr-3"><Badge tone={status.tone}>{status.label}</Badge></td>
      <td className="py-3 pr-3">
        <div className="font-medium">{battle.province ?? "-"}</div>
        <div className="text-xs text-slate-500">{[battle.cityName, battle.district].filter(Boolean).join(" / ") || "-"}</div>
      </td>
      <td className="py-3 pr-3">
        <div className="font-semibold">{battle.line} / {battle.priceBand} / {battle.size}</div>
        <div className="text-xs text-slate-500">{battle.makukuSkuNames.slice(0, 2).join(" / ") || "-"}</div>
      </td>
      <td className="py-3 pr-3">
        <div className="font-semibold">{formatPriceBand(battle)}</div>
        <div className="text-xs text-slate-500">Target / Floor</div>
      </td>
      <td className="py-3 pr-3">
        <div className="font-medium">{battle.benchmarkSkuName ?? "-"}</div>
        <div className="text-xs text-slate-500">{formatPricePerPiece(battle.benchmarkPricePerPiece)}</div>
      </td>
      <td className="py-3 pr-3 text-lg font-bold">{formatIndex(battle.priceIndex)}</td>
      <td className="py-3 pr-3">
        <div className={battle.problemStoreCount > 0 ? "font-semibold text-red-700" : "font-semibold"}>{battle.problemStoreCount} {isZh ? "家" : "stores"}</div>
        <div className="text-xs text-slate-500">{battle.pendingEvidenceCount} {isZh ? "待复核" : "pending"}</div>
      </td>
      <td className="max-w-[220px] py-3 pr-3">
        {battle.worstProblemStore ? (
          <>
            <div className="font-semibold">{battle.worstProblemStore.name}</div>
            <div className="text-xs leading-5 text-slate-500">{battle.worstProblemStore.evidence}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {battle.worstProblemStore.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
            </div>
          </>
        ) : "-"}
      </td>
      <td className="py-3 pr-3">
        <div className="font-medium">{battle.strongestCompetitorBrand ?? "-"}</div>
        <div className="text-xs text-slate-500">{formatPricePerPiece(battle.lowestCompetitorPricePerPiece)}</div>
      </td>
      <td className="py-3 pr-3">
        <div className="font-semibold">{battle.evidenceCount}</div>
        <div className="text-xs text-slate-500">{battle.pendingEvidenceCount} {isZh ? "待复核" : "pending"}</div>
      </td>
      <td className="py-3 pr-3">{formatJakartaTime(battle.latestCapturedAt)}</td>
      <td className="py-3 pr-3"><Link href={battle.href} className="font-medium text-blue-700 hover:underline">{battle.benchmarkPricePerPiece === null ? (isZh ? "补标杆" : "Add benchmark") : battle.problemStoreCount > 0 ? (isZh ? "看门店" : "Stores") : (isZh ? "看明细" : "Details")}</Link></td>
    </tr>
  );
}

function FilterSelect({ name, value, label, values }: { name: string; value?: string; label: string; values: string[] }) {
  return (
    <SelectInput name={name} defaultValue={value ?? ""}>
      <option value="">{label}</option>
      {values.map((item) => <option key={item} value={item}>{item}</option>)}
    </SelectInput>
  );
}

function StatusLink({ locale, query, status, active, label }: { locale: string; query: DashboardSearchParams; status: ProductSegmentPriceIndexFilters["status"]; active: boolean; label: string }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value && key !== "status") params.set(key, value);
  }
  if (status && status !== "all") params.set("status", status);
  const href = `/${locale}/dashboard${params.toString() ? `?${params.toString()}` : ""}`;
  return (
    <Link href={href} className={active ? "inline-flex h-8 items-center rounded-full bg-slate-900 px-3 text-xs font-medium text-white" : "inline-flex h-8 items-center rounded-full border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"}>
      {label}
    </Link>
  );
}

function buildFilterOptions(battles: ProductSegmentBattle[], query: DashboardSearchParams) {
  return {
    provinces: unique([...battles.map((battle) => battle.province), query.province]),
    cityNames: unique([...battles.map((battle) => battle.cityName), query.cityName]),
    districts: unique([...battles.map((battle) => battle.district), query.district]),
    lines: unique([...battles.map((battle) => battle.line), query.line]),
    priceBands: unique([...battles.map((battle) => battle.priceBand), query.priceBand]),
    sizes: unique([...battles.map((battle) => battle.size), query.size]),
  };
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();
}

function normalizeStatus(value: string | undefined): ProductSegmentPriceIndexFilters["status"] {
  if (value === "low_index" || value === "near_index" || value === "missing_benchmark" || value === "all") return value;
  return undefined;
}

function normalizeSort(value: string | undefined): ProductSegmentPriceIndexFilters["sort"] {
  if (value === "priceIndexAsc" || value === "priceIndexDesc" || value === "problemStoresDesc" || value === "latest") return value;
  return "priceIndexAsc";
}

function toQueryString(query: DashboardSearchParams) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function formatPriceBand(battle: ProductSegmentBattle) {
  const target = formatRange(battle.targetPriceMin, battle.targetPriceMax);
  const floor = formatRange(battle.floorPriceMin, battle.floorPriceMax);
  return `${target} / ${floor}`;
}

function formatRange(min: number | null, max: number | null) {
  if (min === null && max === null) return "-";
  if (min === max || max === null) return formatPricePerPiece(min);
  if (min === null) return formatPricePerPiece(max);
  return `${formatPricePerPiece(min)}-${formatPricePerPiece(max)}`;
}

function formatIndex(value: number | null) {
  if (value === null) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
