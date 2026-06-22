import type { NextRequest } from "next/server";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n/config";

export const localePreferenceCookieName = "makuku_locale";

export function readLocalePreference(value: string | null | undefined): Locale | null {
  const candidate = String(value ?? "").trim().toLowerCase();
  return isLocale(candidate) ? candidate : null;
}

export function readLocalePreferenceFromCookieHeader(cookieHeader: string | null | undefined): Locale | null {
  const cookies = String(cookieHeader ?? "").split(";");
  for (const part of cookies) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName !== localePreferenceCookieName) continue;
    return readLocalePreference(rawValue.join("="));
  }
  return null;
}

export function readLocalePreferenceFromRequest(request: NextRequest | Request): Locale | null {
  return readLocalePreferenceFromCookieHeader(request.headers.get("cookie"));
}

export function resolvePreferredLocale(value: string | null | undefined): Locale {
  return readLocalePreference(value) ?? defaultLocale;
}

export function writeLocalePreferenceCookie(locale: Locale) {
  return `${localePreferenceCookieName}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
