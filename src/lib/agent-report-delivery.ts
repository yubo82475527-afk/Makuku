import { renderFeishuCard } from "./agent-reports.ts";
import { sendFeishuCardMessage } from "./feishu.ts";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "./supabase.ts";
import type { AgentReport, AgentReportContentJson, AgentReportMetricRow, AgentReportMetricsJson, AgentReportRecipient } from "./types.ts";

type QueryResult<T> = {
  data: T;
  error: string | null;
  isDemo: boolean;
};

async function getAgentReportCard(reportId: string) {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("agent_reports")
    .select("id,feishu_card_json,content_json,metrics_json")
    .eq("id", reportId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Agent report not found");
  return data as Pick<AgentReport, "id" | "feishu_card_json" | "content_json" | "metrics_json">;
}

function resolveReportCard(report: Pick<AgentReport, "id" | "feishu_card_json" | "content_json" | "metrics_json">) {
  const content = report.content_json as AgentReportContentJson | null;
  const metrics = report.metrics_json as AgentReportMetricsJson | null;
  const rows = Array.isArray(metrics?.table_rows) ? metrics.table_rows as AgentReportMetricRow[] : [];
  if (content && rows.length > 0) {
    return renderFeishuCard(content, rows);
  }
  return report.feishu_card_json;
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

export async function dispatchPendingAgentReportRecipients(reportId: string): Promise<QueryResult<AgentReportRecipient[]>> {
  if (!hasSupabaseServiceConfig()) return { data: [], error: null, isDemo: true };

  const report = await getAgentReportCard(reportId);
  const pendingRecipients = await listPendingRecipients(reportId);
  const updatedRecipients: AgentReportRecipient[] = [];
  let firstError: string | null = null;

  for (const recipient of pendingRecipients) {
    try {
      const target = resolveRecipientTarget(recipient);
      const card = resolveReportCard(report);
      const messageId = await sendFeishuCardMessage({
        receiveIdType: target.receiveIdType,
        receiveId: target.receiveId,
        card,
      });
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
