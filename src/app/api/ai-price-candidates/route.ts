import { getAiPriceCandidatesPage } from "@/lib/data";
import type { AiPriceCandidateStatus } from "@/lib/types";

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.floor(parsed));
}

function parseStatus(value: string | null): AiPriceCandidateStatus | undefined {
  if (value === "pending" || value === "approved" || value === "rejected") return value;
  return undefined;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parsePositiveInt(searchParams.get("page"), 1, 100000);
  const perPage = parsePositiveInt(searchParams.get("per_page"), 50, 200);
  const result = await getAiPriceCandidatesPage({
    page,
    perPage,
    status: parseStatus(searchParams.get("status")),
    dateFrom: searchParams.get("date_from") || undefined,
    dateTo: searchParams.get("date_to") || undefined,
    visitCode: searchParams.get("visit_code")?.trim() || undefined,
  });

  return Response.json({
    items: result.data,
    total: result.total,
    page: result.page,
    per_page: result.perPage,
    error: result.error,
    demo: result.isDemo,
  }, { status: result.error && !result.isDemo ? 500 : 200 });
}
