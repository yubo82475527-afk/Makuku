import { requireAdminSession } from "@/lib/auth-session";
import {
  createPriceSnapshotExportSignedUrl,
  getPriceSnapshotExportDownloadName,
  loadPriceSnapshotExportJob,
} from "@/lib/price-snapshot-export-jobs";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;

  try {
    const { jobId } = await ctx.params;
    const job = await loadPriceSnapshotExportJob({ jobId, requestedBy: auth.session.id });
    if (job.status !== "completed" || !job.file_path) {
      return Response.json({ error: "Export file is not ready" }, { status: 409 });
    }
    const signedUrl = await createPriceSnapshotExportSignedUrl({
      filePath: job.file_path,
      downloadName: getPriceSnapshotExportDownloadName(job),
    });
    return Response.redirect(signedUrl, 302);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 404 });
  }
}
