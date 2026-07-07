import { isAllowedAdminRole, readSessionFromRequest, requireAdminSession } from "@/lib/auth-session";
import { getStoreVisitMonitor } from "@/lib/data";

export const dynamic = "force-dynamic";

function readPositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  const auth = await requireAdminSession(request);
  if (auth.response) {
    const localSession = process.env.NODE_ENV !== "production" ? readSessionFromRequest(request) : null;
    if (!localSession || !isAllowedAdminRole(localSession.role)) return auth.response;
  }

  try {
    const url = new URL(request.url);
    const result = await getStoreVisitMonitor({
      dateFrom: url.searchParams.get("date_from") || undefined,
      dateTo: url.searchParams.get("date_to") || undefined,
      visitCode: url.searchParams.get("visit_code") || undefined,
      storeName: url.searchParams.get("store_name") || undefined,
      promoter: url.searchParams.get("promoter") || undefined,
      analysisStatus: url.searchParams.get("analysis_status") || undefined,
      includeQuality: url.searchParams.get("include_quality") === "1",
      page: readPositiveInt(url.searchParams.get("page"), 1),
      pageSize: readPositiveInt(url.searchParams.get("page_size"), 50),
    });

    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
