import { getAgentReportById } from "@/lib/agent-reports";
import { requireAdminSession } from "@/lib/auth-session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, ctx: RouteContext) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;

    const { id } = await ctx.params;
    const result = await getAgentReportById(id);
    if (!result.data) {
      return Response.json({ error: result.error ?? "Agent report not found", demo: result.isDemo }, { status: 404 });
    }
    return Response.json({ report: result.data, recipients: result.data.recipients ?? [], error: result.error, demo: result.isDemo }, { status: result.error ? 500 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
