import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const migrationPath = "supabase/migrations/202607010001_agent_reports.sql";
const definitionRefactorMigrationPath = "supabase/migrations/202607020001_agent_report_definitions.sql";
const reportTypesFile = readIfExists("src/lib/types.ts");
const reportRouteFile = readIfExists("src/app/api/internal/agent-reports/route.ts");
const reportIdRouteFile = readIfExists("src/app/api/internal/agent-reports/[id]/route.ts");
const reportDefinitionsFile = readIfExists("src/lib/agent-report-definitions.ts");
const reportPeriodsFile = readIfExists("src/lib/agent-report-periods.ts");
const reportRouteInputsFile = readIfExists("src/lib/agent-report-route-inputs.ts");
const agentReportsSource = readIfExists("src/lib/agent-reports.ts");

test("agent reports migration defines report, recipient, and subscription tables", () => {
  assert.equal(existsSync(migrationPath), true);
  const migration = readFileSync(migrationPath, "utf8");
  assert.match(migration, /create table if not exists public\.agent_reports/i);
  assert.match(migration, /create table if not exists public\.agent_report_recipients/i);
  assert.match(migration, /create table if not exists public\.agent_report_subscriptions/i);
  assert.match(migration, /create unique index if not exists uniq_agent_reports_scope_period/i);
  assert.match(migration, /report_type/i);
  assert.match(migration, /scope_type/i);
  assert.match(migration, /metrics_json jsonb not null/i);
  assert.match(migration, /content_json jsonb not null/i);
  assert.match(migration, /feishu_card_json jsonb not null/i);
});

test("definition refactor migration adds definition metadata without dropping legacy report_type", () => {
  assert.equal(existsSync(definitionRefactorMigrationPath), true);
  const migration = readFileSync(definitionRefactorMigrationPath, "utf8");
  assert.match(migration, /alter table public\.agent_reports/i);
  assert.match(migration, /add column if not exists report_definition_code text/i);
  assert.match(migration, /add column if not exists report_family text/i);
  assert.match(migration, /add column if not exists template_version integer/i);
  assert.match(migration, /alter table public\.agent_report_subscriptions/i);
  assert.match(migration, /add column if not exists report_definition_code text/i);
  assert.doesNotMatch(migration, /drop column if exists report_type/i);
});

test("agent report types capture definitions, families, metrics content and card payloads", () => {
  assert.match(reportTypesFile, /export type AgentReportFamily = "daily" \| "weekly" \| "monthly"/);
  assert.match(reportTypesFile, /export type AgentReportScopeType = "global" \| "organization" \| "user"/);
  assert.match(reportTypesFile, /export type AgentReportDefinition = \{/);
  assert.match(reportTypesFile, /code: string/);
  assert.match(reportTypesFile, /family: AgentReportFamily/);
  assert.match(reportTypesFile, /supported_scope_types: AgentReportScopeType\[]/);
  assert.match(reportTypesFile, /export type AgentReportMetricRow = \{/);
  assert.match(reportTypesFile, /scope_name: string/);
  assert.match(reportTypesFile, /visited_store_count: number/);
  assert.match(reportTypesFile, /visiting_employee_count: number/);
  assert.match(reportTypesFile, /makuku_price_record_count: number/);
  assert.match(reportTypesFile, /competitor_price_record_count: number/);
  assert.match(reportTypesFile, /export type AgentReport = \{/);
  assert.match(reportTypesFile, /report_definition_code: string/);
  assert.match(reportTypesFile, /report_family: AgentReportFamily/);
  assert.match(reportTypesFile, /definition_name: string/);
  assert.match(reportTypesFile, /template_version: number/);
  assert.match(reportTypesFile, /metrics_json:/);
  assert.match(reportTypesFile, /content_json:/);
  assert.match(reportTypesFile, /feishu_card_json:/);
  assert.match(reportTypesFile, /export type AgentReportRecipient = \{/);
  assert.match(reportTypesFile, /export type AgentReportSubscription = \{/);
  assert.match(reportTypesFile, /report_definition_code: string/);
});

test("internal agent report APIs require admin session and expose list generate and detail handlers", () => {
  assert.match(reportRouteFile, /requireAdminSession/);
  assert.match(reportRouteFile, /export async function GET/);
  assert.match(reportRouteFile, /export async function POST/);
  assert.match(reportRouteFile, /normalizeScopeIdInput/);
  assert.match(reportRouteFile, /generateAgentReport/);
  assert.match(reportIdRouteFile, /requireAdminSession/);
  assert.match(reportIdRouteFile, /params: Promise<\{ id: string \}>/);
  assert.match(reportIdRouteFile, /export async function GET/);
});

test("report route keeps null scope_id as null instead of stringifying it", async () => {
  const routeInputsModule = await import("../src/lib/agent-report-route-inputs.ts");

  assert.match(reportRouteInputsFile, /export function normalizeScopeIdInput/);
  assert.equal(routeInputsModule.normalizeScopeIdInput(null), null);
  assert.equal(routeInputsModule.normalizeScopeIdInput(undefined), null);
  assert.equal(routeInputsModule.normalizeScopeIdInput(""), null);
  assert.equal(routeInputsModule.normalizeScopeIdInput("null"), null);
  assert.equal(routeInputsModule.normalizeScopeIdInput("00000000-0000-0000-0000-000000000000"), "00000000-0000-0000-0000-000000000000");
});

test("report engine builds unified cardkit payload and deduplicated metrics", async () => {
  const reportModule = await import("../src/lib/agent-reports.ts");
  const definitionsModule = await import("../src/lib/agent-report-definitions.ts");
  const definition = definitionsModule.getAgentReportDefinition("daily_price_country");

  const report = reportModule.buildAgentReportSnapshot({
    definition,
    period: reportModule.resolveReportPeriod(definition, "2026-07-01"),
    scopeType: "global",
    scopeId: null,
    scopeName: "All Stores",
    visits: [
      {
        id: "v1",
        store_id: "store-1",
        store_name: "Store A",
        province: "DKI Jakarta",
        city_name: "Jakarta",
        district: "Kelapa Gading",
        city: "Jakarta",
        channel_type: "offline",
        uploader_user_id: "user-1",
        user_id: null,
        promoter: "Alice",
        uploader_name: "Alice",
      },
      {
        id: "v2",
        store_id: "store-1",
        store_name: "Store A",
        province: "DKI Jakarta",
        city_name: "Jakarta",
        district: "Kelapa Gading",
        city: "Jakarta",
        channel_type: "offline",
        uploader_user_id: "user-1",
        user_id: null,
        promoter: "Alice",
        uploader_name: "Alice",
      },
      {
        id: "v3",
        store_id: null,
        store_name: "Store B",
        province: "DKI Jakarta",
        city_name: "Jakarta",
        district: "South Jakarta",
        city: "Jakarta",
        channel_type: "offline",
        uploader_user_id: null,
        user_id: "legacy-2",
        promoter: "Bob",
        uploader_name: "Bob",
      },
    ],
    snapshots: [
      {
        id: "p1",
        competitor_product_id: "comp-1",
        sku_master_id: null,
        material_sku_code: null,
      },
      {
        id: "p2",
        competitor_product_id: null,
        sku_master_id: "sku-1",
        material_sku_code: null,
      },
      {
        id: "p3",
        competitor_product_id: null,
        sku_master_id: null,
        material_sku_code: "MAT-001",
      },
    ],
    previousMetrics: null,
  });

  assert.equal(report.metrics.summary.visited_store_count, 2);
  assert.equal(report.metrics.summary.visiting_employee_count, 2);
  assert.equal(report.metrics.summary.makuku_price_record_count, 2);
  assert.equal(report.metrics.summary.competitor_price_record_count, 1);
  assert.equal(report.metrics.table_rows[0].scope_name, "All Stores");
  assert.equal(report.feishu_card.config.wide_screen_mode, true);
  assert.equal(report.feishu_card.header.template, "blue");
  assert.equal(report.feishu_card.elements[0].tag, "div");
  assert.equal(report.feishu_card.elements[0].text.tag, "lark_md");
  assert.match(report.feishu_card.elements[0].text.content, /All Stores/);
  assert.match(report.feishu_card.elements[0].text.content, /AI Insight/);
  assert.match(report.content.key_translations, /visited store/i);
  assert.match(report.content.ai_insight, /competitor/i);
  assert.doesNotMatch(report.content.ai_insight.toLowerCase(), /osa|shelf|display|stock-out/);
});

test("report engine resolves daily weekly and monthly periods in Asia Jakarta business format", async () => {
  const reportModule = await import("../src/lib/agent-reports.ts");
  const definitionsModule = await import("../src/lib/agent-report-definitions.ts");

  assert.deepEqual(reportModule.resolveReportPeriod(definitionsModule.getAgentReportDefinition("daily_price_country"), "2026-07-01"), {
    reportFamily: "daily",
    reportDefinitionCode: "daily_price_country",
    anchor: "2026-07-01",
    startDate: "2026-07-01",
    endDate: "2026-07-01",
    label: "2026-07-01",
    timezone: "Asia/Jakarta",
  });
  assert.deepEqual(reportModule.resolveReportPeriod(definitionsModule.getAgentReportDefinition("weekly_price_management"), "2026-07-02"), {
    reportFamily: "weekly",
    reportDefinitionCode: "weekly_price_management",
    anchor: "2026-07-02",
    startDate: "2026-06-29",
    endDate: "2026-07-05",
    label: "2026-06-29 to 2026-07-05",
    timezone: "Asia/Jakarta",
  });
  assert.deepEqual(reportModule.resolveReportPeriod(definitionsModule.getAgentReportDefinition("monthly_price_country_summary"), "2026-07-15"), {
    reportFamily: "monthly",
    reportDefinitionCode: "monthly_price_country_summary",
    anchor: "2026-07-15",
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    label: "2026-07",
    timezone: "Asia/Jakarta",
  });
});

test("definition registry exposes built-in reports for country, organization, and management views", async () => {
  const definitionsModule = await import("../src/lib/agent-report-definitions.ts");

  assert.match(reportDefinitionsFile, /daily_price_country/);
  assert.match(reportDefinitionsFile, /daily_price_organization/);
  assert.match(reportDefinitionsFile, /weekly_price_management/);
  assert.match(reportDefinitionsFile, /weekly_price_organization/);
  assert.match(reportDefinitionsFile, /monthly_price_country_summary/);

  const definitions = definitionsModule.listAgentReportDefinitions();
  const enabledDefinitions = definitionsModule.listEnabledAgentReportDefinitions();
  assert.ok(definitions.find((item) => item.code === "daily_price_country"));
  assert.ok(definitions.find((item) => item.code === "weekly_price_organization"));
  assert.equal(definitionsModule.getAgentReportDefinition("daily_price_country").family, "daily");
  assert.equal(definitionsModule.getAgentReportDefinition("daily_price_country").enabled, true);
  assert.equal(definitionsModule.getAgentReportDefinition("weekly_price_management").enabled, false);
  assert.deepEqual(definitionsModule.getAgentReportDefinition("daily_price_organization").supported_scope_types, ["organization"]);
  assert.deepEqual(enabledDefinitions.map((item) => item.code), ["daily_price_country"]);
});

test("latest period anchor uses yesterday for daily country report in Jakarta time", async () => {
  const periodsModule = await import("../src/lib/agent-report-periods.ts");

  assert.match(reportPeriodsFile, /resolveLatestPeriodAnchor/);
  assert.equal(
    periodsModule.resolveLatestPeriodAnchor("daily_price_country", "2026-07-02T01:30:00.000Z"),
    "2026-07-01",
  );
  assert.equal(
    periodsModule.resolveLatestPeriodAnchor("weekly_price_management", "2026-07-02T01:30:00.000Z"),
    "2026-06-25",
  );
  assert.equal(
    periodsModule.resolveLatestPeriodAnchor("monthly_price_country_summary", "2026-07-02T01:30:00.000Z"),
    "2026-06-01",
  );
});

test("demo mode exposes a generated daily country report for report center acceptance", async () => {
  const reportModule = await import("../src/lib/agent-reports.ts");

  const reports = await reportModule.listAgentReports({ limit: 10 });
  assert.equal(reports.isDemo, true);
  assert.ok(reports.data.length >= 1);
  assert.equal(reports.data[0].report_definition_code, "daily_price_country");
  assert.equal(reports.data[0].report_family, "daily");
  assert.equal(reports.data[0].status, "generated");

  const detail = await reportModule.getAgentReportById(reports.data[0].id);
  assert.equal(detail.isDemo, true);
  assert.equal(detail.data?.report_definition_code, "daily_price_country");
});

test("existing report lookup handles global scope without coercing null scope_id into uuid text", () => {
  assert.match(agentReportsSource, /input\.scopeId === null \? query\.is\("scope_id", null\) : query\.eq\("scope_id", input\.scopeId\)/);
  assert.match(agentReportsSource, /scopeId === null \? query\.is\("scope_id", null\) : query\.eq\("scope_id", scopeId\)/);
});

test("report loaders fall back when legacy databases are missing offline_store_visits.user_id", () => {
  assert.match(agentReportsSource, /error\?\.message\.includes\("user_id"\)/);
});

test("report subscriptions expose retry-failed delivery support without resetting sent recipients", () => {
  const subscriptionSource = readIfExists("src/lib/agent-report-subscriptions.ts");

  assert.match(subscriptionSource, /export async function retryFailedAgentReport/);
  assert.match(subscriptionSource, /send_status", "failed"|send_status === "failed"/);
  assert.doesNotMatch(subscriptionSource, /retryFailedAgentReport[\s\S]*send_status: "sent"/);
});
