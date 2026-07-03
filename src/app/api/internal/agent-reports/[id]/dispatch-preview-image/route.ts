import { dispatchReportTemplatePreviewImage } from "@/lib/agent-report-delivery";
import { requireAdminSession } from "@/lib/auth-session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, ctx: RouteContext) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;

    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({})) as { locale?: string };
    const result = await dispatchReportTemplatePreviewImage(id, body.locale === "en" ? "en" : "zh");
    return Response.json(result, { status: result.error ? 400 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}

