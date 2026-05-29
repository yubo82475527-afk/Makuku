import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, Card, DataNotice, MetricCard } from "@/components/ui";
import { formatJakartaTime, formatPricePerPiece } from "@/lib/format";
import { getAlerts, getOfflineUploads, getPriceSnapshots, getPromoEvents } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import { translateEnum } from "@/lib/i18n/get-dictionary";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const [eventsResult, pricesResult, uploadsResult, alertsResult] = await Promise.all([
    getPromoEvents(),
    getPriceSnapshots(),
    getOfflineUploads(),
    getAlerts(),
  ]);
  const events = eventsResult.data;
  const prices = pricesResult.data;
  const uploads = uploadsResult.data;
  const today = new Date();
  today.setHours(today.getHours() - 24);

  const newEvents = events.filter((event) => new Date(event.started_at) >= today).length;
  const highRisk = events.filter((event) => event.severity === "high" || event.severity === "critical").length;
  const averageIndex =
    prices.length > 0
      ? Math.round((prices.reduce((sum, item) => sum + item.price_per_piece, 0) / prices.length / 2500) * 100)
      : 0;
  const pendingUploads = uploads.filter((item) => item.upload_status === "uploaded" || item.upload_status === "ocr_done").length;
  const highRiskRecommendations = events
    .flatMap((event) => event.ai_strategy_recommendations ?? [])
    .filter((item) => item.risk_level === "high" || item.risk_level === "critical");

  return (
    <AppShell locale={locale} dict={dict} title={dict.dashboard.title} currentPath="/dashboard" isDemo={eventsResult.isDemo || pricesResult.isDemo}>
      <DataNotice dict={dict} error={eventsResult.error ?? pricesResult.error ?? uploadsResult.error ?? alertsResult.error} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={dict.dashboard.metrics.newEvents} value={newEvents} hint={dict.dashboard.metrics.newEventsHint} />
        <MetricCard label={dict.dashboard.metrics.highRisk} value={highRisk} hint={dict.dashboard.metrics.highRiskHint} />
        <MetricCard label={dict.dashboard.metrics.averageIndex} value={`${averageIndex}`} hint={dict.dashboard.metrics.averageIndexHint} />
        <MetricCard label={dict.dashboard.metrics.pendingUploads} value={pendingUploads} hint={dict.dashboard.metrics.pendingUploadsHint} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">{dict.dashboard.recentFlow}</h2>
            <Link href={`/${locale}/promo-events`} className="text-sm font-medium text-slate-700 hover:underline">{dict.common.viewAll}</Link>
          </div>
          <div className="divide-y divide-slate-200">
            {events.slice(0, 6).map((event) => (
              <Link key={event.id} href={`/${locale}/promo-events/${event.id}`} className="block py-3 hover:bg-slate-50">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{event.event_title}</div>
                  <Badge tone={event.severity}>{translateEnum(dict, "severity", event.severity)}</Badge>
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {translateEnum(dict, "channel", event.channel)} / {formatPricePerPiece(event.new_price_per_piece)} / {formatJakartaTime(event.started_at)}
                </div>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">{dict.dashboard.highRiskAi}</h2>
          <div className="space-y-3">
            {highRiskRecommendations.slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-md border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Badge tone={item.risk_level}>{translateEnum(dict, "severity", item.risk_level)}</Badge>
                  <span className="text-xs text-slate-500">{Math.round((item.confidence_score ?? 0) * 100)}% {dict.common.confidence}</span>
                </div>
                <p className="text-sm text-slate-700">{item.impact_summary}</p>
              </div>
            ))}
            {highRiskRecommendations.length === 0 ? (
              <p className="text-sm text-slate-500">{dict.dashboard.noHighRiskAi}</p>
            ) : null}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
