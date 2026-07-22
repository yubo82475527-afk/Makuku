import { requireAdminSession } from "@/lib/auth-session";
import { failOperatorPriceReviewExportJob, runOperatorPriceReviewExportJob } from "@/lib/operator-price-review-export-jobs";
import { readRequestBody } from "@/lib/request";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function hasCronSecret(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = clean(header.match(/^Bearer\s+(.+)$/i)?.[1] ?? header);
  const secret = clean(process.env.CRON_SECRET);
  return Boolean(secret && token === secret);
}

export async function POST(request: Request) {
  if (!hasCronSecret(request)) {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;
  }
  const { body } = await readRequestBody(request).catch(() => ({ body: {} }));
  const jobId = clean((body as Record<string, unknown>).job_id);
  if (!jobId) return Response.json({ error: "job_id is required" }, { status: 400 });
  try {
    return Response.json(await runOperatorPriceReviewExportJob({ jobId }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    try { await failOperatorPriceReviewExportJob({ jobId, message }); } catch {}
    return Response.json({ error: message }, { status: 500 });
  }
}
