import { MobileFeishuAutoLogin } from "@/components/mobile-feishu-auto-login";
import { StoreVisitsListH5 } from "@/components/store-visits-list-h5";
import { getPageI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function MobileOfflineCapturePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await getPageI18n(params);
  return (
    <>
      <MobileFeishuAutoLogin locale={locale} />
      <StoreVisitsListH5 locale={locale} />
    </>
  );
}
