import { revalidatePath } from "next/cache";
import { generateAgentReport, listAgentReports } from "@/lib/agent-reports";
import { normalizeScopeIdInput } from "@/lib/agent-report-route-inputs";
import { requireAdminSession } from "@/lib/auth-session";
import { resolveDataScopeForSession } from "@/lib/data-scope";
import { isSystemAdminRole } from "@/lib/page-permissions";
import { readRequestBody } from "@/lib/request";
import type { AgentReportFamily, AgentReportScopeType, AgentReportStatus } from "@/lib/types";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function readReportFamily(value: unknown): AgentReportFamily | null {
  const reportType = clean(value);
  return reportType === "daily" || reportType === "weekly" || reportType === "monthly" ? reportType : null;
}

function readScopeType(value: unknown): AgentReportScopeType | null {
  const scopeType = clean(value);
  return scopeType === "global" || scopeType === "organization" || scopeType === "user" ? scopeType : null;
}

function readStatus(value: unknown): AgentReportStatus | null {
  const status = clean(value);
  return status === "draft" || status === "generated" || status === "sent" || status === "failed" ? status : null;
}

function readBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  const text = clean(value).toLowerCase();
  return text === "true" || text === "1" || text === "yes";
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const result = await listAgentReports({
      reportDefinitionCode: clean(searchParams.get("report_definition_code")) || undefined,
      reportFamily: readReportFamily(searchParams.get("report_family") ?? searchParams.get("report_type")) ?? undefined,
      scopeType: readScopeType(searchParams.get("scope_type")) ?? undefined,
      scopeId: normalizeScopeIdInput(searchParams.get("scope_id")) ?? undefined,
      status: readStatus(searchParams.get("status")) ?? undefined,
      periodStart: clean(searchParams.get("period_start")) || undefined,
      limit: Number(searchParams.get("limit") ?? 50),
    });
    return Response.json({ reports: result.data, error: result.error, demo: result.isDemo }, { status: result.error ? 500 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;

    const { body } = await readRequestBody(request);
    const reportDefinitionCode = clean(body.report_definition_code) || null;
    const reportFamily = readReportFamily(body.report_family ?? body.report_type);
    const periodAnchor = clean(body.period_anchor);
    const scopeType = readScopeType(body.scope_type);
    const scopeId = normalizeScopeIdInput(body.scope_id);
    const force = readBoolean(body.force);

    if (!reportDefinitionCode && !reportFamily) return Response.json({ error: "Missing report_definition_code" }, { status: 400 });
    if (!periodAnchor) return Response.json({ error: "Missing period_anchor" }, { status: 400 });
    if (!scopeType) return Response.json({ error: "Missing valid scope_type" }, { status: 400 });
    if (scopeType !== "global" && !scopeId) return Response.json({ error: "Missing scope_id" }, { status: 400 });

    const dataScope = await resolveDataScopeForSession(auth.session);
    if (!isSystemAdminRole(auth.session.role)) {
      if (scopeType === "global") {
        return Response.json({ error: "Global report scope requires admin" }, { status: 403 });
      }
      if (scopeType === "organization") {
        if (dataScope.mode !== "organization" || !scopeId || !dataScope.organizationIds.includes(scopeId)) {
          return Response.json({ error: "Organization is outside your data scope" }, { status: 403 });
        }
      }
    }

    const result = await generateAgentReport({
      reportDefinitionCode: reportDefinitionCode ?? undefined,
      reportType: reportFamily ?? undefined,
      periodAnchor,
      scopeType,
      scopeId,
      force,
    });
    if (!result.error) {
      revalidatePath("/zh/report-center");
      revalidatePath("/en/report-center");
    }
    return Response.json({ report: result.data, error: result.error, demo: result.isDemo }, { status: result.error ? 500 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
