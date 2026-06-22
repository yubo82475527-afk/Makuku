import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { defaultLocale } from "@/lib/i18n/config";
import { readLocalePreference } from "@/lib/locale-preference";

export default async function Home() {
  const cookieStore = await cookies();
  const locale = readLocalePreference(cookieStore.get("makuku_locale")?.value) ?? defaultLocale;
  redirect(`/${locale}/dashboard`);
}
