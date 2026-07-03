import { revalidatePath } from "next/cache";
import { dispatchPendingAgentReportRecipients } from "@/lib/agent-report-delivery";
import { dispatchDueAgentReports } from "@/lib/agent-report-subscriptions";
import { requireAdminSession } from "@/lib/auth-session";
import { readRequestBody } from "@/lib/request";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function readBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  const text = clean(value).toLowerCase();
  return text === "true" || text === "1" || text === "yes";
}

function readAuthorizationToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const bearerMatch = header.match(/^Bearer\s+(.+)$/i);
  return clean(bearerMatch ? bearerMatch[1] : header);
}

function requireCronSecret(request: Request) {
  const secret = clean(process.env.CRON_SECRET);
  if (!secret) {
    return Response.json({ error: "Missing CRON_SECRET" }, { status: 500 });
  }

  if (readAuthorizationToken(request) !== secret) {
    return Response.json({ error: "Unauthorized cron request" }, { status: 401 });
  }

  return null;
}

async function runDueSubscriptions(input: {
  runAt?: string;
  force: boolean;
}) {
  const result = await dispatchDueAgentReports({
    runAt: input.runAt || undefined,
    force: input.force,
  });

  const reportIds = [...new Set(result.data.map((job) => job.report_id).filter((value): value is string => Boolean(value)))];
  const deliveries: Array<{
    report_id: string;
    recipient_count: number;
    error: string | null;
  }> = [];
  let firstError = result.error;

  for (const reportId of reportIds) {
    const dispatchResult = await dispatchPendingAgentReportRecipients(reportId);
    if (dispatchResult.error && !firstError) firstError = dispatchResult.error;
    deliveries.push({
      report_id: reportId,
      recipient_count: dispatchResult.data.length,
      error: dispatchResult.error,
    });
  }

  if (!firstError) {
    revalidatePath("/zh/report-center");
    revalidatePath("/en/report-center");
  }

  return Response.json(
    {
      jobs: result.data,
      deliveries,
      error: firstError,
      demo: result.isDemo,
    },
    { status: firstError ? 400 : 200 },
  );
}

export async function GET(request: Request) {
  const authResponse = requireCronSecret(request);
  if (authResponse) return authResponse;

  const url = new URL(request.url);
  return runDueSubscriptions({
    runAt: clean(url.searchParams.get("run_at")),
    force: readBoolean(url.searchParams.get("force")),
  });
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;

    const { body } = await readRequestBody(request);
    return runDueSubscriptions({
      runAt: clean(body.run_at),
      force: readBoolean(body.force),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
