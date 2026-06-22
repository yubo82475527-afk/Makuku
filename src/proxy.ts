import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, isLocale, replacePathLocale } from "@/lib/i18n/config";
import { readLocalePreferenceFromRequest } from "@/lib/locale-preference";

const publicFilePattern = /\.[^/]+$/;
const h5CaptureRoot = "/mobile/offline-capture";

function isExternalH5EntryPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const locale = parts[0];
  if (!isLocale(locale)) return false;
  return pathname === `/${locale}${h5CaptureRoot}` || pathname === `/${locale}${h5CaptureRoot}/new`;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    publicFilePattern.test(pathname)
  ) {
    return NextResponse.next();
  }

  const firstSegment = pathname.split("/")[1];
  const preferredLocale = readLocalePreferenceFromRequest(request) ?? defaultLocale;

  if (isLocale(firstSegment)) {
    if (isExternalH5EntryPath(pathname) && firstSegment !== preferredLocale) {
      const target = request.nextUrl.clone();
      target.pathname = replacePathLocale(pathname, preferredLocale);
      target.search = search;
      return NextResponse.redirect(target);
    }
    return NextResponse.next();
  }

  const target = request.nextUrl.clone();
  target.pathname = pathname === "/" ? `/${preferredLocale}/dashboard` : `/${preferredLocale}${pathname}`;
  target.search = search;
  return NextResponse.redirect(target);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
