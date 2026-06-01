import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, Card, DataNotice, EmptyState, SelectInput, TextInput } from "@/components/ui";
import { getBrands, getChannels, getPromoEventFeed } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import { translateEnum } from "@/lib/i18n/get-dictionary";
import type { Dictionary } from "@/lib/i18n/get-dictionary";
import type { PromoEventFeedItem } from "@/lib/types";

export default async function PromoEventsPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ severity?: string; channel?: string; brand?: string; city?: string; category?: string }>;
}) {
  const { locale, dict } = await getPageI18n(routeParams);
  const params = await searchParams;
  const [feedResult, brandsResult, channelsResult] = await Promise.all([getPromoEventFeed(), getBrands(), getChannels()]);
  const categories = Array.from(new Set(feedResult.data.map((event) => event.category))).sort();
  const events = feedResult.data.filter((event) => {
    if (params.severity && event.severity !== params.severity) return false;
    if (params.channel && event.channel !== params.channel && event.channelCode !== params.channel) return false;
    if (params.brand && event.brandId !== params.brand) return false;
    if (params.city && event.city !== params.city) return false;
    if (params.category && event.category !== params.category) return false;
    return true;
  });

  return (
    <AppShell locale={locale} dict={dict} title={dict.promoEvents.title} currentPath="/promo-events" isDemo={feedResult.isDemo}>
      <DataNotice dict={dict} error={feedResult.error ?? brandsResult.error ?? channelsResult.error} />
      <Card className="mb-4">
        <form className="grid gap-3 md:grid-cols-6">
          <SelectInput name="severity" defaultValue={params.severity ?? ""}>
            <option value="">{dict.common.allSeverity}</option>
            <option value="critical">{translateEnum(dict, "severity", "critical")}</option>
            <option value="high">{translateEnum(dict, "severity", "high")}</option>
            <option value="medium">{translateEnum(dict, "severity", "medium")}</option>
            <option value="low">{translateEnum(dict, "severity", "low")}</option>
          </SelectInput>
          <SelectInput name="channel" defaultValue={params.channel ?? ""}>
            <option value="">{dict.common.allChannels}</option>
            {channelsResult.data.filter((channel) => channel.active).map((channel) => (
              <option key={channel.id} value={channel.code}>{channel.name}</option>
            ))}
          </SelectInput>
          <SelectInput name="category" defaultValue={params.category ?? ""}>
            <option value="">{locale === "zh" ? "\u5168\u90e8\u54c1\u7c7b" : "All categories"}</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </SelectInput>
          <SelectInput name="brand" defaultValue={params.brand ?? ""}>
            <option value="">{dict.common.allBrands}</option>
            {brandsResult.data.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </SelectInput>
          <TextInput name="city" placeholder={dict.common.city} defaultValue={params.city ?? ""} />
          <Button type="submit">{dict.common.filter}</Button>
        </form>
      </Card>

      <div className="space-y-3">
        {events.length === 0 ? <EmptyState text={locale === "zh" ? "\u6682\u65e0\u4fc3\u9500\u4e8b\u4ef6\u3002" : "No promo events yet."} /> : null}
        {events.map((event) => <PromoFeedCard key={event.id} event={event} locale={locale} dict={dict} />)}
      </div>
    </AppShell>
  );
}

function PromoFeedCard({
  event,
  locale,
  dict,
}: {
  event: PromoEventFeedItem;
  locale: string;
  dict: Dictionary;
}) {
  const brandLabel = event.brandName ?? (locale === "zh" ? "\u672a\u77e5\u54c1\u724c" : "Unknown brand");
  const content = (
    <Card className="hover:border-slate-300">
      <div className="grid gap-4 md:grid-cols-[140px_180px_1fr_130px] md:items-start">
        <Field label={locale === "zh" ? "\u65e5\u671f" : "Date"} value={formatFeedDate(event.date, locale)} />
        <Field label={locale === "zh" ? "\u95e8\u5e97" : "Store"} value={event.storeName ?? "-"} />
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase text-slate-500">{locale === "zh" ? "\u6d3b\u52a8\u540d\u79f0" : "Activity"}</div>
          <h2 className="mt-1 break-words font-semibold text-slate-900">{event.activityName}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {event.severity ? <Badge tone={event.severity}>{translateEnum(dict, "severity", event.severity)}</Badge> : null}
            <Badge>{translateEnum(dict, "channel", event.channel)}</Badge>
            <Badge>{event.status === "confirmed" ? (locale === "zh" ? "\u5df2\u786e\u8ba4" : "Confirmed") : (locale === "zh" ? "\u5f85\u590d\u6838" : "Pending review")}</Badge>
            <span className="text-xs text-slate-500">{brandLabel}</span>
          </div>
        </div>
        <Field label={locale === "zh" ? "\u6298\u6263\u529b\u5ea6" : "Discount"} value={event.discountLabel} strong />
      </div>
    </Card>
  );

  if (!event.detailHref) return content;
  return <Link href={`/${locale}${event.detailHref}`} className="block">{content}</Link>;
}

function Field({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase text-slate-500">{label}</div>
      <div className={strong ? "mt-1 text-lg font-semibold text-slate-900" : "mt-1 text-sm text-slate-800"}>{value}</div>
    </div>
  );
}

function formatFeedDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
