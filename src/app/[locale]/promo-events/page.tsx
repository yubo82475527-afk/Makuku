import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, Card, DataNotice, SelectInput, TextInput } from "@/components/ui";
import { formatJakartaTime, formatPercent, formatPricePerPiece } from "@/lib/format";
import { getBrands, getPromoEvents } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import { translateEnum } from "@/lib/i18n/get-dictionary";

export default async function PromoEventsPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ severity?: string; channel?: string; brand?: string; city?: string }>;
}) {
  const { locale, dict } = await getPageI18n(routeParams);
  const params = await searchParams;
  const [eventsResult, brandsResult] = await Promise.all([getPromoEvents(), getBrands()]);
  const events = eventsResult.data.filter((event) => {
    if (params.severity && event.severity !== params.severity) return false;
    if (params.channel && event.channel !== params.channel) return false;
    if (params.brand && event.competitor_products?.brand_id !== params.brand) return false;
    if (params.city && event.city !== params.city) return false;
    return true;
  });

  return (
    <AppShell locale={locale} dict={dict} title={dict.promoEvents.title} currentPath="/promo-events" isDemo={eventsResult.isDemo}>
      <DataNotice dict={dict} error={eventsResult.error ?? brandsResult.error} />
      <Card className="mb-4">
        <form className="grid gap-3 md:grid-cols-5">
          <SelectInput name="severity" defaultValue={params.severity ?? ""}>
            <option value="">{dict.common.allSeverity}</option>
            <option value="critical">{translateEnum(dict, "severity", "critical")}</option>
            <option value="high">{translateEnum(dict, "severity", "high")}</option>
            <option value="medium">{translateEnum(dict, "severity", "medium")}</option>
            <option value="low">{translateEnum(dict, "severity", "low")}</option>
          </SelectInput>
          <SelectInput name="channel" defaultValue={params.channel ?? ""}>
            <option value="">{dict.common.allChannels}</option>
            <option value="shopee">{translateEnum(dict, "channel", "shopee")}</option>
            <option value="offline">{translateEnum(dict, "channel", "offline")}</option>
            <option value="tiktok">{translateEnum(dict, "channel", "tiktok")}</option>
          </SelectInput>
          <SelectInput name="brand" defaultValue={params.brand ?? ""}>
            <option value="">{dict.common.allBrands}</option>
            {brandsResult.data.filter((brand) => !brand.is_own_brand).map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </SelectInput>
          <TextInput name="city" placeholder={dict.common.city} defaultValue={params.city ?? ""} />
          <Button type="submit">{dict.common.filter}</Button>
        </form>
      </Card>

      <div className="space-y-3">
        {events.map((event) => (
          <Link key={event.id} href={`/${locale}/promo-events/${event.id}`} className="block">
            <Card className="hover:border-slate-300">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={event.severity}>{translateEnum(dict, "severity", event.severity)}</Badge>
                    <Badge>{translateEnum(dict, "channel", event.channel)}</Badge>
                    <span className="text-xs text-slate-500">{formatJakartaTime(event.started_at)}</span>
                  </div>
                  <h2 className="mt-2 font-semibold">{event.event_title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{event.event_summary}</p>
                </div>
                <div className="text-right text-sm">
                  <div>{formatPricePerPiece(event.old_price_per_piece)} -&gt; <span className="font-semibold">{formatPricePerPiece(event.new_price_per_piece)}</span></div>
                  <div className="mt-1 text-slate-600">{dict.common.gap} {formatPercent(event.price_gap_vs_makuku_pct)}</div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
