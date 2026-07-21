import { isAllowedAdminRole, readSessionFromRequest, requireAdminSession } from "@/lib/auth-session";
import {
  getDashboardPriceData,
  type DashboardSearchParams,
} from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

const dashboardSearchKeys = [
  "month",
  "ownSeries",
  "organization",
  "dimensions",
] as const;

export async function GET(request: Request) {
  const auth = await requireAdminSession(request);
  if (auth.response) {
    const localSession = process.env.NODE_ENV !== "production" ? readSessionFromRequest(request) : null;
    if (!localSession || !isAllowedAdminRole(localSession.role)) return auth.response;
  }

  try {
    const url = new URL(request.url);
    const locale = url.searchParams.get("locale") || "zh";
    const query: DashboardSearchParams = {};
    for (const key of dashboardSearchKeys) {
      const value = url.searchParams.get(key);
      if (value) query[key] = value;
    }

    const section = url.searchParams.get("section");
    if (section === "price") return Response.json(await getDashboardPriceData(locale, query));
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
