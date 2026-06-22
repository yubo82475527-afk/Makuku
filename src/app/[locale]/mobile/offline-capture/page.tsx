import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MobileFeishuAutoLogin } from "@/components/mobile-feishu-auto-login";
import { StoreVisitsListH5 } from "@/components/store-visits-list-h5";
import { defaultLocale, replacePathLocale } from "@/lib/i18n/config";
import { getPageI18n } from "@/lib/i18n/server";
import { readLocalePreference } from "@/lib/locale-preference";

export const dynamic = "force-dynamic";

export default async function MobileOfflineCapturePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await getPageI18n(params);
  const cookieStore = await cookies();
  const preferredLocale = readLocalePreference(cookieStore.get("makuku_locale")?.value) ?? defaultLocale;
  if (preferredLocale !== locale) {
    redirect(replacePathLocale(`/${locale}/mobile/offline-capture`, preferredLocale));
  }
  return (
    <>
      <MobileFeishuAutoLogin locale={locale} />
      <StoreVisitsListH5 locale={locale} />
    </>
  );
}
