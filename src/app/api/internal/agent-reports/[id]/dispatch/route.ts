import { revalidatePath } from "next/cache";
import { dispatchPendingAgentReportRecipients } from "@/lib/agent-report-delivery";
import { requireAdminSession } from "@/lib/auth-session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, ctx: RouteContext) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;

    const { id } = await ctx.params;
    const result = await dispatchPendingAgentReportRecipients(id);
    if (!result.error) {
      revalidatePath("/zh/report-center");
      revalidatePath("/en/report-center");
    }
    return Response.json({ recipients: result.data, error: result.error, demo: result.isDemo }, { status: result.error ? 400 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
