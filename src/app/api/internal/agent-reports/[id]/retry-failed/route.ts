import { revalidatePath } from "next/cache";
import { getAgentReportById } from "@/lib/agent-reports";
import { retryFailedAgentReport } from "@/lib/agent-report-subscriptions";
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

    const result = await retryFailedAgentReport({ report: reportResult.data });
    if (!result.error) {
      revalidatePath("/zh/report-center");
      revalidatePath("/en/report-center");
    }
    return Response.json({ recipients: result.data, error: result.error, demo: result.isDemo }, { status: result.error ? 400 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
