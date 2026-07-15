import { requireAdminSession } from "@/lib/auth-session";
import { refreshStoreVisitRerunJobProgress } from "@/lib/store-visit-rerun-jobs";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;

  try {
    const { jobId } = await ctx.params;
    const job = await refreshStoreVisitRerunJobProgress({ jobId });
    return Response.json({ job });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
