import { revalidatePath } from "next/cache";
import {
  deleteAgentReportSubscription,
  updateAgentReportSubscription,
} from "@/lib/agent-report-subscriptions";
import { requireAdminSession } from "@/lib/auth-session";
import { readRequestBody } from "@/lib/request";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, ctx: RouteContext) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;

    const { id } = await ctx.params;
    const { body } = await readRequestBody(request);
    const result = await updateAgentReportSubscription(id, body);
    if (!result.error) {
      revalidatePath("/zh/report-center");
      revalidatePath("/en/report-center");
    }
    return Response.json({ subscription: result.data, error: result.error, demo: result.isDemo }, { status: result.error ? 400 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}

export async function DELETE(request: Request, ctx: RouteContext) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;

    const { id } = await ctx.params;
    const result = await deleteAgentReportSubscription(id);
    if (!result.error) {
      revalidatePath("/zh/report-center");
      revalidatePath("/en/report-center");
    }
    return Response.json({ deleted: result.data, error: result.error, demo: result.isDemo }, { status: result.error ? 400 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
