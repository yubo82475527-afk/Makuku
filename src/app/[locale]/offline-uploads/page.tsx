import { CalendarDays, ExternalLink, Smartphone } from "lucide-react";
import Link from "next/link";
import { PageShellState } from "@/components/page-shell-state";
import { Badge, Button, Card, DataNotice, EmptyState, SelectInput, TextInput } from "@/components/ui";
import { formatJakartaTime } from "@/lib/format";
import { getOfflineStoreVisits } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import { visitStatusLabel } from "@/lib/offline-visit-labels";
import type { OfflineStoreVisit } from "@/lib/types";

export const dynamic = "force-dynamic";

function getVisitImageCount(visit: OfflineStoreVisit) {
  if (Array.isArray(visit.image_urls)) return visit.image_urls.length;
  return visit.offline_visit_images?.length ?? 0;
}

function getDetectedProductCount(visit: OfflineStoreVisit) {
  const detectedItems = visit.ai_result?.raw_extraction?.detected_items;
  if (Array.isArray(detectedItems)) return detectedItems.length;
  const legacyCount = visit.summary_result?.detected_product_count;
  return typeof legacyCount === "number" ? legacyCount : 0;
}

function formatVisitRegion(visit: OfflineStoreVisit) {
  const structured = [visit.province, visit.city_name, visit.district].map((value) => value?.trim()).filter(Boolean).join(" / ");
  return structured || visit.city;
}

export default async function OfflineUploadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const filters = await searchParams;
  const getFilter = (key: string) => {
    const value = filters[key];
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
  };
  const result = await getOfflineStoreVisits({
    q: getFilter("q") || undefined,
    city: getFilter("city") || undefined,
    status: getFilter("status") || undefined,
    uploaderName: getFilter("uploader_name") || undefined,
    dateFrom: getFilter("date_from") || undefined,
    dateTo: getFilter("date_to") || undefined,
  });
  const visits = result.data;
  const totalImages = visits.reduce((sum, visit) => sum + getVisitImageCount(visit), 0);
  const analyzedCount = visits.filter((visit) => visit.ai_result || visit.analysis_status === "completed").length;
  const failedCount = visits.filter((visit) => visit.analysis_status === "failed").length;

  return (
    <>
      <PageShellState locale={locale} dict={dict} title={dict.offlineUploads.title} currentPath="/offline-uploads" isDemo={result.isDemo} />
      <DataNotice dict={dict} error={result.error} />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">H5 Store Visit Submissions</h2>
            <p className="mt-1 text-sm text-slate-500">This page is read-only. Store visits are submitted from the mobile H5 capture flow.</p>
          </div>
          <Link href={`/${locale}/mobile/offline-capture`} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Smartphone className="h-4 w-4" />
            {dict.offlineUploads.mobileEntry}
          </Link>
        </div>
      </Card>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <Card>
          <div className="text-xs font-medium uppercase text-slate-500">Store visits</div>
          <div className="mt-2 text-2xl font-semibold">{visits.length}</div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase text-slate-500">{dict.offlineUploads.imageArchive}</div>
          <div className="mt-2 text-2xl font-semibold">{totalImages}</div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase text-slate-500">Analyzed</div>
          <div className="mt-2 text-2xl font-semibold">{analyzedCount}</div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase text-slate-500">Failed</div>
          <div className="mt-2 text-2xl font-semibold">{failedCount}</div>
        </Card>
      </div>

      <Card className="mb-4">
        <form className="grid gap-3 md:grid-cols-6">
          <TextInput name="q" placeholder="Search store/city/uploader" defaultValue={getFilter("q")} className="md:col-span-2" />
          <TextInput name="city" placeholder={dict.common.city} defaultValue={getFilter("city")} />
          <TextInput name="uploader_name" placeholder={dict.offlineUploads.uploader} defaultValue={getFilter("uploader_name")} />
          <SelectInput name="status" defaultValue={getFilter("status")}>
            <option value="">{dict.common.status}</option>
            <option value="draft">draft</option>
            <option value="uploaded">uploaded</option>
            <option value="analyzing">analyzing</option>
            <option value="analyzed">analyzed</option>
            <option value="reviewed">reviewed</option>
            <option value="failed">failed</option>
          </SelectInput>
          <div className="flex gap-2">
            <Button type="submit">{dict.common.filter}</Button>
            <Link href={`/${locale}/offline-uploads`} className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {dict.common.viewAll}
            </Link>
          </div>
          <TextInput name="date_from" type="date" defaultValue={getFilter("date_from")} />
          <TextInput name="date_to" type="date" defaultValue={getFilter("date_to")} />
        </form>
      </Card>

      <div className="space-y-4">
        {visits.length === 0 ? <EmptyState text={dict.offlineUploads.noVisits} /> : null}
        {visits.map((visit) => {
          const imageCount = getVisitImageCount(visit);
          const detectedCount = getDetectedProductCount(visit);
          return (
            <Card key={visit.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{visit.store_name}</h2>
                    <Badge>{visitStatusLabel(visit.visit_status)}</Badge>
                    {visit.analysis_status ? <Badge>{visit.analysis_status}</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatVisitRegion(visit)} / {visit.channel_type} / {visit.uploader_name} / {visit.visit_date}
                  </p>
                </div>
                <Link href={`/${locale}/offline-uploads/${visit.id}`}>
                  <Button type="button">
                    <ExternalLink className="h-4 w-4" />
                    {dict.offlineUploads.visitDetail}
                  </Button>
                </Link>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="text-xs text-slate-500">{dict.offlineUploads.imageArchive}</div>
                  <div className="mt-1 text-lg font-semibold">{imageCount}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="text-xs text-slate-500">{dict.offlineUploads.detectedProducts}</div>
                  <div className="mt-1 text-lg font-semibold">{detectedCount}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm md:col-span-2">
                  <div className="flex items-center gap-2 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" />Created</div>
                  <div className="mt-1 font-medium">{formatJakartaTime(visit.created_at)}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
