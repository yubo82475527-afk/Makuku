import { CalendarDays, ExternalLink, Smartphone } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, Card, DataNotice, EmptyState, SelectInput, TextInput } from "@/components/ui";
import { formatJakartaTime } from "@/lib/format";
import { getOfflineStoreVisits } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import { visitStatusLabel } from "@/lib/offline-visit-labels";

export const dynamic = "force-dynamic";

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

  return (
    <AppShell locale={locale} dict={dict} title={dict.offlineUploads.title} currentPath="/offline-uploads" isDemo={result.isDemo}>
      <DataNotice dict={dict} error={result.error} />

      <Card className="mb-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">{dict.offlineUploads.uploadTitle}</h2>
            <p className="mt-1 text-sm text-slate-500">{dict.offlineUploads.captureHint}</p>
          </div>
          <Link href={`/${locale}/mobile/offline-capture`} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Smartphone className="h-4 w-4" />
            {dict.offlineUploads.mobileEntry}
          </Link>
        </div>
        <form action="/api/offline-store-visits" method="post" className="grid gap-3 md:grid-cols-6">
          <input type="hidden" name="return_to" value={`/${locale}/offline-uploads`} />
          <TextInput name="store_name" placeholder={dict.offlineUploads.storeName} required className="md:col-span-2" />
          <TextInput name="city" placeholder={dict.common.city} required />
          <SelectInput name="channel_type" required defaultValue="modern_trade">
            <option value="modern_trade">Modern trade</option>
            <option value="baby_store">Baby store</option>
            <option value="pharmacy">Pharmacy</option>
            <option value="general_trade">General trade</option>
          </SelectInput>
          <TextInput name="uploader_name" placeholder={dict.offlineUploads.uploader} required />
          <TextInput name="visit_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
          <Button type="submit" className="md:col-span-6">{dict.offlineUploads.uploadButton}</Button>
        </form>
      </Card>

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
        {result.data.length === 0 ? <EmptyState text={dict.offlineUploads.noVisits} /> : null}
        {result.data.map((visit) => {
          const images = visit.offline_visit_images ?? [];
          return (
            <Card key={visit.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{visit.store_name}</h2>
                    <Badge>{visitStatusLabel(visit.visit_status)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {visit.city} / {visit.channel_type} / {visit.uploader_name} / {visit.visit_date}
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
                  <div className="mt-1 text-lg font-semibold">{images.length}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="text-xs text-slate-500">{dict.offlineUploads.detectedProducts}</div>
                  <div className="mt-1 text-lg font-semibold">{String((visit.summary_result?.detected_product_count as number | undefined) ?? 0)}</div>
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
    </AppShell>
  );
}
