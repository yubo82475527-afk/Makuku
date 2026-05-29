import { NextResponse, type NextRequest } from "next/server";
import { detectLocaleFromAcceptLanguage, isLocale } from "@/lib/i18n/config";

const publicFilePattern = /\.[^/]+$/;

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
  if (isLocale(firstSegment)) {
    return NextResponse.next();
  }

  const locale = detectLocaleFromAcceptLanguage(request.headers.get("accept-language"));
  const target = request.nextUrl.clone();
  target.pathname = pathname === "/" ? `/${locale}/dashboard` : `/${locale}${pathname}`;
  target.search = search;
  return NextResponse.redirect(target);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
