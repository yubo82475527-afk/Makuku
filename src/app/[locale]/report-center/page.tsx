import { PageShellState } from "@/components/page-shell-state";
import { ReportCenter } from "@/components/report-center";
import { Card, DataNotice, SelectInput, TextInput } from "@/components/ui";
import { listEnabledAgentReportDefinitions } from "@/lib/agent-report-definitions";
import { listAgentReportSubscriptions } from "@/lib/agent-report-subscriptions";
import { listAgentReports } from "@/lib/agent-reports";
import { getAppUsers, getOrganizations } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import type { AgentReport, AgentReportDefinition, AgentReportFamily, AgentReportScopeType, AgentReportStatus, AgentReportSubscription } from "@/lib/types";

export const dynamic = "force-dynamic";

type LatestStatusItem = {
  definition: AgentReportDefinition;
  report: AgentReport | null;
  matchedSubscriptions: number;
};

function clean(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "").trim() : (value ?? "").trim();
}

function readReportFamily(value: string): AgentReportFamily | undefined {
  return value === "daily" || value === "weekly" || value === "monthly" ? value : undefined;
}

function readScopeType(value: string): AgentReportScopeType | undefined {
  return value === "global" || value === "organization" || value === "user" ? value : undefined;
}

function readStatus(value: string): AgentReportStatus | undefined {
  return value === "draft" || value === "generated" || value === "sent" || value === "failed" ? value : undefined;
}

export function buildLatestStatusItems(definitions: AgentReportDefinition[], reports: AgentReport[], subscriptions: AgentReportSubscription[]) {
  return definitions.map((definition): LatestStatusItem => {
    const report = reports.find((item) => item.report_definition_code === definition.code) ?? null;
    const matchedSubscriptions = subscriptions.filter((subscription) =>
      subscription.enabled && subscription.report_definition_code === definition.code,
    ).length;
    return { definition, report, matchedSubscriptions };
  });
}

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const query = await searchParams;
  const reportFamily = readReportFamily(clean(query.report_family) || clean(query.report_type));
  const reportScopeType = readScopeType(clean(query.scope_type));
  const reportStatus = readStatus(clean(query.status));
  const periodStart = clean(query.period_start);
  const queryString = new URLSearchParams(
    Object.entries(query).flatMap(([key, value]) => typeof value === "string" && value ? [[key, value]] : []),
  ).toString();
  const currentPath = `/report-center${queryString ? `?${queryString}` : ""}`;
  const isZh = locale === "zh";

  const [reportsResult, subscriptionsResult, organizationsResult, usersResult] = await Promise.all([
    listAgentReports({
      reportFamily,
      scopeType: reportScopeType,
      status: reportStatus,
      periodStart: periodStart || undefined,
      limit: 50,
    }),
    listAgentReportSubscriptions({
      limit: 100,
    }),
    getOrganizations(),
    getAppUsers(),
  ]);

  const definitions = listEnabledAgentReportDefinitions();
  const error = reportsResult.error ?? subscriptionsResult.error ?? organizationsResult.error ?? usersResult.error;
  const isDemo = reportsResult.isDemo || subscriptionsResult.isDemo || organizationsResult.isDemo || usersResult.isDemo;
  const latestStatus = buildLatestStatusItems(definitions, reportsResult.data, subscriptionsResult.data);

  return (
    <>
      <PageShellState locale={locale} dict={dict} title={isZh ? "自动化报表" : "Automated Reports"} currentPath={currentPath} isDemo={isDemo} />
      <DataNotice dict={dict} error={error} />

      <Card className="mb-4">
        <div className="mb-3">
          <h2 className="font-semibold">{isZh ? "筛选" : "Filters"}</h2>
        </div>
        <form className="grid gap-3 md:grid-cols-4">
          <SelectInput name="report_family" defaultValue={reportFamily ?? ""}>
            <option value="">{isZh ? "全部分类" : "All families"}</option>
            <option value="daily">daily</option>
            <option value="weekly">weekly</option>
            <option value="monthly">monthly</option>
          </SelectInput>
          <SelectInput name="scope_type" defaultValue={reportScopeType ?? ""}>
            <option value="">{isZh ? "全部范围" : "All scopes"}</option>
            <option value="global">{isZh ? "全局" : "Global"}</option>
            <option value="organization">{isZh ? "组织" : "Organization"}</option>
            <option value="user">{isZh ? "用户" : "User"}</option>
          </SelectInput>
          <SelectInput name="status" defaultValue={reportStatus ?? ""}>
            <option value="">{isZh ? "全部状态" : "All statuses"}</option>
            <option value="generated">generated</option>
            <option value="sent">sent</option>
            <option value="failed">failed</option>
          </SelectInput>
          <TextInput type="date" name="period_start" defaultValue={periodStart} />
          <div className="md:col-span-4 flex justify-end">
            <button type="submit" className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800">
              {isZh ? "筛选" : "Filter"}
            </button>
          </div>
        </form>
      </Card>

      <ReportCenter
        locale={locale}
        latestStatus={latestStatus}
        reports={reportsResult.data}
        subscriptions={subscriptionsResult.data}
        users={usersResult.data}
      />
    </>
  );
}
