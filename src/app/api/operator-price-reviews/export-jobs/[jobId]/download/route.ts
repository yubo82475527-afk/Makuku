import { requireAdminSession } from "@/lib/auth-session";
import {
  createOperatorPriceReviewExportSignedUrl,
  getOperatorPriceReviewExportDownloadName,
  loadOperatorPriceReviewExportJob,
} from "@/lib/operator-price-review-export-jobs";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;
  try {
    const { jobId } = await ctx.params;
    const job = await loadOperatorPriceReviewExportJob({ jobId, requestedBy: auth.session.id });
    if (job.status !== "completed" || !job.file_path) {
      return Response.json({ error: "Export file is not ready" }, { status: 409 });
    }
    const signedUrl = await createOperatorPriceReviewExportSignedUrl({
      filePath: job.file_path,
      downloadName: getOperatorPriceReviewExportDownloadName(job),
    });
    return Response.redirect(signedUrl, 302);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 404 });
  }
}
