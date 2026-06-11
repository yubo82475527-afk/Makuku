import { NextRequest, NextResponse } from "next/server";
import { isAllowedAdminRole, readSessionFromRequest } from "@/lib/auth-session";
import { isLocale, type Locale } from "@/lib/i18n/config";

const pcProtectedRoots = new Set([
  "dashboard",
  "prices",
  "offline-price-candidates",
  "offline-stores",
  "sku-master",
  "users",
  "competitors",
  "market-benchmarks",
  "promo-events",
  "alerts",
  "channels",
  "offline-uploads",
  "store-visit-ai-debug",
]);

const h5CaptureRoot = "/mobile/offline-capture";

export function isPcProtectedPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const locale = parts[0];
  if (!isLocale(locale)) return false;
  const root = parts[1] ?? "";
  if (pathname.startsWith(`/${locale}${h5CaptureRoot}`)) return false;
  if (root === "login") return false;
  return pcProtectedRoots.has(root);
}

function loginUrl(request: NextRequest, locale: Locale) {
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}/login`;
  url.search = "";
  url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return url;
}

export async function proxy(request: NextRequest) {
  if (!isPcProtectedPath(request.nextUrl.pathname)) return NextResponse.next();
  const locale = request.nextUrl.pathname.split("/").filter(Boolean)[0] as Locale;
  const session = readSessionFromRequest(request);
  if (!session || !isAllowedAdminRole(session.role)) {
    return NextResponse.redirect(loginUrl(request, locale));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
