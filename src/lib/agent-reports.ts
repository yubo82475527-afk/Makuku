import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "./supabase.ts";
import { demoOfflineStoreVisits, demoPriceSnapshots } from "./demo-data.ts";
import {
  getAgentReportDefinition,
  legacyReportTypeToDefinitionCode,
  listEnabledAgentReportDefinitions,
} from "./agent-report-definitions.ts";
import { resolveLatestPeriodAnchor } from "./agent-report-periods.ts";
import type {
  AgentReport,
  AgentReportDefinition,
  AgentReportContentJson,
  AgentReportDeliverySummary,
  AgentReportFamily,
  AgentReportMetricRow,
  AgentReportMetricSummary,
  AgentReportMetricsJson,
  AgentReportPeriod,
  AgentReportRecipient,
  AgentReportScopeType,
  AgentReportType,
} from "./types.ts";

const JAKARTA_TIMEZONE = "Asia/Jakarta";
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

type QueryResult<T> = {
  data: T;
  error: string | null;
  isDemo: boolean;
};

type VisitScopeRow = {
  id: string;
  store_id?: string | null;
  store_name?: string | null;
  province?: string | null;
  city_name?: string | null;
  district?: string | null;
  city?: string | null;
  channel_type?: string | null;
  uploader_user_id?: string | null;
  user_id?: string | null;
  promoter?: string | null;
  uploader_name?: string | null;
  visit_date?: string | null;
  offline_stores?: {
    id?: string | null;
    organization_id?: string | null;
    name?: string | null;
  } | null;
};

type SnapshotScopeRow = {
  id: string;
  competitor_product_id?: string | null;
  sku_master_id?: string | null;
  material_sku_code?: string | null;
  captured_at?: string | null;
  source_visit_id?: string | null;
  offline_store_id?: string | null;
  offline_store_visits?: VisitScopeRow | null;
  offline_stores?: {
    id?: string | null;
    organization_id?: string | null;
    name?: string | null;
  } | null;
};

type BuildAgentReportSnapshotInput = {
  definition: AgentReportDefinition;
  period: AgentReportPeriod;
  scopeType: AgentReportScopeType;
  scopeId: string | null;
  scopeName: string;
  visits: VisitScopeRow[];
  snapshots: SnapshotScopeRow[];
  previousMetrics: AgentReportMetricSummary | null;
};

type GenerateAgentReportInput = {
  reportDefinitionCode?: string;
  reportType?: AgentReportType;
  periodAnchor: string;
  scopeType: AgentReportScopeType;
  scopeId: string | null;
  force?: boolean;
};

type AgentReportFilters = {
  reportDefinitionCode?: string;
  reportFamily?: AgentReportFamily;
  reportType?: AgentReportType;
  scopeType?: AgentReportScopeType;
  scopeId?: string | null;
  status?: "draft" | "generated" | "sent" | "failed";
  periodStart?: string;
  limit?: number;
};

async function listDemoAgentReports(filters: AgentReportFilters = {}): Promise<AgentReport[]> {
  const enabledDefinitions = listEnabledAgentReportDefinitions();
  const reports = await Promise.all(enabledDefinitions.map(async (definition) => {
    const scopeType = definition.supported_scope_types[0] ?? "global";
    const scopeId = scopeType === "global" ? null : ZERO_UUID;
    const result = await generateAgentReport({
      reportDefinitionCode: definition.code,
      periodAnchor: filters.periodStart ?? resolveLatestPeriodAnchor(definition.code),
      scopeType,
      scopeId,
      force: true,
    });
    return result.data;
  }));

  return reports
    .filter((report) => !filters.reportDefinitionCode || report.report_definition_code === filters.reportDefinitionCode)
    .filter((report) => !filters.reportFamily || report.report_family === filters.reportFamily)
    .filter((report) => !filters.reportType || report.report_family === filters.reportType)
    .filter((report) => !filters.scopeType || report.scope_type === filters.scopeType)
    .filter((report) => filters.scopeId === undefined || report.scope_id === filters.scopeId)
    .filter((report) => !filters.status || report.status === filters.status)
    .sort((left, right) => `${right.period_end}:${right.generated_at}`.localeCompare(`${left.period_end}:${left.generated_at}`))
    .slice(0, filters.limit ?? 50);
}

function cleanText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateInTimezone(value: string | Date, timezone: string) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function compareDateKey(value: string, startDate: string, endDate: string) {
  return value >= startDate && value <= endDate;
}

function startOfWeekMonday(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + offset);
  return copy;
}

function endOfWeekSunday(date: Date) {
  const copy = startOfWeekMonday(date);
  copy.setDate(copy.getDate() + 6);
  return copy;
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function previousPeriod(current: AgentReportPeriod) {
  const start = parseDate(current.startDate);
  const definition = getAgentReportDefinition(current.reportDefinitionCode);
  if (current.reportFamily === "daily") {
    start.setDate(start.getDate() - 1);
    return resolveReportPeriod(definition, dateKey(start));
  }
  if (current.reportFamily === "weekly") {
    start.setDate(start.getDate() - 7);
    return resolveReportPeriod(definition, dateKey(start));
  }
  start.setMonth(start.getMonth() - 1);
  return resolveReportPeriod(definition, dateKey(start));
}

function coerceDefinition(input: AgentReportDefinition | string) {
  return typeof input === "string" ? getAgentReportDefinition(input) : input;
}

export function resolveReportPeriod(definitionInput: AgentReportDefinition | string, periodAnchor: string): AgentReportPeriod {
  const definition = coerceDefinition(definitionInput);
  const anchorDate = parseDate(periodAnchor);
  if (definition.family === "daily") {
    return {
      reportFamily: definition.family,
      reportDefinitionCode: definition.code,
      anchor: periodAnchor,
      startDate: periodAnchor,
      endDate: periodAnchor,
      label: periodAnchor,
      timezone: JAKARTA_TIMEZONE,
    };
  }
  if (definition.family === "weekly") {
    const startDate = dateKey(startOfWeekMonday(anchorDate));
    const endDate = dateKey(endOfWeekSunday(anchorDate));
    return {
      reportFamily: definition.family,
      reportDefinitionCode: definition.code,
      anchor: periodAnchor,
      startDate,
      endDate,
      label: `${startDate} to ${endDate}`,
      timezone: JAKARTA_TIMEZONE,
    };
  }
  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const monthEnd = endOfMonth(anchorDate);
  return {
    reportFamily: definition.family,
    reportDefinitionCode: definition.code,
    anchor: periodAnchor,
    startDate: dateKey(monthStart),
    endDate: dateKey(monthEnd),
    label: periodAnchor.slice(0, 7),
    timezone: JAKARTA_TIMEZONE,
  };
}

function visitStoreKey(visit: VisitScopeRow) {
  if (cleanText(visit.store_id)) return `store:${cleanText(visit.store_id)}`;
  return [
    cleanText(visit.store_name)?.toLowerCase() ?? "",
    cleanText(visit.province)?.toLowerCase() ?? "",
    cleanText(visit.city_name)?.toLowerCase() ?? cleanText(visit.city)?.toLowerCase() ?? "",
    cleanText(visit.district)?.toLowerCase() ?? "",
    cleanText(visit.channel_type)?.toLowerCase() ?? "",
  ].join("|");
}

function visitEmployeeKey(visit: VisitScopeRow) {
  if (cleanText(visit.uploader_user_id)) return `user:${cleanText(visit.uploader_user_id)}`;
  if (cleanText(visit.user_id)) return `legacy:${cleanText(visit.user_id)}`;
  return `name:${cleanText(visit.promoter) ?? cleanText(visit.uploader_name) ?? "unknown"}`;
}

function isMakukuSnapshot(snapshot: SnapshotScopeRow) {
  return !cleanText(snapshot.competitor_product_id)
    && Boolean(cleanText(snapshot.sku_master_id) || cleanText(snapshot.material_sku_code));
}

function isCompetitorSnapshot(snapshot: SnapshotScopeRow) {
  return Boolean(cleanText(snapshot.competitor_product_id));
}

function regionLabel(visit: VisitScopeRow) {
  return cleanText(visit.province)
    ?? cleanText(visit.city_name)
    ?? cleanText(visit.city)
    ?? "Unassigned";
}

function topRegion(visits: VisitScopeRow[]) {
  const counts = new Map<string, number>();
  for (const visit of visits) {
    const region = regionLabel(visit);
    counts.set(region, (counts.get(region) ?? 0) + 1);
  }
  let winner: { name: string; count: number } | null = null;
  for (const [name, count] of counts.entries()) {
    if (!winner || count > winner.count) winner = { name, count };
  }
  return winner;
}

function compareSummary(current: AgentReportMetricSummary, previous: AgentReportMetricSummary | null) {
  if (!previous) return null;
  const currentTotal = current.makuku_price_record_count + current.competitor_price_record_count;
  const previousTotal = previous.makuku_price_record_count + previous.competitor_price_record_count;
  if (currentTotal === previousTotal) return "Price capture volume stayed flat versus the previous period.";
  if (currentTotal > previousTotal) {
    return `Price capture volume increased by ${currentTotal - previousTotal} versus the previous period.`;
  }
  return `Price capture volume decreased by ${previousTotal - currentTotal} versus the previous period.`;
}

function buildHighlights(summary: AgentReportMetricSummary, visits: VisitScopeRow[], previous: AgentReportMetricSummary | null) {
  const items: string[] = [];
  if (summary.competitor_price_record_count > 0 || summary.makuku_price_record_count > 0) {
    items.push(`Competitor price captures: ${summary.competitor_price_record_count}; Makuku price captures: ${summary.makuku_price_record_count}.`);
  }
  const strongestRegion = topRegion(visits);
  if (strongestRegion) {
    items.push(`${strongestRegion.name} contributed the highest visit count in this period.`);
  }
  const comparison = compareSummary(summary, previous);
  if (comparison) items.push(comparison);
  return items;
}

function buildWarnings(summary: AgentReportMetricSummary) {
  const warnings: string[] = [];
  const totalSamples = summary.makuku_price_record_count + summary.competitor_price_record_count;
  if (totalSamples === 0) warnings.push("No price snapshots were captured in this period.");
  if (summary.visited_store_count === 0) warnings.push("No store visits were captured in this period.");
  if (totalSamples > 0 && totalSamples < 3) warnings.push("Sample size is limited for this period.");
  return warnings;
}

function buildAiInsight(summary: AgentReportMetricSummary, visits: VisitScopeRow[], previous: AgentReportMetricSummary | null) {
  const lines = buildHighlights(summary, visits, previous);
  const warnings = buildWarnings(summary);
  if (warnings.length > 0) lines.push(...warnings);
  if (lines.length === 0) {
    lines.push("Store visits and price capture are balanced for this period.");
  }
  return lines.join(" ");
}

function reportTitle(definition: AgentReportDefinition, period: AgentReportPeriod) {
  if (definition.family === "daily") return `${definition.name} ${period.startDate}`;
  if (definition.family === "weekly") return `${definition.name} ${period.label}`;
  return `${definition.name} ${period.label}`;
}

function buildPlainTextTable(rows: AgentReportMetricRow[]) {
  const header = "Scope | Visited Stores | Visiting Employees | Makuku Price Records | Competitor Price Records";
  const body = rows.map((row) =>
    `${row.scope_name} | ${row.visited_store_count} | ${row.visiting_employee_count} | ${row.makuku_price_record_count} | ${row.competitor_price_record_count}`,
  );
  return [header, ...body].join("\n");
}

export function renderFeishuCard(content: AgentReportContentJson, rows: AgentReportMetricRow[]) {
  const sections = [
    `**Key Metric Definitions**\n${content.key_translations}`,
    `**Report Table**\n${buildPlainTextTable(rows)}`,
    `**AI Insight**\n${content.ai_insight}`,
  ].join("\n\n");

  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: "plain_text",
        content: content.title,
      },
      template: "blue",
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: sections,
        },
      },
    ],
  };
}

export function buildAgentReportSnapshot(input: BuildAgentReportSnapshotInput) {
  const summary: AgentReportMetricSummary = {
    visited_store_count: new Set(input.visits.map(visitStoreKey)).size,
    visiting_employee_count: new Set(input.visits.map(visitEmployeeKey)).size,
    makuku_price_record_count: input.snapshots.filter(isMakukuSnapshot).length,
    competitor_price_record_count: input.snapshots.filter(isCompetitorSnapshot).length,
  };
  const warnings = buildWarnings(summary);
  const table_rows: AgentReportMetricRow[] = [
    {
      scope_name: input.scopeName,
      ...summary,
    },
  ];
  const metrics: AgentReportMetricsJson = {
    summary,
    table_rows,
    period: input.period,
    scope: {
      scope_type: input.scopeType,
      scope_id: input.scopeId,
      scope_name: input.scopeName,
    },
    warnings,
  };
  const content: AgentReportContentJson = {
    title: reportTitle(input.definition, input.period),
    key_translations: "Visited stores = unique stores with visits. Visiting employees = unique promoters or uploaders. Makuku price records = own-brand snapshots. Competitor price records = competitor snapshots.",
    ai_insight: buildAiInsight(summary, input.visits, input.previousMetrics),
    highlights: buildHighlights(summary, input.visits, input.previousMetrics),
    warnings,
  };
  const feishu_card = renderFeishuCard(content, table_rows);
  return { metrics, content, feishu_card };
}

function filterDemoVisits(period: AgentReportPeriod) {
  return demoOfflineStoreVisits.filter((visit) => compareDateKey(visit.visit_date, period.startDate, period.endDate));
}

function snapshotBusinessDate(snapshot: SnapshotScopeRow) {
  const sourceVisitDate = cleanText(snapshot.offline_store_visits?.visit_date);
  if (sourceVisitDate) return sourceVisitDate;
  if (cleanText(snapshot.captured_at)) return formatDateInTimezone(snapshot.captured_at!, JAKARTA_TIMEZONE);
  return null;
}

function filterDemoSnapshots(period: AgentReportPeriod) {
  return demoPriceSnapshots.filter((snapshot) => {
    const businessDate = cleanText(snapshotBusinessDate(snapshot));
    return businessDate ? compareDateKey(businessDate, period.startDate, period.endDate) : false;
  });
}

function filterScopedVisits(visits: VisitScopeRow[], scopeType: AgentReportScopeType, scopeId: string | null) {
  if (scopeType === "global") return visits;
  if (scopeType === "user") {
    return visits.filter((visit) => visit.uploader_user_id === scopeId || visit.user_id === scopeId);
  }
  return visits.filter((visit) => visit.offline_stores?.organization_id === scopeId);
}

function filterScopedSnapshots(snapshots: SnapshotScopeRow[], scopeType: AgentReportScopeType, scopeId: string | null) {
  if (scopeType === "global") return snapshots;
  if (scopeType === "user") {
    return snapshots.filter((snapshot) => snapshot.offline_store_visits?.uploader_user_id === scopeId || snapshot.offline_store_visits?.user_id === scopeId);
  }
  return snapshots.filter((snapshot) => snapshot.offline_store_visits?.offline_stores?.organization_id === scopeId || snapshot.offline_stores?.organization_id === scopeId);
}

async function resolveScopeName(scopeType: AgentReportScopeType, scopeId: string | null) {
  if (scopeType === "global") return "All Stores";
  if (!scopeId) throw new Error("scope_id is required for organization and user scopes");
  if (!hasSupabaseServiceConfig()) return scopeType === "organization" ? `Organization ${scopeId}` : `User ${scopeId}`;

  const supabase = createSupabaseServiceClient();
  if (scopeType === "organization") {
    const { data, error } = await supabase.from("organizations").select("name").eq("id", scopeId).single();
    if (error || !data) throw new Error(error?.message ?? "Organization not found");
    return data.name as string;
  }

  const { data, error } = await supabase.from("app_users").select("display_name,username").eq("id", scopeId).single();
  if (error || !data) throw new Error(error?.message ?? "User not found");
  return cleanText(data.display_name) ?? cleanText(data.username) ?? `User ${scopeId}`;
}

async function loadVisitsForPeriod(period: AgentReportPeriod) {
  if (!hasSupabaseServiceConfig()) return { data: filterDemoVisits(period), error: null, isDemo: true } satisfies QueryResult<VisitScopeRow[]>;
  const supabase = createSupabaseServiceClient();
  const initial = await supabase
    .from("offline_store_visits")
    .select("id,store_id,store_name,province,city_name,district,city,channel_type,uploader_user_id,user_id,promoter,uploader_name,visit_date,offline_stores(id,organization_id,name)")
    .gte("visit_date", period.startDate)
    .lte("visit_date", period.endDate)
    .order("visit_date", { ascending: false })
    .limit(5000);
  let data = initial.data as unknown[] | null;
  let error = initial.error;

  if (error?.message.includes("user_id")) {
    const legacy = await supabase
      .from("offline_store_visits")
      .select("id,store_id,store_name,province,city_name,district,city,channel_type,uploader_user_id,promoter,uploader_name,visit_date,offline_stores(id,organization_id,name)")
      .gte("visit_date", period.startDate)
      .lte("visit_date", period.endDate)
      .order("visit_date", { ascending: false })
      .limit(5000);
    data = legacy.data as unknown[] | null;
    error = legacy.error;
  }

  if (error?.message.includes("offline_stores")) {
    const legacy = await supabase
      .from("offline_store_visits")
      .select("id,store_id,store_name,province,city_name,district,city,channel_type,uploader_user_id,promoter,uploader_name,visit_date")
      .gte("visit_date", period.startDate)
      .lte("visit_date", period.endDate)
      .order("visit_date", { ascending: false })
      .limit(5000);
    data = legacy.data as unknown[] | null;
    error = legacy.error;
  }

  if (error) return { data: filterDemoVisits(period), error: error.message, isDemo: true } satisfies QueryResult<VisitScopeRow[]>;
  return { data: (data ?? []) as VisitScopeRow[], error: null, isDemo: false } satisfies QueryResult<VisitScopeRow[]>;
}

async function loadSnapshotsForPeriod(period: AgentReportPeriod) {
  if (!hasSupabaseServiceConfig()) return { data: filterDemoSnapshots(period), error: null, isDemo: true } satisfies QueryResult<SnapshotScopeRow[]>;
  const supabase = createSupabaseServiceClient();
  const initial = await supabase
    .from("price_snapshots")
    .select("id,competitor_product_id,sku_master_id,material_sku_code,captured_at,source_visit_id,offline_store_id,offline_store_visits!source_visit_id(id,store_id,store_name,province,city_name,district,city,channel_type,uploader_user_id,user_id,promoter,uploader_name,visit_date,offline_stores(id,organization_id,name)),offline_stores(id,organization_id,name)")
    .gte("captured_at", `${period.startDate}T00:00:00.000Z`)
    .lte("captured_at", `${period.endDate}T23:59:59.999Z`)
    .order("captured_at", { ascending: false })
    .limit(5000);
  let data = initial.data as unknown[] | null;
  let error = initial.error;

  if (error?.message.includes("user_id")) {
    const withoutLegacyUser = await supabase
      .from("price_snapshots")
      .select("id,competitor_product_id,sku_master_id,material_sku_code,captured_at,source_visit_id,offline_store_id,offline_store_visits!source_visit_id(id,store_id,store_name,province,city_name,district,city,channel_type,uploader_user_id,promoter,uploader_name,visit_date,offline_stores(id,organization_id,name)),offline_stores(id,organization_id,name)")
      .gte("captured_at", `${period.startDate}T00:00:00.000Z`)
      .lte("captured_at", `${period.endDate}T23:59:59.999Z`)
      .order("captured_at", { ascending: false })
      .limit(5000);
    data = withoutLegacyUser.data as unknown[] | null;
    error = withoutLegacyUser.error;
  }

  if (error?.message.includes("offline_store_visits") || error?.message.includes("offline_stores")) {
    const legacy = await supabase
      .from("price_snapshots")
      .select("id,competitor_product_id,sku_master_id,material_sku_code,captured_at,source_visit_id,offline_store_id")
      .gte("captured_at", `${period.startDate}T00:00:00.000Z`)
      .lte("captured_at", `${period.endDate}T23:59:59.999Z`)
      .order("captured_at", { ascending: false })
      .limit(5000);
    data = legacy.data as unknown[] | null;
    error = legacy.error;
  }

  if (error) return { data: filterDemoSnapshots(period), error: error.message, isDemo: true } satisfies QueryResult<SnapshotScopeRow[]>;
  const filtered = ((data ?? []) as unknown as SnapshotScopeRow[]).filter((snapshot) => {
    const businessDate = cleanText(snapshotBusinessDate(snapshot));
    return businessDate ? compareDateKey(businessDate, period.startDate, period.endDate) : false;
  });
  return { data: filtered, error: null, isDemo: false } satisfies QueryResult<SnapshotScopeRow[]>;
}

function normalizeReportRow(row: AgentReport | Record<string, unknown>) {
  const report = row as AgentReport & {
    report_definition_code?: string | null;
    report_family?: AgentReportFamily | null;
    definition_name?: string | null;
    template_version?: number | null;
  };
  const definitionCode = cleanText(report.report_definition_code) ?? legacyReportTypeToDefinitionCode(report.report_type, report.scope_type);
  const definition = getAgentReportDefinition(definitionCode);
  return {
    ...report,
    report_definition_code: definition.code,
    report_family: report.report_family ?? report.report_type ?? definition.family,
    definition_name: cleanText(report.definition_name) ?? definition.name,
    template_version: report.template_version ?? definition.template_version,
  } as AgentReport;
}

function summarizeRecipients(recipients: AgentReportRecipient[]): AgentReportDeliverySummary {
  const summary: AgentReportDeliverySummary = {
    recipient_count: recipients.length,
    pending_count: 0,
    sent_count: 0,
    failed_count: 0,
  };
  for (const recipient of recipients) {
    if (recipient.send_status === "pending") summary.pending_count += 1;
    if (recipient.send_status === "sent") summary.sent_count += 1;
    if (recipient.send_status === "failed") summary.failed_count += 1;
  }
  return summary;
}

function reportSubscriptionKey(input: {
  report_definition_code: string;
  scope_type: AgentReportScopeType;
  scope_id: string | null;
}) {
  return [input.report_definition_code, input.scope_type, input.scope_id ?? "global"].join("|");
}

async function loadRecipientsByReportIds(reportIds: string[]) {
  if (!hasSupabaseServiceConfig() || reportIds.length === 0) return new Map<string, AgentReportRecipient[]>();
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("agent_report_recipients")
    .select("*")
    .in("report_id", reportIds)
    .order("created_at", { ascending: false });
  if (error) return new Map<string, AgentReportRecipient[]>();

  const map = new Map<string, AgentReportRecipient[]>();
  for (const row of (data ?? []) as AgentReportRecipient[]) {
    const list = map.get(row.report_id) ?? [];
    list.push(row);
    map.set(row.report_id, list);
  }
  return map;
}

async function loadMatchingSubscriptionCountsByReportIds(reports: AgentReport[]) {
  const counts = new Map<string, number>();
  if (!hasSupabaseServiceConfig() || reports.length === 0) return counts;

  const supabase = createSupabaseServiceClient();
  const reportDefinitionCodes = [...new Set(reports.map((report) => report.report_definition_code))];
  const { data, error } = await supabase
    .from("agent_report_subscriptions")
    .select("report_definition_code,scope_type,scope_id,enabled")
    .in("report_definition_code", reportDefinitionCodes)
    .eq("enabled", true);
  if (error) return counts;

  const subscriptionCounts = new Map<string, number>();
  for (const row of (data ?? []) as Array<Pick<AgentReport, "report_definition_code" | "scope_type" | "scope_id"> & { enabled: boolean }>) {
    const key = reportSubscriptionKey({
      report_definition_code: row.report_definition_code,
      scope_type: row.scope_type,
      scope_id: row.scope_id ?? null,
    });
    subscriptionCounts.set(key, (subscriptionCounts.get(key) ?? 0) + 1);
  }

  for (const report of reports) {
    counts.set(report.id, subscriptionCounts.get(reportSubscriptionKey(report)) ?? 0);
  }
  return counts;
}

async function readExistingReport(input: GenerateAgentReportInput, period: AgentReportPeriod) {
  const supabase = createSupabaseServiceClient();
  const definition = getAgentReportDefinition(input.reportDefinitionCode ?? legacyReportTypeToDefinitionCode(input.reportType ?? "daily", input.scopeType));
  let query = supabase
    .from("agent_reports")
    .select("*")
    .eq("report_definition_code", definition.code)
    .eq("period_start", period.startDate)
    .eq("period_end", period.endDate)
    .eq("scope_type", input.scopeType);
  query = input.scopeId === null ? query.is("scope_id", null) : query.eq("scope_id", input.scopeId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data ? normalizeReportRow(data) : null;
}

async function readPreviousSummary(period: AgentReportPeriod, scopeType: AgentReportScopeType, scopeId: string | null) {
  if (!hasSupabaseServiceConfig()) return null;
  const previous = previousPeriod(period);
  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from("agent_reports")
    .select("metrics_json")
    .eq("report_definition_code", period.reportDefinitionCode)
    .eq("period_start", previous.startDate)
    .eq("period_end", previous.endDate)
    .eq("scope_type", scopeType);
  query = scopeId === null ? query.is("scope_id", null) : query.eq("scope_id", scopeId);
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  const metrics = (data.metrics_json ?? null) as AgentReportMetricsJson | null;
  return metrics?.summary ?? null;
}

export async function generateAgentReport(input: GenerateAgentReportInput): Promise<QueryResult<AgentReport>> {
  const definition = getAgentReportDefinition(input.reportDefinitionCode ?? legacyReportTypeToDefinitionCode(input.reportType ?? "daily", input.scopeType));
  const period = resolveReportPeriod(definition, input.periodAnchor);
  const scopeName = await resolveScopeName(input.scopeType, input.scopeId);
  const [visitsResult, snapshotsResult, previousSummary] = await Promise.all([
    loadVisitsForPeriod(period),
    loadSnapshotsForPeriod(period),
    readPreviousSummary(period, input.scopeType, input.scopeId),
  ]);
  const visits = filterScopedVisits(visitsResult.data, input.scopeType, input.scopeId);
  const snapshots = filterScopedSnapshots(snapshotsResult.data, input.scopeType, input.scopeId);
  const built = buildAgentReportSnapshot({
    definition,
    period,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    scopeName,
    visits,
    snapshots,
    previousMetrics: previousSummary,
  });

  if (!hasSupabaseServiceConfig()) {
    const now = new Date().toISOString();
    return {
      data: {
        id: `demo-${definition.code}-${period.startDate}-${input.scopeType}-${input.scopeId ?? "global"}`,
        report_type: definition.family,
        report_definition_code: definition.code,
        report_family: definition.family,
        definition_name: definition.name,
        template_version: definition.template_version,
        period_start: period.startDate,
        period_end: period.endDate,
        timezone: period.timezone,
        scope_type: input.scopeType,
        scope_id: input.scopeId,
        scope_name: scopeName,
        metrics_json: built.metrics,
        content_json: built.content,
        feishu_card_json: built.feishu_card,
        status: "generated",
        generated_at: now,
        created_at: now,
        updated_at: now,
      },
      error: visitsResult.error ?? snapshotsResult.error,
      isDemo: true,
    };
  }

  const existing = await readExistingReport(input, period);
  if (existing && !input.force) {
    return { data: existing, error: null, isDemo: false };
  }

  const supabase = createSupabaseServiceClient();
  const payload = {
    report_type: definition.family,
    report_definition_code: definition.code,
    report_family: definition.family,
    definition_name: definition.name,
    template_version: definition.template_version,
    period_start: period.startDate,
    period_end: period.endDate,
    timezone: period.timezone,
    scope_type: input.scopeType,
    scope_id: input.scopeId,
    scope_name: scopeName,
    metrics_json: built.metrics,
    content_json: built.content,
    feishu_card_json: built.feishu_card,
    status: "generated",
    generated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const result = existing
    ? await supabase.from("agent_reports").update(payload).eq("id", existing.id).select("*").single()
    : await supabase.from("agent_reports").insert(payload).select("*").single();

  if (result.error) {
    return {
      data: existing ?? {
        id: `failed-${definition.code}-${period.startDate}`,
        report_type: definition.family,
        report_definition_code: definition.code,
        report_family: definition.family,
        definition_name: definition.name,
        template_version: definition.template_version,
        period_start: period.startDate,
        period_end: period.endDate,
        timezone: period.timezone,
        scope_type: input.scopeType,
        scope_id: input.scopeId,
        scope_name: scopeName,
        metrics_json: built.metrics,
        content_json: built.content,
        feishu_card_json: built.feishu_card,
        status: "failed",
        generated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
      error: result.error.message,
      isDemo: false,
    };
  }

  return { data: normalizeReportRow(result.data), error: visitsResult.error ?? snapshotsResult.error, isDemo: false };
}

export async function listAgentReports(filters: AgentReportFilters = {}): Promise<QueryResult<AgentReport[]>> {
  if (!hasSupabaseServiceConfig()) return { data: await listDemoAgentReports(filters), error: null, isDemo: true };
  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from("agent_reports")
    .select("*")
    .order("period_end", { ascending: false })
    .order("generated_at", { ascending: false })
    .limit(filters.limit ?? 50);

  if (filters.reportDefinitionCode) query = query.eq("report_definition_code", filters.reportDefinitionCode);
  if (filters.reportFamily) query = query.eq("report_family", filters.reportFamily);
  if (!filters.reportFamily && filters.reportType) query = query.eq("report_family", filters.reportType);
  if (filters.scopeType) query = query.eq("scope_type", filters.scopeType);
  if (filters.scopeId === null) query = query.eq("scope_id", null);
  if (cleanText(filters.scopeId)) query = query.eq("scope_id", filters.scopeId);
  if (filters.status) query = query.eq("status", filters.status);
  if (cleanText(filters.periodStart)) query = query.eq("period_start", filters.periodStart);

  const { data, error } = await query;
  if (error) return { data: [], error: error.message, isDemo: false };
  const reports = ((data ?? []) as AgentReport[]).map(normalizeReportRow);
  const recipientsByReportId = await loadRecipientsByReportIds(reports.map((report) => report.id));
  const subscriptionsByReportId = await loadMatchingSubscriptionCountsByReportIds(reports);
  return {
    data: reports.map((report) => {
      const recipients = recipientsByReportId.get(report.id) ?? [];
      return {
        ...report,
        delivery_summary: summarizeRecipients(recipients),
        matched_subscriptions_count: subscriptionsByReportId.get(report.id) ?? 0,
      };
    }),
    error: null,
    isDemo: false,
  };
}

export async function getAgentReportById(id: string): Promise<QueryResult<AgentReport | null>> {
  if (!hasSupabaseServiceConfig()) {
    const reports = await listDemoAgentReports();
    return { data: reports.find((report) => report.id === id) ?? null, error: null, isDemo: true };
  }
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.from("agent_reports").select("*").eq("id", id).maybeSingle();
  if (error) return { data: null, error: error.message, isDemo: false };
  if (!data) return { data: null, error: null, isDemo: false };
  const recipientsByReportId = await loadRecipientsByReportIds([id]);
  const recipients = recipientsByReportId.get(id) ?? [];
  const subscriptionCounts = await loadMatchingSubscriptionCountsByReportIds([normalizeReportRow(data)]);
  return {
    data: {
      ...normalizeReportRow(data),
      recipients,
      delivery_summary: summarizeRecipients(recipients),
      matched_subscriptions_count: subscriptionCounts.get(id) ?? 0,
    },
    error: null,
    isDemo: false,
  };
}

export async function rerunAgentReport(id: string): Promise<QueryResult<AgentReport | null>> {
  const reportResult = await getAgentReportById(id);
  if (reportResult.error || !reportResult.data) return reportResult;
  return generateAgentReport({
    reportDefinitionCode: reportResult.data.report_definition_code,
    periodAnchor: reportResult.data.period_start,
    scopeType: reportResult.data.scope_type,
    scopeId: reportResult.data.scope_id,
    force: true,
  });
}

export { JAKARTA_TIMEZONE, ZERO_UUID };
