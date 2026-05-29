import { StoreVisitDetailH5 } from "@/components/store-visit-detail-h5";
import { getPageI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function StoreVisitDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const resolvedParams = await params;
  const { locale } = await getPageI18n(Promise.resolve({ locale: resolvedParams.locale }));
  return <StoreVisitDetailH5 locale={locale} id={resolvedParams.id} />;
}
