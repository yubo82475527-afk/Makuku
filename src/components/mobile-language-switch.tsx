import Link from "next/link";
import { localeLabels, replacePathLocale, type Locale } from "@/lib/i18n/config";

export function MobileLanguageSwitch({
  locale,
  currentPath,
}: {
  locale: Locale;
  currentPath: string;
}) {
  const otherLocale: Locale = locale === "en" ? "zh" : "en";

  return (
    <Link
      href={replacePathLocale(`/${locale}${currentPath}`, otherLocale)}
      className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm"
    >
      {localeLabels[otherLocale]}
    </Link>
  );
}
