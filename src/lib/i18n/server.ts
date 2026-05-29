import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { isLocale } from "@/lib/i18n/config";

export async function getPageI18n(params: Promise<{ locale: string }>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { locale, dict: getDictionary(locale) };
}
