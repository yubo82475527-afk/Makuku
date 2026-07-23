"use client";

import { Loader2, RefreshCw, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Badge, Button, SelectInput, TextInput } from "@/components/ui";
import { resolveLatestPeriodAnchor } from "@/lib/agent-report-periods";
import type { AgentReport, AgentReportDefinition, AgentReportRecipient, AgentReportSubscription, AppUser } from "@/lib/types";

type LatestStatusItem = {
  definition: AgentReportDefinition;
  report: AgentReport | null;
  matchedSubscriptions: number;
};

type SubscriptionDraft = {
  id?: string;
  report_definition_code: string;
  report_family: "daily" | "weekly" | "monthly";
  recipient_type: "user" | "chat";
  app_user_id: string;
  feishu_user_id: string;
  feishu_chat_id: string;
  scope_type: "global" | "organization" | "user";
  scope_id: string;
  send_time_local: string;
  send_weekday: string;
  send_day_of_month: string;
  timezone: string;
  enabled: boolean;
};

export function ReportCenter({
  locale,
  latestStatus,
  subscriptions,
  users,
}: {
  locale: string;
  latestStatus: LatestStatusItem[];
  subscriptions: AgentReportSubscription[];
  users: AppUser[];
}) {
  const router = useRouter();
  const isZh = locale === "zh";
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingSubscription, setEditingSubscription] = useState<SubscriptionDraft | null>(null);
  const [subscriptionsDefinition, setSubscriptionsDefinition] = useState<AgentReportDefinition | null>(null);
  const [selectedReport, setSelectedReport] = useState<AgentReport | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [historyDefinition, setHistoryDefinition] = useState<AgentReportDefinition | null>(null);
  const [historyReports, setHistoryReports] = useState<AgentReport[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const definitionsByCode = useMemo(() => new Map(latestStatus.map((item) => [item.definition.code, item.definition])), [latestStatus]);

  async function submitJson(url: string, method: string, body: Record<string, unknown>) {
    setBusyKey(`${method}:${url}:${String(body.id ?? "")}`);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? (isZh ? "操作失败。" : "Action failed."));
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError(isZh ? "网络异常，操作没有提交成功。" : "Network error. Action was not submitted.");
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  function openSubscriptions(definition: AgentReportDefinition) {
    setSubscriptionsDefinition(definition);
  }

  function startCreateSubscription(definition: AgentReportDefinition) {
    setSubscriptionsDefinition(definition);
    setEditingSubscription({
      report_definition_code: definition.code,
      report_family: definition.family,
      recipient_type: "user",
      app_user_id: "",
      feishu_user_id: "",
      feishu_chat_id: "",
      scope_type: (definition.supported_scope_types[0] as SubscriptionDraft["scope_type"]) ?? "global",
      scope_id: "",
      send_time_local: definition.default_schedule_rule.send_time_local.slice(0, 5),
      send_weekday: String(definition.default_schedule_rule.send_weekday ?? 1),
      send_day_of_month: String(definition.default_schedule_rule.send_day_of_month ?? 1),
      timezone: "Asia/Jakarta",
      enabled: true,
    });
  }

  function startEditSubscription(subscription: AgentReportSubscription) {
    const definition = definitionsByCode.get(subscription.report_definition_code) ?? subscriptionsDefinition;
    if (definition) setSubscriptionsDefinition(definition);
    setEditingSubscription({
      id: subscription.id,
      report_definition_code: subscription.report_definition_code,
      report_family: subscription.report_family,
      recipient_type: subscription.recipient_type,
      app_user_id: subscription.app_user_id ?? "",
      feishu_user_id: subscription.feishu_user_id ?? "",
      feishu_chat_id: subscription.feishu_chat_id ?? "",
      scope_type: subscription.scope_type,
      scope_id: subscription.scope_id ?? "",
      send_time_local: (subscription.send_time_local ?? "08:30:00").slice(0, 5),
      send_weekday: String(subscription.send_weekday ?? 1),
      send_day_of_month: String(subscription.send_day_of_month ?? 1),
      timezone: subscription.timezone,
      enabled: subscription.enabled,
    });
  }

  function syncUserTarget(appUserId: string) {
    const user = usersById.get(appUserId);
    setEditingSubscription((current) => current ? {
      ...current,
      app_user_id: appUserId,
      feishu_user_id: user?.feishu_user_id ?? "",
    } : current);
  }

  async function saveSubscription() {
    if (!editingSubscription) return;
    const definition = definitionsByCode.get(editingSubscription.report_definition_code);
    const scopeType = (definition?.supported_scope_types[0] ?? editingSubscription.scope_type) as SubscriptionDraft["scope_type"];
    const body = {
      report_definition_code: editingSubscription.report_definition_code,
      recipient_type: editingSubscription.recipient_type,
      app_user_id: editingSubscription.recipient_type === "user" ? editingSubscription.app_user_id || null : null,
      feishu_user_id: editingSubscription.recipient_type === "user" ? editingSubscription.feishu_user_id || null : null,
      feishu_chat_id: editingSubscription.recipient_type === "chat" ? editingSubscription.feishu_chat_id || null : null,
      scope_type: scopeType,
      scope_id: scopeType === "global" ? null : editingSubscription.scope_id || null,
      send_time_local: definition?.default_schedule_rule.send_time_local ?? withSeconds(editingSubscription.send_time_local),
      send_weekday: definition?.default_schedule_rule.send_weekday ?? (editingSubscription.report_family === "weekly" ? Number(editingSubscription.send_weekday || "1") : null),
      send_day_of_month: definition?.default_schedule_rule.send_day_of_month ?? (editingSubscription.report_family === "monthly" ? Number(editingSubscription.send_day_of_month || "1") : null),
      timezone: editingSubscription.timezone,
      enabled: editingSubscription.enabled,
    };
    const ok = editingSubscription.id
      ? await submitJson(`/api/internal/agent-report-subscriptions/${editingSubscription.id}`, "PATCH", body)
      : await submitJson("/api/internal/agent-report-subscriptions", "POST", body);
    if (ok) {
      setEditingSubscription(null);
      if (definition) setSubscriptionsDefinition(definition);
    }
  }

  async function regenerateLatest(definitionCode: string, report: AgentReport | null) {
    const targetScopeType = report?.scope_type ?? (definitionsByCode.get(definitionCode)?.supported_scope_types[0] ?? "global");
    const targetScopeId = report?.scope_id ?? null;
    const targetPeriodAnchor = report?.period_start ?? resolveLatestPeriodAnchor(definitionCode);
    const ok = await submitJson(report ? `/api/internal/agent-reports/${report.id}/rerun` : "/api/internal/agent-reports", "POST", report ? {} : {
      report_definition_code: definitionCode,
      period_anchor: targetPeriodAnchor,
      scope_type: targetScopeType,
      scope_id: targetScopeId,
      force: true,
    });
    if (ok && historyDefinition?.code === definitionCode) {
      await loadSendHistory(definitionCode);
    }
  }

  async function redeliverReport(report: AgentReport) {
    if (!window.confirm(confirmRedeliverMessage(isZh))) return;
    const ok = await submitJson(`/api/internal/agent-reports/${report.id}/redeliver`, "POST", {});
    if (ok && historyDefinition) await loadSendHistory(historyDefinition.code);
  }

  async function retryFailedReport(report: AgentReport) {
    if (!window.confirm(confirmRetryFailedMessage(isZh))) return;
    const ok = await submitJson(`/api/internal/agent-reports/${report.id}/retry-failed`, "POST", {});
    if (ok && historyDefinition) await loadSendHistory(historyDefinition.code);
  }

  async function dispatchPendingReport(report: AgentReport) {
    const ok = await submitJson(`/api/internal/agent-reports/${report.id}/dispatch`, "POST", {});
    if (ok && historyDefinition) await loadSendHistory(historyDefinition.code);
  }

  async function openReport(report: AgentReport) {
    setViewLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/internal/agent-reports/${report.id}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? (isZh ? "加载报表详情失败。" : "Failed to load report details."));
        setSelectedReport(report);
        return;
      }
      setSelectedReport(payload.report ?? report);
    } catch {
      setError(isZh ? "网络异常，报表详情加载失败。" : "Network error. Failed to load report details.");
      setSelectedReport(report);
    } finally {
      setViewLoading(false);
    }
  }

  async function loadSendHistory(definitionCode: string) {
    setHistoryLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        report_definition_code: definitionCode,
        limit: "50",
      });
      const response = await fetch(`/api/internal/agent-reports?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? (isZh ? "加载发送记录失败。" : "Failed to load send history."));
        setHistoryReports([]);
        return;
      }
      setHistoryReports(Array.isArray(payload.reports) ? payload.reports : []);
    } catch {
      setError(isZh ? "网络异常，发送记录加载失败。" : "Network error. Failed to load send history.");
      setHistoryReports([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openSendHistory(definition: AgentReportDefinition) {
    setHistoryDefinition(definition);
    setHistoryReports([]);
    await loadSendHistory(definition.code);
  }

  async function toggleSubscription(subscription: AgentReportSubscription) {
    await submitJson(`/api/internal/agent-report-subscriptions/${subscription.id}`, "PATCH", {
      report_definition_code: subscription.report_definition_code,
      recipient_type: subscription.recipient_type,
      app_user_id: subscription.app_user_id,
      feishu_user_id: subscription.feishu_user_id,
      feishu_chat_id: subscription.feishu_chat_id,
      scope_type: subscription.scope_type,
      scope_id: subscription.scope_id,
      send_time_local: subscription.send_time_local,
      send_weekday: subscription.send_weekday,
      send_day_of_month: subscription.send_day_of_month,
      timezone: subscription.timezone,
      enabled: !subscription.enabled,
    });
  }

  async function deleteSubscription(subscription: AgentReportSubscription) {
    await submitJson(`/api/internal/agent-report-subscriptions/${subscription.id}`, "DELETE", {});
  }

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reports</div>
          <h2 className="font-semibold">{isZh ? "报表" : "Reports"}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {isZh ? "按定义查看启用状态；订阅与发送记录在行内打开。" : "Enabled status by definition. Open subscriptions and send history from each row."}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">{isZh ? "报表名称" : "Report name"}</th>
                <th className="py-2 pr-3">{isZh ? "状态" : "Status"}</th>
                <th className="py-2 pr-3">{isZh ? "订阅人数" : "Subscribers"}</th>
                <th className="py-2 pr-3">{isZh ? "最近发送时间" : "Last sent"}</th>
                <th className="py-2 pr-3">{isZh ? "操作" : "Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {latestStatus.map((item) => {
                const report = item.report;
                return (
                <tr key={item.definition.code}>
                  <td className="py-3 pr-3 align-top">
                    <div className="font-medium">{item.definition.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.definition.code}</div>
                  </td>
                  <td className="py-3 pr-3 align-top">
                    <Badge tone={item.definition.enabled ? "low" : "medium"}>
                      {item.definition.enabled ? (isZh ? "启用" : "Enabled") : (isZh ? "禁用" : "Disabled")}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap py-3 pr-3 align-top">{item.matchedSubscriptions}</td>
                  <td className="whitespace-nowrap py-3 pr-3 align-top">
                    {formatDateTime(report?.delivery_summary?.last_sent_at)}
                  </td>
                  <td className="py-3 pr-3 align-top">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => openSubscriptions(item.definition)}
                        className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {isZh ? "管理订阅" : "Manage subscriptions"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void openSendHistory(item.definition)}
                        className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {isZh ? "发送记录" : "Send history"}
                      </button>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </section>

      {historyDefinition ? (
        <Dialog
          title={isZh ? `发送记录 · ${historyDefinition.name}` : `Send history · ${historyDefinition.name}`}
          closeLabel={isZh ? "关闭" : "Close"}
          onClose={() => {
            setHistoryDefinition(null);
            setHistoryReports([]);
          }}
        >
          <p className="mb-4 text-sm text-slate-500">
            {isZh
              ? `展示 ${historyDefinition.code} 的生成与投递记录。`
              : `Generated and delivery records for ${historyDefinition.code}.`}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">{isZh ? "标题" : "Title"}</th>
                  <th className="py-2 pr-3">{isZh ? "周期" : "Period"}</th>
                  <th className="py-2 pr-3">{isZh ? "数据范围" : "Data scope"}</th>
                  <th className="py-2 pr-3">{isZh ? "状态" : "Status"}</th>
                  <th className="py-2 pr-3">{isZh ? "命中订阅" : "Matched subscriptions"}</th>
                  <th className="py-2 pr-3">{isZh ? "发送摘要" : "Delivery summary"}</th>
                  <th className="py-2 pr-3">{isZh ? "生成时间" : "Generated"}</th>
                  <th className="py-2 pr-3">{isZh ? "操作" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {historyLoading ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-500">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {isZh ? "加载中" : "Loading"}
                      </span>
                    </td>
                  </tr>
                ) : null}
                {!historyLoading ? historyReports.map((report) => (
                  <tr key={report.id}>
                    <td className="py-3 pr-3 align-top">
                      <div className="font-medium">{report.content_json.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{report.content_json.ai_insight}</div>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-3 align-top">{report.period_start} - {report.period_end}</td>
                    <td className="py-3 pr-3 align-top">{report.scope_name}</td>
                    <td className="py-3 pr-3 align-top">
                      <Badge tone={report.status === "failed" ? "high" : report.status === "sent" ? "low" : "neutral"}>
                        {formatReportStatus(report, isZh)}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-3 align-top">{report.matched_subscriptions_count ?? 0}</td>
                    <td className="py-3 pr-3 align-top">{formatDeliverySummary(report.delivery_summary)}</td>
                    <td className="whitespace-nowrap py-3 pr-3 align-top">{formatDateTime(report.generated_at)}</td>
                    <td className="py-3 pr-3 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => void openReport(report)} className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                          {isZh ? "查看" : "View"}
                        </button>
                        <a href={`/${locale}/report-center/template-preview?report_id=${encodeURIComponent(report.id)}`} className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                          {templatePreviewLabel(isZh)}
                        </a>
                        <button type="button" onClick={() => void regenerateLatest(report.report_definition_code, report)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                          <RefreshCw className="h-3.5 w-3.5" />
                          {regenerateLabel(isZh)}
                        </button>
                        <button type="button" onClick={() => void redeliverReport(report)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                          <Send className="h-3.5 w-3.5" />
                          {redeliverLabel(isZh)}
                        </button>
                        <button type="button" onClick={() => void dispatchPendingReport(report)} className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                          {dispatchPendingLabel(isZh)}
                        </button>
                        <button type="button" onClick={() => void retryFailedReport(report)} className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                          {retryFailedLabel(isZh)}
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : null}
                {!historyLoading && historyReports.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">{isZh ? "该定义暂无发送记录。" : "No send history for this definition."}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Dialog>
      ) : null}

      {subscriptionsDefinition ? (
        <Dialog
          title={isZh ? `管理订阅 · ${subscriptionsDefinition.name}` : `Manage subscriptions · ${subscriptionsDefinition.name}`}
          closeLabel={isZh ? "关闭" : "Close"}
          onClose={() => setSubscriptionsDefinition(null)}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                {isZh
                  ? `管理 ${subscriptionsDefinition.code} 的接收对象。`
                  : `Manage recipients for ${subscriptionsDefinition.code}.`}
              </p>
              <Button type="button" onClick={() => startCreateSubscription(subscriptionsDefinition)}>
                {isZh ? "新增订阅" : "Add subscription"}
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">{isZh ? "接收对象" : "Recipient"}</th>
                    <th className="py-2 pr-3">{isZh ? "状态" : "Status"}</th>
                    <th className="py-2 pr-3">{isZh ? "操作" : "Actions"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {subscriptions
                    .filter((subscription) => subscription.report_definition_code === subscriptionsDefinition.code)
                    .map((subscription) => (
                    <tr key={subscription.id}>
                      <td className="py-3 pr-3">
                        <div className="font-medium">{subscriptionRecipientLabel(subscription, usersById)}</div>
                        <div className="mt-1 text-xs text-slate-500">{subscription.recipient_type}</div>
                      </td>
                      <td className="py-3 pr-3">
                        <Badge tone={subscription.enabled ? "low" : "medium"}>{subscription.enabled ? (isZh ? "启用" : "Enabled") : (isZh ? "停用" : "Disabled")}</Badge>
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => startEditSubscription(subscription)} className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                            {isZh ? "编辑" : "Edit"}
                          </button>
                          <button type="button" onClick={() => void toggleSubscription(subscription)} className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                            {subscription.enabled ? (isZh ? "停用" : "Disable") : (isZh ? "启用" : "Enable")}
                          </button>
                          <button type="button" onClick={() => void deleteSubscription(subscription)} className="inline-flex h-9 items-center rounded-md border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50">
                            {isZh ? "删除" : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {subscriptions.filter((subscription) => subscription.report_definition_code === subscriptionsDefinition.code).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-slate-500">{isZh ? "该报表暂无订阅配置。" : "No subscriptions for this report."}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </Dialog>
      ) : null}

      {selectedReport ? (
        <Dialog title={selectedReport.content_json.title} closeLabel={isZh ? "关闭" : "Close"} onClose={() => setSelectedReport(null)}>
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <MetaField label={isZh ? "定义" : "Definition"} value={selectedReport.report_definition_code} />
              <MetaField label={isZh ? "分类" : "Family"} value={selectedReport.report_family} />
              <MetaField label={isZh ? "周期" : "Period"} value={`${selectedReport.period_start} - ${selectedReport.period_end}`} />
              <MetaField label={isZh ? "状态" : "Status"} value={formatReportStatus(selectedReport, isZh)} />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500">{isZh ? "卡片预览" : "Card payload"}</div>
              {viewLoading ? (
                <div className="mt-2 flex h-24 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isZh ? "加载中" : "Loading"}
                </div>
              ) : hasCardPayload(selectedReport) ? (
                <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(selectedReport.feishu_card_json, null, 2)}</pre>
              ) : (
                <div className="mt-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  {isZh ? "暂无卡片预览。" : "There is no card preview for this report."}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500">{isZh ? "投递记录" : "Deliveries"}</div>
              <div className="mt-2 space-y-2">
                {(selectedReport.recipients ?? []).length > 0 ? (selectedReport.recipients ?? []).map((recipient, index) => (
                  <div key={`${recipient.id}-${index}`} className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-700">
                    <div>{recipientLabel(recipient)}</div>
                    <div className="mt-1 text-slate-500">{recipient.send_status}</div>
                  </div>
                )) : (
                  <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                    {isZh ? "暂无投递记录。" : "No delivery records yet."}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Dialog>
      ) : null}

      {editingSubscription ? (
        <Dialog title={editingSubscription.id ? (isZh ? "编辑订阅" : "Edit subscription") : (isZh ? "新增订阅" : "Add subscription")} closeLabel={isZh ? "关闭" : "Close"} onClose={() => setEditingSubscription(null)}>
          <div className="mb-4">
            <MetaField
              label={isZh ? "报表定义" : "Report definition"}
              value={`${definitionsByCode.get(editingSubscription.report_definition_code)?.name ?? editingSubscription.report_definition_code} (${editingSubscription.report_definition_code})`}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={isZh ? "接收对象类型" : "Recipient type"}>
              <SelectInput value={editingSubscription.recipient_type} onChange={(event) => setEditingSubscription((current) => current ? { ...current, recipient_type: event.target.value as SubscriptionDraft["recipient_type"] } : current)}>
                <option value="user">{isZh ? "个人" : "User"}</option>
                <option value="chat">{isZh ? "群" : "Chat"}</option>
              </SelectInput>
            </Field>

            {editingSubscription.recipient_type === "user" ? (
              <>
                <Field label={isZh ? "本地账号" : "App user"}>
                  <SelectInput value={editingSubscription.app_user_id} onChange={(event) => syncUserTarget(event.target.value)}>
                    <option value="">{isZh ? "请选择" : "Select"}</option>
                    {users.map((user) => <option key={user.id} value={user.id}>{user.display_name}</option>)}
                  </SelectInput>
                </Field>
                <Field label="Feishu user id">
                  <TextInput value={editingSubscription.feishu_user_id} onChange={(event) => setEditingSubscription((current) => current ? { ...current, feishu_user_id: event.target.value } : current)} />
                </Field>
              </>
            ) : (
              <Field label="Feishu chat id">
                <TextInput value={editingSubscription.feishu_chat_id} onChange={(event) => setEditingSubscription((current) => current ? { ...current, feishu_chat_id: event.target.value } : current)} />
              </Field>
            )}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setEditingSubscription(null)} className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {isZh ? "取消" : "Cancel"}
            </button>
            <Button type="button" onClick={() => void saveSubscription()}>
              {busyKey ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isZh ? "保存" : "Save"}
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

function formatReportStatus(report: AgentReport, isZh: boolean) {
  if (report.status === "failed") return isZh ? "生成失败" : "Generation failed";
  if (report.status === "sent") return isZh ? "已投递" : "Delivered";
  if (report.status === "generated") return isZh ? "已生成" : "Generated";
  return isZh ? "未生成" : "Not generated";
}

function formatDeliverySummary(summary: AgentReport["delivery_summary"] | undefined) {
  if (!summary || summary.recipient_count === 0) return "Not sent";
  return `${summary.recipient_count} recipients / ${summary.sent_count} sent / ${summary.pending_count} pending / ${summary.failed_count} failed`;
}

function regenerateLabel(isZh: boolean) {
  return isZh ? "重新生成" : "Regenerate";
}

function templatePreviewLabel(isZh: boolean) {
  return isZh ? "模板预览" : "Template";
}

function redeliverLabel(isZh: boolean) {
  return isZh ? "重新投递" : "Redeliver";
}

function retryFailedLabel(isZh: boolean) {
  return isZh ? "仅补失败" : "Retry failed";
}

function dispatchPendingLabel(isZh: boolean) {
  return isZh ? "发送待发送" : "Dispatch pending";
}

function confirmRedeliverMessage(isZh: boolean) {
  return isZh
    ? "这会按当前订阅对象重新进入待发送，已收到的对象也可能再次收到。是否继续？"
    : "This will requeue delivery for the current subscriptions and may send duplicate messages to recipients who already received it. Continue?";
}

function confirmRetryFailedMessage(isZh: boolean) {
  return isZh
    ? "这只会重试失败投递记录，已发送和待发送记录不会变动。是否继续？"
    : "This will only retry failed deliveries. Sent and pending deliveries will not be changed. Continue?";
}

function subscriptionRecipientLabel(subscription: AgentReportSubscription, usersById: Map<string, AppUser>) {
  if (subscription.recipient_type === "chat") return subscription.feishu_chat_id ?? "-";
  return usersById.get(subscription.app_user_id ?? "")?.display_name ?? subscription.feishu_user_id ?? "-";
}

function recipientLabel(recipient: AgentReportRecipient) {
  return recipient.feishu_chat_id ?? recipient.feishu_user_id ?? recipient.app_user_id ?? recipient.id;
}

function hasCardPayload(report: AgentReport) {
  return Boolean(report.feishu_card_json && Object.keys(report.feishu_card_json).length > 0);
}

function withSeconds(value: string) {
  return value.length === 5 ? `${value}:00` : value;
}

function Dialog({
  title,
  closeLabel,
  onClose,
  children,
}: {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-lg bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button type="button" aria-label={closeLabel} onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 px-3 py-2">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-sm text-slate-800">{value}</div>
    </div>
  );
}
