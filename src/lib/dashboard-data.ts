import {
  getAlerts,
  getOfflineStoreVisits,
  getProductSegmentBattles,
  getWeeklyPriceCoefficientBoard,
  type OfflineStoreVisitFilters,
  type ProductSegmentPriceIndexFilters,
  type WeeklyPriceCoefficientFilters,
} from "@/lib/data";
import { periodLabelForDate } from "@/lib/periods";
import type {
  Alert,
  OfflineStoreVisit,
  ProductSegmentBattle,
  ProductSegmentBattleSummary,
  WeeklyPriceCoefficientBoard,
} from "@/lib/types";

export type DashboardSearchParams = {
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

export type ExecutionBoardRow = {
  promoter: string;
  organization: string;
  week: string;
  targetVisitCount: number;
  actualVisitCount: number;
  completionRate: number;
};

export type ExecutionBoard = {
  selectedMonth: string;
  availableWeeks: string[];
  organizationOptions: string[];
  promoterOptions: string[];
  rows: ExecutionBoardRow[];
  totalVisits: number;
  totalStores: number;
  averageCompletionRate: number;
};

export type DashboardData = {
  priceBoard: WeeklyPriceCoefficientBoard;
  exceptionSummary: ProductSegmentBattleSummary;
  battles: ProductSegmentBattle[];
  alerts: Alert[];
  executionBoard: ExecutionBoard;
};

export type DashboardPayload = {
  data: DashboardData;
  error: string | null;
  isDemo: boolean;
};

export type DashboardPricePayload = {
  data: Pick<DashboardData, "priceBoard">;
  error: string | null;
  isDemo: boolean;
};

export type DashboardExceptionPayload = {
  data: Pick<DashboardData, "exceptionSummary" | "battles" | "alerts">;
  error: string | null;
  isDemo: boolean;
};

export type DashboardExecutionPayload = {
  data: Pick<DashboardData, "executionBoard">;
  error: string | null;
  isDemo: boolean;
};

export async function getDashboardData(
  locale: string,
  query: DashboardSearchParams,
): Promise<DashboardPayload> {
  const [priceResult, exceptionResult, executionResult] = await Promise.all([
    getDashboardPriceData(locale, query),
    getDashboardExceptionData(locale, query),
    getDashboardExecutionData(query),
  ]);

  return {
    data: {
      priceBoard: priceResult.data.priceBoard,
      exceptionSummary: exceptionResult.data.exceptionSummary,
      battles: exceptionResult.data.battles,
      alerts: exceptionResult.data.alerts,
      executionBoard: executionResult.data.executionBoard,
    },
    error: priceResult.error ?? exceptionResult.error ?? executionResult.error,
    isDemo: priceResult.isDemo || exceptionResult.isDemo || executionResult.isDemo,
  };
}

export async function getDashboardPriceData(
  locale: string,
  query: DashboardSearchParams,
): Promise<DashboardPricePayload> {
  const priceFilters: WeeklyPriceCoefficientFilters = {
    month: query.month || undefined,
    ownSeries: query.ownSeries || undefined,
    organization: query.organization || undefined,
  };

  const priceResult = await getWeeklyPriceCoefficientBoard(locale, priceFilters);
  return {
    data: { priceBoard: priceResult.data },
    error: priceResult.error,
    isDemo: priceResult.isDemo,
  };
}

export async function getDashboardExceptionData(
  locale: string,
  query: DashboardSearchParams,
): Promise<DashboardExceptionPayload> {
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

  const [exceptionResult, alertsResult] = await Promise.all([
    getProductSegmentBattles(locale, exceptionFilters),
    getAlerts(),
  ]);

  return {
    data: {
      exceptionSummary: exceptionResult.data.summary,
      battles: exceptionResult.data.battles,
      alerts: alertsResult.data,
    },
    error: exceptionResult.error ?? alertsResult.error,
    isDemo: exceptionResult.isDemo || alertsResult.isDemo,
  };
}

export async function getDashboardExecutionData(
  query: DashboardSearchParams,
): Promise<DashboardExecutionPayload> {
  const executionFilters: OfflineStoreVisitFilters = {
    dateFrom: executionDateFrom(query.executionMonth),
    limit: 500,
    includeImageUrls: false,
  };

  const visitsResult = await getOfflineStoreVisits(executionFilters);

  return {
    data: {
      executionBoard: buildExecutionBoard({
        visits: visitsResult.data,
        month: query.executionMonth || undefined,
        week: query.executionWeek || undefined,
        organization: query.executionOrg || undefined,
        promoter: query.executionUser || undefined,
      }),
    },
    error: visitsResult.error,
    isDemo: visitsResult.isDemo,
  };
}

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

  const rows = Array.from(grouped.values()).sort((a, b) => {
    const unassignedA = a.organization === "Unassigned" ? 1 : 0;
    const unassignedB = b.organization === "Unassigned" ? 1 : 0;
    return unassignedA - unassignedB || b.completionRate - a.completionRate || a.promoter.localeCompare(b.promoter);
  });
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

function formatLooseRegionText(value: string | null | undefined) {
  const text = cleanText(value);
  if (!text) return null;
  const lower = text.toLowerCase();
  if (text.includes("涓婃捣") || lower.includes("shanghai") || lower.includes("shang hai")) return "Shanghai";
  if (lower === "qingpu district" || text === "青浦区") return "Qingpu District";
  if (lower === "daerah khusus ibukota jakarta") return "Jakarta";
  if (/^[A-Z\s]+$/.test(text)) {
    return text
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
  return text;
}
