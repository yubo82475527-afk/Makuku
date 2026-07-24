import { requirePagePermission } from "@/lib/auth-session";
import {
  getDashboardPriceData,
  type DashboardSearchParams,
} from "@/lib/dashboard-data";
import { resolveDataScopeForSession } from "@/lib/data-scope";

export const dynamic = "force-dynamic";

const dashboardSearchKeys = [
  "month",
  "ownSeries",
  "organization",
  "dimensions",
] as const;

export async function GET(request: Request) {
  const auth = await requirePagePermission(request, "dashboard");
  if (auth.response) return auth.response;

  try {
    const url = new URL(request.url);
    const locale = url.searchParams.get("locale") || "zh";
    const query: DashboardSearchParams = {};
    for (const key of dashboardSearchKeys) {
      const value = url.searchParams.get(key);
      if (value) query[key] = value;
    }

    const dataScope = await resolveDataScopeForSession(auth.session);
    const section = url.searchParams.get("section");
    if (section === "price") return Response.json(await getDashboardPriceData(locale, query, dataScope));
    return Response.json(
      { error: "Unsupported dashboard section" },
      { status: 400 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
