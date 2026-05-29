import en from "@/lib/i18n/dictionaries/en";
import zh from "@/lib/i18n/dictionaries/zh";
import type { Locale } from "@/lib/i18n/config";

const dictionaries = {
  en,
  zh,
};

export type Dictionary = typeof en;

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export function translateEnum<
  TCategory extends keyof Dictionary["enums"],
  TValue extends keyof Dictionary["enums"][TCategory],
>(dict: Dictionary, category: TCategory, value: TValue | null | undefined) {
  if (!value) return "-";
  return dict.enums[category][value] ?? String(value);
}
