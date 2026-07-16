import { after } from "next/server";
import { requireAdminSession } from "@/lib/auth-session";
import { triggerPriceQualityGateRunner } from "@/lib/price-quality-gate-jobs";
import { readRequestBody } from "@/lib/request";
import {
  runStoreVisitAiJob,
  triggerStoreVisitAiJobRunner,
} from "@/lib/store-visit-ai-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function readAuthorizationToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const bearerMatch = header.match(/^Bearer\s+(.+)$/i);
  return clean(bearerMatch ? bearerMatch[1] : header);
}

function hasCronSecret(request: Request) {
  const secret = clean(process.env.CRON_SECRET);
  return Boolean(secret && readAuthorizationToken(request) === secret);
}

async function requireCronSecretOrAdmin(request: Request) {
  if (hasCronSecret(request)) return null;
  const auth = await requireAdminSession(request);
  return auth.response;
}

async function runAndRespond(request: Request, jobId?: string | null) {
  const result = await runStoreVisitAiJob({ jobId });
  const unfinishedJob = result.job as { id: string } | null;
  if (unfinishedJob && result.remaining_count > 0) {
    after(() => triggerStoreVisitAiJobRunner({ requestUrl: request.url, jobId: unfinishedJob.id }));
  } else if (!jobId && result.processed > 0) {
    after(() => triggerStoreVisitAiJobRunner({ requestUrl: request.url }));
  }
  if (result.processed > 0) {
    after(() => triggerPriceQualityGateRunner({ requestUrl: request.url }));
  }
  return Response.json(result);
}

export async function GET(request: Request) {
  const authResponse = await requireCronSecretOrAdmin(request);
  if (authResponse) return authResponse;

  const url = new URL(request.url);
  return runAndRespond(request, clean(url.searchParams.get("job_id")) || null);
}

export async function POST(request: Request) {
  const authResponse = await requireCronSecretOrAdmin(request);
  if (authResponse) return authResponse;

  const { body } = await readRequestBody(request).catch(() => ({ body: {} }));
  return runAndRespond(request, clean((body as Record<string, unknown>).job_id) || null);
}
