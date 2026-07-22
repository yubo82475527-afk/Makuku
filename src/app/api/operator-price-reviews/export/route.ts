import { after } from "next/server";
import { requireAdminSession } from "@/lib/auth-session";
import {
  createOperatorPriceReviewExportJob,
  normalizeOperatorPriceReviewExportFilters,
  triggerOperatorPriceReviewExportJobRunner,
} from "@/lib/operator-price-review-export-jobs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;

  try {
    const url = new URL(request.url);
    const job = await createOperatorPriceReviewExportJob({
      filters: normalizeOperatorPriceReviewExportFilters({
        state: url.searchParams.get("state"),
        date_from: url.searchParams.get("date_from"),
        date_to: url.searchParams.get("date_to"),
        visit_code: url.searchParams.get("visit_code"),
        reason: url.searchParams.get("reason"),
      }),
      locale: url.searchParams.get("locale") === "en" ? "en" : "zh",
      requestedBy: auth.session.id,
    });
    after(() => triggerOperatorPriceReviewExportJobRunner({ requestUrl: request.url, jobId: job.id }));
    return Response.json({ job_id: job.id, status: job.status }, { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
