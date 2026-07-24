import { PageShellState } from "@/components/page-shell-state";
import { QueryForm, QuerySubmitButton } from "@/components/query-form";
import { ReportCenter } from "@/components/report-center";
import { Card, DataNotice } from "@/components/ui";
import { listEnabledAgentReportDefinitions } from "@/lib/agent-report-definitions";
import { listAgentReportSubscriptions } from "@/lib/agent-report-subscriptions";
import { listAgentReports } from "@/lib/agent-reports";
import { getAppUsers, getOrganizations } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import type { AgentReport, AgentReportDefinition, AgentReportSubscription } from "@/lib/types";

export const dynamic = "force-dynamic";

type LatestStatusItem = {
  definition: AgentReportDefinition;
  report: AgentReport | null;
  matchedSubscriptions: number;
};

function clean(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "").trim() : (value ?? "").trim();
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

export function filterDefinitionsByReportName(definitions: AgentReportDefinition[], reportName: string) {
  const keyword = reportName.trim().toLowerCase();
  if (!keyword) return definitions;
  return definitions.filter((definition) =>
    definition.name.toLowerCase().includes(keyword) || definition.code.toLowerCase().includes(keyword),
  );
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
  const reportName = clean(query.report_name);
  const queryString = new URLSearchParams(
    Object.entries(query).flatMap(([key, value]) => typeof value === "string" && value ? [[key, value]] : []),
  ).toString();
  const currentPath = `/report-center${queryString ? `?${queryString}` : ""}`;
  const isZh = locale === "zh";

  const [reportsResult, subscriptionsResult, organizationsResult, usersResult] = await Promise.all([
    listAgentReports({ limit: 50 }),
    listAgentReportSubscriptions({ limit: 100 }),
    getOrganizations(),
    getAppUsers(),
  ]);

  const definitions = filterDefinitionsByReportName(listEnabledAgentReportDefinitions(), reportName);
  const error = reportsResult.error ?? subscriptionsResult.error ?? organizationsResult.error ?? usersResult.error;
  const isDemo = reportsResult.isDemo || subscriptionsResult.isDemo || organizationsResult.isDemo || usersResult.isDemo;
  const latestStatus = buildLatestStatusItems(definitions, reportsResult.data, subscriptionsResult.data);

  return (
    <>
      <PageShellState locale={locale} dict={dict} title={isZh ? "报表中心" : "Report Center"} currentPath={currentPath} isDemo={isDemo} />
      <DataNotice dict={dict} error={error} />

      <Card className="mb-4">
        <QueryForm className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_minmax(120px,180px)]">
          <ReportNameFilter locale={locale} reportName={reportName} />
          <QuerySubmitButton
            idleLabel={dict.common.filter}
            pendingLabel={isZh ? "筛选中..." : "Filtering..."}
          />
        </QueryForm>
      </Card>

      <ReportCenter
        locale={locale}
        latestStatus={latestStatus}
        subscriptions={subscriptionsResult.data}
        users={usersResult.data}
      />
    </>
  );
}

function ReportNameFilter({ locale, reportName }: { locale: string; reportName: string }) {
  const isZh = locale === "zh";
  const label = isZh ? "报表名称" : "Report name";
  const placeholder = isZh ? "输入报表名称或编码" : "Search by name or code";

  return (
    <label className="flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200">
      <span className="mr-2 shrink-0 text-xs font-medium text-slate-500">{label}</span>
      <input
        name="report_name"
        defaultValue={reportName}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent py-2 outline-none"
      />
    </label>
  );
}
