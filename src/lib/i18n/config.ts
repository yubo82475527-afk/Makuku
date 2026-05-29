export const locales = ["en", "zh"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const localeLabels: Record<Locale, string> = {
  en: "English",
  zh: "中文",
};

export function isLocale(value: string | undefined): value is Locale {
  return locales.includes(value as Locale);
}

export function detectLocaleFromAcceptLanguage(header: string | null): Locale {
  if (!header) return defaultLocale;

  const languages = header
    .split(",")
    .map((item) => item.split(";")[0]?.trim().toLowerCase())
    .filter(Boolean);

  for (const language of languages) {
    const base = language.split("-")[0];
    if (isLocale(language)) return language;
    if (isLocale(base)) return base;
  }

  return defaultLocale;
}

export function getLocalizedPath(locale: Locale, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${normalizedPath === "/" ? "/dashboard" : normalizedPath}`;
}

export function replacePathLocale(pathname: string, locale: Locale) {
  const segments = pathname.split("/");
  if (isLocale(segments[1])) {
    segments[1] = locale;
    return segments.join("/") || `/${locale}`;
  }
  return getLocalizedPath(locale, pathname);
}
