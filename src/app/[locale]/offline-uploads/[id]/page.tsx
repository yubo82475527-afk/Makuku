import { ImageIcon, Smartphone } from "lucide-react";
import Link from "next/link";
import { PageShellState } from "@/components/page-shell-state";
import { StoreVisitResultCard } from "@/components/store-visit-result-card";
import { Badge, Button, Card, DataNotice, EmptyState } from "@/components/ui";
import { formatJakartaTime } from "@/lib/format";
import { getOfflineStoreVisit } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import { mobileImageCategoryLabel } from "@/lib/mobile-i18n";
import { visitStatusLabel } from "@/lib/offline-visit-labels";
import type { OfflineStoreVisit } from "@/lib/types";

export const dynamic = "force-dynamic";

function formatVisitRegion(visit: OfflineStoreVisit) {
  const structured = [visit.province, visit.city_name, visit.district].map((value) => value?.trim()).filter(Boolean).join(" / ");
  return structured || visit.city;
}

export default async function OfflineVisitDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const resolvedParams = await params;
  const { locale, dict } = await getPageI18n(Promise.resolve({ locale: resolvedParams.locale }));
  const result = await getOfflineStoreVisit(resolvedParams.id);
  const visit = result.data;

  return (
    <>
      <PageShellState locale={locale} dict={dict} title={dict.offlineUploads.visitDetail} currentPath={`/offline-uploads/${resolvedParams.id}`} isDemo={result.isDemo} />
      <DataNotice dict={dict} error={result.error} />
      {!visit ? (
        <EmptyState text="Visit not found" />
      ) : (
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{visit.store_name}</h2>
                  <Badge>{visitStatusLabel(visit.visit_status)}</Badge>
                  {visit.analysis_status ? <Badge>{visit.analysis_status}</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {formatVisitRegion(visit)} / {visit.channel_type} / {visit.uploader_name} / {visit.visit_date}
                </p>
                <p className="mt-1 text-xs text-slate-500">Created {formatJakartaTime(visit.created_at)}</p>
              </div>
              <Link href={`/${locale}/mobile/offline-capture/${visit.id}`}>
                <Button type="button">
                  <Smartphone className="h-4 w-4" />
                  H5 Detail
                </Button>
              </Link>
            </div>
            {visit.analysis_error ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {visit.analysis_error}
              </div>
            ) : null}
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{dict.offlineUploads.imageArchive}</h2>
                <p className="mt-1 text-sm text-slate-500">Photos submitted from the H5 capture flow.</p>
              </div>
              <Badge>{visit.signed_images?.length ?? 0} photos</Badge>
            </div>
            {(visit.signed_images ?? []).length === 0 ? <EmptyState text={dict.offlineUploads.noImages} /> : null}
            {(visit.signed_images ?? []).length > 0 ? (
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                {(visit.signed_images ?? []).map((image, index) => (
                  <div key={`${image.path}-${index}`} className="overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                    <div className="flex aspect-[4/3] items-center justify-center bg-slate-100">
                      {image.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={image.url} alt={`${visit.store_name} ${index + 1}`} className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-10 w-10 text-slate-400" />
                      )}
                    </div>
                    <div className="border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
                      <div className="font-medium text-slate-900">{mobileImageCategoryLabel(locale, image.category)}</div>
                      <div className="mt-1 truncate">{image.path}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>

          {visit.ai_result ? (
            <StoreVisitResultCard result={visit.ai_result} locale={locale} />
          ) : (
            <Card>
              <h2 className="font-semibold">{dict.promoEvents.aiStrategy}</h2>
              <p className="mt-2 text-sm text-slate-500">No store-level AI result yet. Open the H5 detail page to run store analysis.</p>
              <Link href={`/${locale}/mobile/offline-capture/${visit.id}`} className="mt-3 inline-flex">
                <Button type="button">
                  <Smartphone className="h-4 w-4" />
                  H5 Detail
                </Button>
              </Link>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
