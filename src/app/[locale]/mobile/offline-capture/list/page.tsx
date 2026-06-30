import { StoreVisitsListH5 } from "@/components/store-visits-list-h5";
import { getPageI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function StoreVisitsListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await getPageI18n(params);
  return <StoreVisitsListH5 locale={locale} />;
}
