import { requireAdminSession } from "@/lib/auth-session";
import { refreshPriceQualityBenchmarks } from "@/lib/price-quality-benchmarks";
import { readRequestBody } from "@/lib/request";

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

export async function GET(request: Request) {
  const authResponse = await requireCronSecretOrAdmin(request);
  if (authResponse) return authResponse;
  return Response.json(await refreshPriceQualityBenchmarks());
}

export async function POST(request: Request) {
  const authResponse = await requireCronSecretOrAdmin(request);
  if (authResponse) return authResponse;

  const { body } = await readRequestBody(request).catch(() => ({ body: {} }));
  const benchmarkDate = clean((body as Record<string, unknown>).benchmark_date) || null;
  if (benchmarkDate && !/^\d{4}-\d{2}-\d{2}$/.test(benchmarkDate)) {
    return Response.json({ error: "benchmark_date must use YYYY-MM-DD" }, { status: 400 });
  }
  return Response.json(await refreshPriceQualityBenchmarks({ benchmarkDate }));
}
