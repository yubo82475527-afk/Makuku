import { requirePagePermission } from "@/lib/auth-session";
import {
  getDashboardPackageOptionsData,
  getDashboardPriceData,
  type DashboardSearchParams,
} from "@/lib/dashboard-data";
import { resolveDataScopeForSession } from "@/lib/data-scope";

export const dynamic = "force-dynamic";

const dashboardSearchKeys = [
  "month",
  "ownSeries",
  "ownPackage",
  "competitorPackage",
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

    const section = url.searchParams.get("section");
    if (section === "price-package-options") {
      return Response.json(await getDashboardPackageOptionsData({
        ownSeries: query.ownSeries,
        ownPackage: query.ownPackage,
      }));
    }

    const dataScope = await resolveDataScopeForSession(auth.session);
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
