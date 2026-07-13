import { requireAdminSession } from "@/lib/auth-session";
import { getOperatorPriceReviewsPage } from "@/lib/operator-price-review";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const state = url.searchParams.get("state") === "processed" ? "processed" : "pending";
  const page = positiveInteger(url.searchParams.get("page"), 1);
  const perPage = Math.min(100, Math.max(10, positiveInteger(url.searchParams.get("per_page"), 25)));
  const locale = url.searchParams.get("locale") === "en" ? "en" : "zh";
  const result = await getOperatorPriceReviewsPage({
    state,
    dateFrom: cleanText(url.searchParams.get("date_from")),
    dateTo: cleanText(url.searchParams.get("date_to")),
    visitCode: cleanText(url.searchParams.get("visit_code")),
    page,
    perPage,
    locale,
  });

  if (result.error && !result.isDemo) {
    return Response.json({ error: result.error }, { status: 500 });
  }
  return Response.json({
    items: result.data,
    total: result.total,
    page: result.page,
    per_page: result.perPage,
  });
}

function cleanText(value: string | null) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
