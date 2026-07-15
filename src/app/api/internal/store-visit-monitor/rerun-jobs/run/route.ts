import { requireAdminSession } from "@/lib/auth-session";
import { readRequestBody } from "@/lib/request";
import {
  failStoreVisitRerunJob,
  runStoreVisitRerunJob,
} from "@/lib/store-visit-rerun-jobs";

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

export async function POST(request: Request) {
  const authResponse = await requireCronSecretOrAdmin(request);
  if (authResponse) return authResponse;

  const { body } = await readRequestBody(request).catch(() => ({ body: {} }));
  const jobId = clean((body as Record<string, unknown>).job_id);
  try {
    const result = await runStoreVisitRerunJob({ jobId: jobId || null, requestUrl: request.url });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (jobId) {
      try {
        await failStoreVisitRerunJob({ jobId, message });
      } catch {}
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
