import { requireAdminSession } from "@/lib/auth-session";
import {
  getStoreVisitMonitorExportDownloadPath,
  loadStoreVisitMonitorExportJob,
} from "@/lib/store-visit-monitor-export-jobs";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;

  try {
    const { jobId } = await ctx.params;
    const job = await loadStoreVisitMonitorExportJob({ jobId, requestedBy: auth.session.id });
    return Response.json({
      job: {
        id: job.id,
        status: job.status,
        total_rows: job.total_rows,
        exported_rows: job.exported_rows,
        error_message: job.error_message,
        created_at: job.created_at,
        started_at: job.started_at,
        completed_at: job.completed_at,
        download_url: job.status === "completed" ? getStoreVisitMonitorExportDownloadPath(job.id) : null,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 404 });
  }
}
