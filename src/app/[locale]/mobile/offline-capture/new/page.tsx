import { MobileFeishuAutoLogin } from "@/components/mobile-feishu-auto-login";
import { StoreVisitH5 } from "@/components/store-visit-h5";
import { getPageI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function NewMobileOfflineCapturePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await getPageI18n(params);
  return (
    <>
      <MobileFeishuAutoLogin locale={locale} />
      <StoreVisitH5 locale={locale} />
    </>
  );
}
