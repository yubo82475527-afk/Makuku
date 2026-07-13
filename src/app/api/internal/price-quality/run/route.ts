import { requireAdminSession } from "@/lib/auth-session";
import { runPriceQualityGate } from "@/lib/price-quality-gate-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function readAuthorizationToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const bearerMatch = header.match(/^Bearer\s+(.+)$/i);
  return clean(bearerMatch ? bearerMatch[1] : header);
}

function hasCronSecret(request: Request) {
  const secret = clean(process.env.CRON_SECRET ?? process.env.INTERNAL_JOB_SECRET);
  return Boolean(secret && readAuthorizationToken(request) === secret);
}

async function requireCronSecretOrAdmin(request: Request) {
  if (hasCronSecret(request)) return null;
  const auth = await requireAdminSession(request);
  return auth.response;
}

async function runAndRespond() {
  const result = await runPriceQualityGate();
  return Response.json(result);
}

export async function GET(request: Request) {
  const authResponse = await requireCronSecretOrAdmin(request);
  if (authResponse) return authResponse;
  return runAndRespond();
}

export async function POST(request: Request) {
  const authResponse = await requireCronSecretOrAdmin(request);
  if (authResponse) return authResponse;
  return runAndRespond();
}
