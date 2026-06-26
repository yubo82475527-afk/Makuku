import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PriceIndexTreeTable } from "@/components/price-index-tree-table";
import { periodLabelForDate } from "@/lib/periods";
import { QueryForm, QuerySubmitButton } from "@/components/query-form";
import { Badge, Card, DataNotice, EmptyState, SelectInput, TextInput } from "@/components/ui";
import {
  getAlerts,
  getOfflineStoreVisits,
  getProductSegmentBattles,
  getWeeklyPriceCoefficientBoard,
  type OfflineStoreVisitFilters,
  type ProductSegmentPriceIndexFilters,
  type WeeklyPriceCoefficientFilters,
} from "@/lib/data";
import { formatJakartaTime, formatPercent, formatPricePerPiece } from "@/lib/format";
import { getPageI18n } from "@/lib/i18n/server";
import type {
  Alert,
  OfflineStoreVisit,
  ProductSegmentBattle,
  ProductSegmentBattleSummary,
  WeeklyPriceCoefficientBoard,
} from "@/lib/types";

type DashboardSearchParams = {
  month?: string;
  ownSeries?: string;
  organization?: string;
  exceptionProvince?: string;
  exceptionCityName?: string;
  exceptionDistrict?: string;
  exceptionLine?: string;
  exceptionPriceBand?: string;
  exceptionSize?: string;
  exceptionStatus?: string;
  executionMonth?: string;
  executionWeek?: string;
  executionOrg?: string;
  executionUser?: string;
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
  const isZh = locale === "zh";

  const priceFilters: WeeklyPriceCoefficientFilters = {
    month: query.month || undefined,
    ownSeries: query.ownSeries || undefined,
    organization: query.organization || undefined,
  };

  const exceptionFilters: ProductSegmentPriceIndexFilters = {
    province: query.exceptionProvince || undefined,
    cityName: query.exceptionCityName || undefined,
    district: query.exceptionDistrict || undefined,
    line: query.exceptionLine || undefined,
    priceBand: query.exceptionPriceBand || undefined,
    size: query.exceptionSize || undefined,
    status: normalizeExceptionStatus(query.exceptionStatus),
    sort: "problemStoresDesc",
  };

  const executionFilters: OfflineStoreVisitFilters = {
    dateFrom: executionDateFrom(query.executionMonth),
    limit: 5000,
  };

  const [priceResult, exceptionResult, alertsResult, visitsResult] = await Promise.all([
    getWeeklyPriceCoefficientBoard(locale, priceFilters),
    getProductSegmentBattles(locale, exceptionFilters),
    getAlerts(),
    getOfflineStoreVisits(executionFilters),
  ]);

  const executionBoard = buildExecutionBoard({
    visits: visitsResult.data,
    month: query.executionMonth || undefined,
    week: query.executionWeek || undefined,
    organization: query.executionOrg || undefined,
    promoter: query.executionUser || undefined,
  });

  return (
    <AppShell
      locale={locale}
      dict={dict}
      title={isZh ? "首页" : "Dashboard"}
      currentPath={`/dashboard${toQueryString(query)}`}
      isDemo={priceResult.isDemo || exceptionResult.isDemo || alertsResult.isDemo || visitsResult.isDemo}
    >
      <DataNotice
        dict={dict}
        error={priceResult.error ?? exceptionResult.error ?? alertsResult.error ?? visitsResult.error}
      />

      <section className="space-y-6">
        <PriceIndexSection locale={locale} board={priceResult.data} isZh={isZh} />
        <ExceptionSection
          locale={locale}
          isZh={isZh}
          summary={exceptionResult.data.summary}
          battles={exceptionResult.data.battles}
          alerts={alertsResult.data}
          query={query}
        />
        <ExecutionSection isZh={isZh} board={executionBoard} query={query} />
      </section>
    </AppShell>
  );
}

function PriceIndexSection({
  locale,
  board,
  isZh,
}: {
  locale: string;
  board: WeeklyPriceCoefficientBoard;
  isZh: boolean;
}) {
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">
            {isZh ? "价格指数" : "Price Index"}
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">{board.title}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {isZh
              ? "按组织、省、市、区和 SKU 逐层展开，查看每周单片价格与系数。"
              : "Expand by organization, province, city, district, and SKU to review weekly price per piece and coefficient."}
          </p>
        </div>
        <Link href={`/${locale}/market-benchmarks`} className="text-sm font-medium text-slate-700 hover:underline">
          {isZh ? "维护标杆规则" : "Maintain benchmark rules"}
        </Link>
      </div>
      <WeeklyPriceCoefficientFilters board={board} isZh={isZh} />
      <PriceIndexTreeTable board={board} isZh={isZh} />
    </Card>
  );
}

function ExceptionSection({
  locale,
  isZh,
  summary,
  battles,
  alerts,
  query,
}: {
  locale: string;
  isZh: boolean;
  summary: ProductSegmentBattleSummary;
  battles: ProductSegmentBattle[];
  alerts: Alert[];
  query: DashboardSearchParams;
}) {
  const priceAlerts = alerts.filter((alert) => ["critical", "high"].includes(alert.severity)).slice(0, 6);
  const rows = flattenProblemStoreRows(battles, isZh);

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">
            {isZh ? "异常跟进" : "Exception Follow-up"}
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">
            {isZh ? "价格异常跟进" : "Price Exception Follow-up"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {isZh
              ? "优先跟进低指数分组、问题门店和高风险价格预警。"
              : "Prioritize low-index segments, problem stores, and high-risk price alerts."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm text-slate-600">
          <SummaryPill label={isZh ? "低指数分组" : "Low index groups"} value={summary.lowIndexSegmentCount} />
          <SummaryPill label={isZh ? "问题门店" : "Problem stores"} value={summary.problemStoreCount} />
          <SummaryPill label={isZh ? "缺失标杆" : "Missing benchmark"} value={summary.missingBenchmarkSegmentCount} />
        </div>
      </div>

      <ExceptionFilters locale={locale} isZh={isZh} query={query} />

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr),minmax(320px,1fr)]">
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-normal text-slate-500">
              <tr>
                <th className="px-3 py-2">{isZh ? "门店" : "Store"}</th>
                <th className="px-3 py-2">{isZh ? "区域" : "Region"}</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">{isZh ? "Makuku 标杆价" : "Makuku benchmark"}</th>
                <th className="px-3 py-2">{isZh ? "竞品最低价" : "Competitor lowest"}</th>
                <th className="px-3 py-2">{isZh ? "状态" : "Status"}</th>
                <th className="px-3 py-2">{isZh ? "最近证据" : "Latest evidence"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map((row, index) => (
                <tr key={`${row.storeName}-${row.skuName}-${index}`}>
                  <td className="px-3 py-3 font-medium text-slate-900">{row.storeName}</td>
                  <td className="px-3 py-3 text-slate-600">{row.region}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-slate-900">{row.skuName}</div>
                    <div className="text-xs text-slate-500">{row.segmentLabel}</div>
                  </td>
                  <td className="px-3 py-3 tabular-nums">{formatPricePerPiece(row.targetPricePerPiece)}</td>
                  <td className="px-3 py-3 tabular-nums">{formatPricePerPiece(row.competitorPricePerPiece)}</td>
                  <td className="px-3 py-3">
                    <Badge tone={row.statusTone}>{row.statusLabel}</Badge>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{row.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <EmptyState text={isZh ? "当前没有可跟进的价格异常。" : "No price exceptions to follow up."} />
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">
              {isZh ? "价格预警" : "Price Alerts"}
            </div>
            <div className="mt-3 space-y-3">
              {priceAlerts.map((alert) => (
                <div key={alert.id} className="rounded-md border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={alert.severity}>{alert.severity.toUpperCase()}</Badge>
                    <span className="text-xs text-slate-500">{formatJakartaTime(alert.created_at)}</span>
                  </div>
                  <div className="mt-2 text-sm font-medium text-slate-900">{alert.title}</div>
                  <div className="mt-1 text-sm text-slate-600">{alert.message}</div>
                </div>
              ))}
              {priceAlerts.length === 0 ? (
                <EmptyState text={isZh ? "暂无高风险价格预警。" : "No high-risk price alerts."} />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ExecutionSection({
  isZh,
  board,
  query,
}: {
  isZh: boolean;
  board: ExecutionBoard;
  query: DashboardSearchParams;
}) {
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">
            {isZh ? "执行" : "Execution"}
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">
            {isZh ? "导购执行" : "Promoter Execution"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {isZh
              ? "按月与周查看组织和导购的门店拜访达成情况。"
              : "Review promoter and organization visit execution by month and week."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm text-slate-600">
          <SummaryPill label={isZh ? "门店拜访" : "Store visits"} value={board.totalVisits} />
          <SummaryPill label={isZh ? "覆盖门店" : "Covered stores"} value={board.totalStores} />
          <SummaryPill label={isZh ? "达成率" : "Completion"} value={formatPercent(board.averageCompletionRate, 0)} />
        </div>
      </div>

      <ExecutionFilters isZh={isZh} query={query} board={board} />

      <div className="mt-4 overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-normal text-slate-500">
            <tr>
              <th className="px-3 py-2">{isZh ? "导购" : "Promoter"}</th>
              <th className="px-3 py-2">{isZh ? "所属组织" : "Organization"}</th>
              <th className="px-3 py-2">{isZh ? "周期" : "Week"}</th>
              <th className="px-3 py-2">{isZh ? "目标拜访数" : "Target visits"}</th>
              <th className="px-3 py-2">{isZh ? "实际拜访数" : "Actual visits"}</th>
              <th className="px-3 py-2">{isZh ? "达成率" : "Completion rate"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {board.rows.map((row) => (
              <tr key={`${row.promoter}-${row.organization}-${row.week}`}>
                <td className="px-3 py-3 font-medium text-slate-900">{row.promoter}</td>
                <td className="px-3 py-3 text-slate-600">{row.organization}</td>
                <td className="px-3 py-3">{row.week}</td>
                <td className="px-3 py-3 tabular-nums">{row.targetVisitCount}</td>
                <td className="px-3 py-3 tabular-nums">{row.actualVisitCount}</td>
                <td className="px-3 py-3 tabular-nums">{formatPercent(row.completionRate, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {board.rows.length === 0 ? (
          <EmptyState text={isZh ? "当前没有可展示的执行数据。" : "No execution data to display."} />
        ) : null}
      </div>
    </Card>
  );
}

function WeeklyPriceCoefficientFilters({
  board,
  isZh,
}: {
  board: WeeklyPriceCoefficientBoard;
  isZh: boolean;
}) {
  return (
    <QueryForm className="mb-4 grid gap-3 md:grid-cols-3 xl:grid-cols-4">
      <TextInput name="month" type="month" defaultValue={board.month} />
      <SelectInput name="organization" defaultValue={board.selectedOrganization ?? ""}>
        <option value="">{isZh ? "全部组织" : "All organizations"}</option>
        {board.organizationOptions.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </SelectInput>
      <SelectInput name="ownSeries" defaultValue={board.selectedOwnSeries ?? ""}>
        <option value="">{isZh ? "全部自有系列" : "All own series"}</option>
        {board.ownSeriesOptions.map((series) => (
          <option key={series} value={series}>
            {series}
          </option>
        ))}
      </SelectInput>
      <QuerySubmitButton idleLabel={isZh ? "查询" : "Filter"} pendingLabel={isZh ? "加载中..." : "Loading..."} />
    </QueryForm>
  );
}

function SummaryPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
      {label}: <span className="text-slate-950">{value}</span>
    </div>
  );
}

function ExceptionFilters({
  locale,
  isZh,
  query,
}: {
  locale: string;
  isZh: boolean;
  query: DashboardSearchParams;
}) {
  return (
    <QueryForm className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
      <TextInput name="exceptionProvince" placeholder={isZh ? "省" : "Province"} defaultValue={query.exceptionProvince ?? ""} />
      <TextInput name="exceptionCityName" placeholder={isZh ? "市" : "City"} defaultValue={query.exceptionCityName ?? ""} />
      <TextInput name="exceptionDistrict" placeholder={isZh ? "区" : "District"} defaultValue={query.exceptionDistrict ?? ""} />
      <TextInput name="exceptionLine" placeholder={isZh ? "产品线" : "Line"} defaultValue={query.exceptionLine ?? ""} />
      <TextInput name="exceptionSize" placeholder={isZh ? "尺码" : "Size"} defaultValue={query.exceptionSize ?? ""} />
      <SelectInput name="exceptionStatus" defaultValue={query.exceptionStatus ?? ""}>
        <option value="">{isZh ? "全部状态" : "All status"}</option>
        <option value="low_index">{isZh ? "低指数" : "Low index"}</option>
        <option value="near_index">{isZh ? "接近指数" : "Near index"}</option>
        <option value="missing_benchmark">{isZh ? "缺失标杆" : "Missing benchmark"}</option>
      </SelectInput>
      <div className="flex gap-2">
        <QuerySubmitButton idleLabel={isZh ? "查询" : "Filter"} pendingLabel={isZh ? "加载中..." : "Loading..."} />
        <Link
          href={`/${locale}/prices`}
          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {isZh ? "查看价格明细" : "Open prices"}
        </Link>
      </div>
    </QueryForm>
  );
}

function ExecutionFilters({
  isZh,
  query,
  board,
}: {
  isZh: boolean;
  query: DashboardSearchParams;
  board: ExecutionBoard;
}) {
  return (
    <QueryForm className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
      <TextInput name="executionMonth" type="month" defaultValue={board.selectedMonth} />
      <SelectInput name="executionWeek" defaultValue={query.executionWeek ?? ""}>
        <option value="">{isZh ? "全部周次" : "All weeks"}</option>
        {board.availableWeeks.map((week) => (
          <option key={week} value={week}>
            {week}
          </option>
        ))}
      </SelectInput>
      <SelectInput name="executionOrg" defaultValue={query.executionOrg ?? ""}>
        <option value="">{isZh ? "全部组织" : "All organizations"}</option>
        {board.organizationOptions.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </SelectInput>
      <SelectInput name="executionUser" defaultValue={query.executionUser ?? ""}>
        <option value="">{isZh ? "全部导购" : "All promoters"}</option>
        {board.promoterOptions.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </SelectInput>
      <QuerySubmitButton idleLabel={isZh ? "查询" : "Filter"} pendingLabel={isZh ? "加载中..." : "Loading..."} />
    </QueryForm>
  );
}

type ProblemStoreRow = {
  storeName: string;
  region: string;
  skuName: string;
  segmentLabel: string;
  targetPricePerPiece: number | null;
  competitorPricePerPiece: number | null;
  statusLabel: string;
  statusTone: "low" | "medium" | "high" | "critical";
  evidence: string;
};

function flattenProblemStoreRows(battles: ProductSegmentBattle[], isZh: boolean): ProblemStoreRow[] {
  return battles
    .filter((battle) => battle.worstProblemStore)
    .map((battle) => {
      const store = battle.worstProblemStore;
      const statusTone =
        battle.floorGapPct !== null && battle.floorGapPct < 0
          ? "critical"
          : battle.priceIndex !== null && battle.priceIndex < 95
            ? "high"
            : battle.benchmarkPricePerPiece === null
              ? "medium"
              : "low";

      const statusLabel =
        battle.floorGapPct !== null && battle.floorGapPct < 0
          ? isZh ? "价格低于底线" : "Below floor"
          : battle.priceIndex !== null && battle.priceIndex < 95
            ? isZh ? "价格指数偏低" : "Low index"
            : battle.benchmarkPricePerPiece === null
              ? isZh ? "缺失标杆" : "Missing benchmark"
              : isZh ? "待跟进" : "Follow up";

      return {
        storeName: store?.name ?? "Unknown Store",
        region: formatExecutionRegionLabel({
          province: store?.province ?? null,
          cityName: store?.cityName ?? null,
          district: store?.district ?? null,
        }) ?? "-",
        skuName: battle.makukuSkuNames[0] ?? battle.label,
        segmentLabel: `${battle.line} / ${battle.size} / ${battle.priceBand}`,
        targetPricePerPiece: battle.targetPriceMin,
        competitorPricePerPiece: store?.pricePerPiece ?? battle.lowestCompetitorPricePerPiece,
        statusLabel,
        statusTone,
        evidence: store?.evidence ?? "-",
      } satisfies ProblemStoreRow;
    })
    .slice(0, 12);
}

type ExecutionBoardRow = {
  promoter: string;
  organization: string;
  week: string;
  targetVisitCount: number;
  actualVisitCount: number;
  completionRate: number;
};

type ExecutionBoard = {
  selectedMonth: string;
  availableWeeks: string[];
  organizationOptions: string[];
  promoterOptions: string[];
  rows: ExecutionBoardRow[];
  totalVisits: number;
  totalStores: number;
  averageCompletionRate: number;
};

function buildExecutionBoard(input: {
  visits: OfflineStoreVisit[];
  month?: string;
  week?: string;
  organization?: string;
  promoter?: string;
}): ExecutionBoard {
  const selectedMonth = normalizeMonth(input.month);
  const filteredMonthVisits = input.visits.filter((visit) => (visit.visit_date || "").startsWith(selectedMonth));
  const normalizedOrganizations = filteredMonthVisits.map((visit) => normalizeExecutionOrganization(visit.region));
  const normalizedPromoters = filteredMonthVisits.map((visit) => cleanText(visit.promoter ?? visit.uploader_name));

  const weekKeys = Array.from(
    new Set(filteredMonthVisits.map((visit) => visitWeekKey(visit.visit_date)).filter(Boolean) as string[]),
  ).sort();
  const organizationOptions = Array.from(new Set(normalizedOrganizations.filter(Boolean) as string[])).sort();
  const promoterOptions = Array.from(new Set(normalizedPromoters.filter(Boolean) as string[])).sort();

  const scopedVisits = filteredMonthVisits.filter((visit) => {
    if (input.week && visitWeekKey(visit.visit_date) !== input.week) return false;
    if (input.organization && normalizeExecutionOrganization(visit.region) !== input.organization) return false;
    if (input.promoter && cleanText(visit.promoter ?? visit.uploader_name) !== input.promoter) return false;
    return true;
  });

  const grouped = new Map<string, ExecutionBoardRow>();
  for (const visit of scopedVisits) {
    const promoter = cleanText(visit.promoter ?? visit.uploader_name) ?? "Unknown";
    const organization = normalizeExecutionOrganization(visit.region) ?? "Unassigned";
    const week = visitWeekKey(visit.visit_date) ?? "W?";
    const key = `${promoter}|${organization}|${week}`;
    const current = grouped.get(key) ?? {
      promoter,
      organization,
      week,
      targetVisitCount: 8,
      actualVisitCount: 0,
      completionRate: 0,
    };
    current.actualVisitCount += 1;
    current.completionRate = Math.min(100, (current.actualVisitCount / current.targetVisitCount) * 100);
    grouped.set(key, current);
  }

  const rows = Array.from(grouped.values()).sort(
    (a, b) => {
      const unassignedA = a.organization === "Unassigned" ? 1 : 0;
      const unassignedB = b.organization === "Unassigned" ? 1 : 0;
      return unassignedA - unassignedB || b.completionRate - a.completionRate || a.promoter.localeCompare(b.promoter);
    },
  );
  const totalStores = new Set(scopedVisits.map((visit) => cleanText(visit.store_name)).filter(Boolean) as string[]).size;
  const averageCompletionRate = rows.length > 0
    ? rows.reduce((sum, row) => sum + row.completionRate, 0) / rows.length
    : 0;

  return {
    selectedMonth,
    availableWeeks: weekKeys,
    organizationOptions,
    promoterOptions,
    rows,
    totalVisits: scopedVisits.length,
    totalStores,
    averageCompletionRate,
  };
}

function visitWeekKey(value: string | null | undefined) {
  return periodLabelForDate(value);
}

function normalizeMonth(value: string | undefined) {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}$/.test(text) ? text : new Date().toISOString().slice(0, 7);
}

function normalizeExceptionStatus(value: string | undefined): ProductSegmentPriceIndexFilters["status"] | undefined {
  if (value === "low_index" || value === "near_index" || value === "missing_benchmark" || value === "all") {
    return value;
  }
  return undefined;
}

function executionDateFrom(month: string | undefined) {
  const normalized = normalizeMonth(month);
  return `${normalized}-01`;
}

function cleanText(value: string | null | undefined) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || null;
}

function normalizeExecutionOrganization(value: string | null | undefined) {
  const text = cleanText(value);
  if (!text) return null;
  if (/^\d+$/.test(text)) return null;
  return formatLooseRegionText(text);
}

function formatExecutionRegionLabel(region: {
  province?: string | null;
  cityName?: string | null;
  district?: string | null;
}) {
  const parts = [region.province, region.cityName, region.district]
    .map(formatLooseRegionText)
    .filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(" / ") : null;
}

function formatLooseRegionText(value: string | null | undefined) {
  const text = cleanText(value);
  if (!text) return null;
  const lower = text.toLowerCase();
  if (text.includes("上海") || lower.includes("shanghai") || lower.includes("shang hai")) return "Shanghai";
  if (lower === "qingpu district" || text === "青浦区") return "Qingpu District";
  if (lower === "daerah khusus ibukota jakarta") return "Jakarta";
  if (/^[A-Z\s]+$/.test(text)) {
    return text
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
  return text;
}

function toQueryString(query: DashboardSearchParams) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}
