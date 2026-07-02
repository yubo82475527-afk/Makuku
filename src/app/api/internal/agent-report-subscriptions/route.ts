import { revalidatePath } from "next/cache";
import {
  createAgentReportSubscription,
  listAgentReportSubscriptions,
} from "@/lib/agent-report-subscriptions";
import { requireAdminSession } from "@/lib/auth-session";
import { readRequestBody } from "@/lib/request";
import type { AgentReportFamily, AgentReportRecipientType, AgentReportScopeType } from "@/lib/types";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function readReportFamily(value: unknown): AgentReportFamily | null {
  const reportType = clean(value);
  return reportType === "daily" || reportType === "weekly" || reportType === "monthly" ? reportType : null;
}

function readRecipientType(value: unknown): AgentReportRecipientType | null {
  const recipientType = clean(value);
  return recipientType === "user" || recipientType === "chat" ? recipientType : null;
}

function readScopeType(value: unknown): AgentReportScopeType | null {
  const scopeType = clean(value);
  return scopeType === "global" || scopeType === "organization" || scopeType === "user" ? scopeType : null;
}

function readEnabled(value: unknown) {
  const text = clean(value).toLowerCase();
  if (!text) return undefined;
  return text === "true" || text === "1" || text === "yes";
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const result = await listAgentReportSubscriptions({
      reportDefinitionCode: clean(searchParams.get("report_definition_code")) || undefined,
      reportFamily: readReportFamily(searchParams.get("report_family") ?? searchParams.get("report_type")) ?? undefined,
      recipientType: readRecipientType(searchParams.get("recipient_type")) ?? undefined,
      scopeType: readScopeType(searchParams.get("scope_type")) ?? undefined,
      enabled: readEnabled(searchParams.get("enabled")),
      limit: Number(searchParams.get("limit") ?? 100),
    });
    return Response.json({ subscriptions: result.data, error: result.error, demo: result.isDemo }, { status: result.error ? 500 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;

    const { body } = await readRequestBody(request);
    const result = await createAgentReportSubscription(body);
    if (!result.error) {
      revalidatePath("/zh/report-center");
      revalidatePath("/en/report-center");
    }
    return Response.json({ subscription: result.data, error: result.error, demo: result.isDemo }, { status: result.error ? 400 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
