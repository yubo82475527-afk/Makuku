import { renderFeishuCard } from "./agent-reports.ts";
import { getAgentReportById } from "./agent-reports.ts";
import { sendFeishuCardMessage, sendFeishuImageMessage, uploadFeishuMessageImage } from "./feishu.ts";
import { renderReportTemplatePreviewPng } from "./report-template-render.ts";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "./supabase.ts";
import type { AgentReport, AgentReportContentJson, AgentReportMetricRow, AgentReportMetricsJson, AgentReportRecipient } from "./types.ts";

type QueryResult<T> = {
  data: T;
  error: string | null;
  isDemo: boolean;
};

type FormalReportDeliveryKind = "card" | "image";

function resolveReportCard(report: Pick<AgentReport, "id" | "feishu_card_json" | "content_json" | "metrics_json">) {
  const content = report.content_json as AgentReportContentJson | null;
  const metrics = report.metrics_json as AgentReportMetricsJson | null;
  const rows = Array.isArray(metrics?.table_rows) ? metrics.table_rows as AgentReportMetricRow[] : [];
  if (content && rows.length > 0) {
    return renderFeishuCard(content, rows);
  }
  return report.feishu_card_json;
}

export function resolveFormalReportDeliveryKind(reportDefinitionCode: string): FormalReportDeliveryKind {
  return reportDefinitionCode === "daily_price_country" ? "image" : "card";
}

async function listPendingRecipients(reportId: string) {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("agent_report_recipients")
    .select("*")
    .eq("report_id", reportId)
    .eq("send_status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AgentReportRecipient[];
}

async function updateRecipient(id: string, patch: Partial<AgentReportRecipient>) {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("agent_report_recipients")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as AgentReportRecipient;
}

async function syncReportDeliveryStatus(reportId: string) {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("agent_report_recipients")
    .select("send_status")
    .eq("report_id", reportId);
  if (error) throw new Error(error.message);

  const recipients = (data ?? []) as Array<Pick<AgentReportRecipient, "send_status">>;
  let reportStatus: AgentReport["status"] = "generated";
  if (recipients.length > 0 && recipients.every((recipient) => recipient.send_status === "sent")) {
    reportStatus = "sent";
  } else if (recipients.some((recipient) => recipient.send_status === "failed")) {
    reportStatus = "failed";
  }

  const { error: updateError } = await supabase
    .from("agent_reports")
    .update({
      status: reportStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reportId);
  if (updateError) throw new Error(updateError.message);
}

function resolveRecipientTarget(recipient: AgentReportRecipient) {
  if (recipient.delivery_channel === "chat") {
    if (!recipient.feishu_chat_id?.trim()) throw new Error("Missing feishu_chat_id");
    return {
      receiveIdType: "chat_id" as const,
      receiveId: recipient.feishu_chat_id.trim(),
    };
  }
  if (!recipient.feishu_user_id?.trim()) throw new Error("Missing feishu_user_id");
  return {
    receiveIdType: "open_id" as const,
    receiveId: recipient.feishu_user_id.trim(),
  };
}

async function resolveFormalReportDeliveryPayload(report: AgentReport) {
  if (resolveFormalReportDeliveryKind(report.report_definition_code) === "image") {
    const png = await renderReportTemplatePreviewPng(report, "zh");
    const imageKey = await uploadFeishuMessageImage({
      bytes: new Uint8Array(png),
      filename: `${report.report_definition_code}-${report.period_start}.png`,
    });
    return {
      kind: "image" as const,
      send: async (recipient: AgentReportRecipient) => {
        const target = resolveRecipientTarget(recipient);
        return sendFeishuImageMessage({
          receiveIdType: target.receiveIdType,
          receiveId: target.receiveId,
          imageKey,
        });
      },
    };
  }

  const card = resolveReportCard(report);
  return {
    kind: "card" as const,
    send: async (recipient: AgentReportRecipient) => {
      const target = resolveRecipientTarget(recipient);
      return sendFeishuCardMessage({
        receiveIdType: target.receiveIdType,
        receiveId: target.receiveId,
        card,
      });
    },
  };
}

export async function dispatchPendingAgentReportRecipients(reportId: string): Promise<QueryResult<AgentReportRecipient[]>> {
  if (!hasSupabaseServiceConfig()) return { data: [], error: null, isDemo: true };

  const reportResult = await getAgentReportById(reportId);
  if (reportResult.error || !reportResult.data) {
    return {
      data: [],
      error: reportResult.error ?? "Agent report not found",
      isDemo: reportResult.isDemo,
    };
  }

  const report = reportResult.data;
  const pendingRecipients = await listPendingRecipients(reportId);
  const delivery = await resolveFormalReportDeliveryPayload(report);
  const updatedRecipients: AgentReportRecipient[] = [];
  let firstError: string | null = null;

  for (const recipient of pendingRecipients) {
    try {
      const messageId = await delivery.send(recipient);
      updatedRecipients.push(await updateRecipient(recipient.id, {
        send_status: "sent",
        feishu_message_id: messageId,
        sent_at: new Date().toISOString(),
        error_message: null,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown delivery error";
      console.error("dispatchPendingAgentReportRecipients failed", {
        reportId,
        recipientId: recipient.id,
        error: message,
      });
      if (!firstError) firstError = message;
      updatedRecipients.push(await updateRecipient(recipient.id, {
        send_status: "failed",
        error_message: message,
      }));
    }
  }

  await syncReportDeliveryStatus(reportId);
  return { data: updatedRecipients, error: firstError, isDemo: false };
}

export async function dispatchReportTemplatePreviewImage(reportId: string, locale = "zh"): Promise<QueryResult<{ recipient_count: number; sent_count: number }>> {
  if (!hasSupabaseServiceConfig()) return { data: { recipient_count: 0, sent_count: 0 }, error: null, isDemo: true };

  const reportResult = await getAgentReportById(reportId);
  if (reportResult.error || !reportResult.data) {
    return {
      data: { recipient_count: 0, sent_count: 0 },
      error: reportResult.error ?? "Agent report not found",
      isDemo: reportResult.isDemo,
    };
  }

  const recipients = dedupeTemplatePreviewRecipients(reportResult.data.recipients ?? []);
  if (recipients.length === 0) {
    return { data: { recipient_count: 0, sent_count: 0 }, error: "No recipients are available for this report.", isDemo: false };
  }

  const png = await renderReportTemplatePreviewPng(reportResult.data, locale);
  const imageKey = await uploadFeishuMessageImage({
    bytes: new Uint8Array(png),
    filename: `${reportResult.data.report_definition_code}-${reportResult.data.period_start}.png`,
  });

  let firstError: string | null = null;
  let sentCount = 0;
  for (const recipient of recipients) {
    try {
      const target = resolveRecipientTarget(recipient);
      await sendFeishuImageMessage({
        receiveIdType: target.receiveIdType,
        receiveId: target.receiveId,
        imageKey,
      });
      sentCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown template preview delivery error";
      if (!firstError) firstError = message;
      console.error("dispatchReportTemplatePreviewImage failed", {
        reportId,
        recipientId: recipient.id,
        error: message,
      });
    }
  }

  return {
    data: {
      recipient_count: recipients.length,
      sent_count: sentCount,
    },
    error: firstError,
    isDemo: false,
  };
}

function dedupeTemplatePreviewRecipients(recipients: AgentReportRecipient[]) {
  const seen = new Set<string>();
  const unique: AgentReportRecipient[] = [];
  for (const recipient of recipients) {
    const channel = recipient.delivery_channel === "chat" ? "chat" : "user";
    const receiveId = channel === "chat" ? recipient.feishu_chat_id?.trim() : recipient.feishu_user_id?.trim();
    if (!receiveId) continue;
    const key = `${channel}:${receiveId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(recipient);
  }
  return unique;
}
