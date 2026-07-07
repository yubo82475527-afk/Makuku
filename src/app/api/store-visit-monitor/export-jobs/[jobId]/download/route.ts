import { requireAdminSession } from "@/lib/auth-session";
import {
  downloadStoreVisitMonitorExportFile,
  getStoreVisitMonitorExportDownloadName,
  loadStoreVisitMonitorExportJob,
} from "@/lib/store-visit-monitor-export-jobs";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;

  try {
    const { jobId } = await ctx.params;
    const job = await loadStoreVisitMonitorExportJob({ jobId, requestedBy: auth.session.id });
    if (job.status !== "completed" || !job.file_path) {
      return Response.json({ error: "Export file is not ready" }, { status: 409 });
    }
    const file = await downloadStoreVisitMonitorExportFile({ filePath: job.file_path });
    return new Response(await file.arrayBuffer(), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${getStoreVisitMonitorExportDownloadName(job)}"`,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 404 });
  }
}
