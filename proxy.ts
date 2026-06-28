import { NextRequest, NextResponse } from "next/server";
import { isAllowedAdminRole, readSessionFromRequest } from "@/lib/auth-session";
import { defaultLocale, isLocale, replacePathLocale, type Locale } from "@/lib/i18n/config";
import { readLocalePreferenceFromRequest } from "@/lib/locale-preference";

const pcProtectedRoots = new Set([
  "dashboard",
  "prices",
  "offline-price-candidates",
  "offline-stores",
  "sku-master",
  "users",
  "competitors",
  "competitor-products",
  "competitor-mappings",
  "promo-events",
  "alerts",
  "channels",
  "offline-uploads",
  "store-visit-ai-debug",
]);

const h5CaptureRoot = "/mobile/offline-capture";
const publicFilePattern = /\.[^/]+$/;

export function isPcProtectedPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const locale = parts[0];
  if (!isLocale(locale)) return false;
  const root = parts[1] ?? "";
  if (pathname.startsWith(`/${locale}${h5CaptureRoot}`)) return false;
  if (root === "login") return false;
  return pcProtectedRoots.has(root);
}

function isExternalH5EntryPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const locale = parts[0];
  if (!isLocale(locale)) return false;
  return pathname === `/${locale}${h5CaptureRoot}` || pathname === `/${locale}${h5CaptureRoot}/new`;
}

function loginUrl(request: NextRequest, locale: Locale) {
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}/login`;
  url.search = "";
  url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return url;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    publicFilePattern.test(pathname)
  ) {
    return NextResponse.next();
  }

  const preferredLocale = readLocalePreferenceFromRequest(request) ?? defaultLocale;
  const firstSegment = pathname.split("/")[1];

  if (!isLocale(firstSegment)) {
    const target = request.nextUrl.clone();
    target.pathname = pathname === "/" ? `/${preferredLocale}/dashboard` : `/${preferredLocale}${pathname}`;
    target.search = search;
    return NextResponse.redirect(target);
  }

  if (isExternalH5EntryPath(pathname) && firstSegment !== preferredLocale) {
    const target = request.nextUrl.clone();
    target.pathname = replacePathLocale(pathname, preferredLocale);
    target.search = search;
    return NextResponse.redirect(target);
  }

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
