import { after } from "next/server";
import { requireAdminSession } from "@/lib/auth-session";
import {
  createOperatorPriceReviewExportJob,
  getOperatorPriceReviewExportDownloadPath,
  listOperatorPriceReviewExportJobs,
  normalizeOperatorPriceReviewExportFilters,
  triggerOperatorPriceReviewExportJobRunner,
} from "@/lib/operator-price-review-export-jobs";
import { readRequestBody } from "@/lib/request";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;
  try {
    const jobs = await listOperatorPriceReviewExportJobs({ requestedBy: auth.session.id });
    return Response.json({ jobs: jobs.map((job) => ({
      id: job.id,
      status: job.status,
      total_rows: job.total_rows,
      exported_rows: job.exported_rows,
      error_message: job.error_message,
      created_at: job.created_at,
      started_at: job.started_at,
      completed_at: job.completed_at,
      requested_by: job.requested_by,
      download_url: job.status === "completed" ? getOperatorPriceReviewExportDownloadPath(job.id) : null,
    })) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;
  try {
    const { body } = await readRequestBody(request).catch(() => ({ body: {} }));
    const payload = body as Record<string, unknown>;
    const job = await createOperatorPriceReviewExportJob({
      filters: normalizeOperatorPriceReviewExportFilters(payload.filters as Record<string, unknown> ?? {}),
      locale: String(payload.locale ?? "zh").trim() || "zh",
      requestedBy: auth.session.id,
    });
    after(() => triggerOperatorPriceReviewExportJobRunner({ requestUrl: request.url, jobId: job.id }));
    return Response.json({ job: {
      id: job.id,
      status: job.status,
      total_rows: job.total_rows,
      exported_rows: job.exported_rows,
      error_message: job.error_message,
    } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
