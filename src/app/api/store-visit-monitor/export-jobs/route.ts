import { after } from "next/server";
import { requireAdminSession } from "@/lib/auth-session";
import { readRequestBody } from "@/lib/request";
import {
  createStoreVisitMonitorExportJob,
  getStoreVisitMonitorExportDownloadPath,
  getStoreVisitMonitorExportView,
  listStoreVisitMonitorExportJobs,
  normalizeStoreVisitMonitorExportFilters,
  triggerStoreVisitMonitorExportJobRunner,
} from "@/lib/store-visit-monitor-export-jobs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;

  try {
    const jobs = await listStoreVisitMonitorExportJobs({ requestedBy: auth.session.id });
    return Response.json({
      jobs: jobs.map((job) => ({
        id: job.id,
        status: job.status,
        total_rows: job.total_rows,
        exported_rows: job.exported_rows,
        error_message: job.error_message,
        created_at: job.created_at,
        started_at: job.started_at,
        completed_at: job.completed_at,
        requested_by: job.requested_by,
        export_view: getStoreVisitMonitorExportView(job.filters),
        download_url: job.status === "completed" ? getStoreVisitMonitorExportDownloadPath(job.id) : null,
      })),
    });
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
    const locale = String(payload.locale ?? "zh").trim() || "zh";
    const filters = normalizeStoreVisitMonitorExportFilters(payload.filters as Record<string, unknown> ?? {});
    const job = await createStoreVisitMonitorExportJob({
      filters,
      locale,
      requestedBy: auth.session.id,
    });
    after(() => triggerStoreVisitMonitorExportJobRunner({ requestUrl: request.url, jobId: job.id }));
    return Response.json({
      job: {
        id: job.id,
        status: job.status,
        total_rows: job.total_rows,
        exported_rows: job.exported_rows,
        error_message: job.error_message,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
