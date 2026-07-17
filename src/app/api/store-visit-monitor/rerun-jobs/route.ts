import { after } from "next/server";
import { requireAdminSession } from "@/lib/auth-session";
import { readRequestBody } from "@/lib/request";
import { normalizeMatchingRerunRequest } from "@/lib/store-visit-matching-rerun";
import {
  createStoreVisitRerunJob,
  listStoreVisitRerunJobs,
  STORE_VISIT_RERUN_STALE_MS,
  triggerStoreVisitRerunJobRunner,
} from "@/lib/store-visit-rerun-jobs";
import type { StoreVisitRerunJob } from "@/lib/types";

export const dynamic = "force-dynamic";

function isActiveRerunJob(job: StoreVisitRerunJob) {
  return job.status === "queued" || job.status === "running";
}

function shouldWakeRerunJob(job: StoreVisitRerunJob) {
  if (!isActiveRerunJob(job)) return false;
  if (job.status === "queued") return true;
  const updatedAt = new Date(job.updated_at).getTime();
  return Number.isNaN(updatedAt) || Date.now() - updatedAt > STORE_VISIT_RERUN_STALE_MS;
}

export async function GET(request: Request) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;

  try {
    const jobs = await listStoreVisitRerunJobs({ requestedBy: auth.session.id });
    for (const job of jobs.filter(shouldWakeRerunJob)) {
      after(() => triggerStoreVisitRerunJobRunner({
        requestUrl: request.url,
        jobId: job.id,
        detached: true,
      }));
    }
    return Response.json({ jobs });
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
    const mode = payload.mode === "ai_reanalysis" ? "ai_reanalysis" : "match_only";
    const selector = normalizeMatchingRerunRequest(payload);
    const job = await createStoreVisitRerunJob({
      mode,
      selector,
      locale: String(payload.locale ?? "zh"),
      requestedBy: auth.session.id,
    });
    after(() => triggerStoreVisitRerunJobRunner({ requestUrl: request.url, jobId: job.id }));
    return Response.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /exactly one|valid YYYY-MM-DD|cannot be after|No Visits found/.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
