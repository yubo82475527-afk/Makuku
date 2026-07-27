import { requireAdminSession } from "@/lib/auth-session";
import {
  failPriceIndexExportJob,
  runPriceIndexExportJob,
} from "@/lib/price-index-export-jobs";
import { readRequestBody } from "@/lib/request";

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

async function runAndRespond(jobId: string) {
  try {
    return Response.json(await runPriceIndexExportJob({ jobId }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    try {
      await failPriceIndexExportJob({ jobId, message });
    } catch {}
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authResponse = await requireCronSecretOrAdmin(request);
  if (authResponse) return authResponse;

  const { body } = await readRequestBody(request).catch(() => ({ body: {} }));
  const jobId = clean((body as Record<string, unknown>).job_id);
  if (!jobId) return Response.json({ error: "job_id is required" }, { status: 400 });
  return runAndRespond(jobId);
}
