import { revalidatePath } from "next/cache";
import { redeliverAgentReport } from "@/lib/agent-report-subscriptions";
import { dispatchPendingAgentReportRecipients } from "@/lib/agent-report-delivery";
import { getAgentReportById } from "@/lib/agent-reports";
import { requireAdminSession } from "@/lib/auth-session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, ctx: RouteContext) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;

    const { id } = await ctx.params;
    const reportResult = await getAgentReportById(id);
    if (reportResult.error || !reportResult.data) {
      return Response.json({ error: reportResult.error ?? "Agent report not found", demo: reportResult.isDemo }, { status: reportResult.error ? 400 : 404 });
    }

    const rebuilt = await redeliverAgentReport({ report: reportResult.data });
    if (rebuilt.error) {
      return Response.json({ recipients: rebuilt.data, error: rebuilt.error, demo: rebuilt.isDemo }, { status: 400 });
    }

    const dispatched = await dispatchPendingAgentReportRecipients(reportResult.data.id);
    if (!dispatched.error) {
      revalidatePath("/zh/report-center");
      revalidatePath("/en/report-center");
    }
    return Response.json({ recipients: dispatched.data, error: dispatched.error, demo: dispatched.isDemo }, { status: dispatched.error ? 400 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
