import { notFound } from "next/navigation";
import { GenerateAiButton, RecommendationStatusButton } from "@/components/client-actions";
import { AppShell } from "@/components/app-shell";
import { Badge, Card, DataNotice } from "@/components/ui";
import { formatJakartaTime, formatPercent, formatPricePerPiece } from "@/lib/format";
import { getPromoEvent } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import { translateEnum } from "@/lib/i18n/get-dictionary";

export default async function PromoEventDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const routeParams = await params;
  const { locale, dict } = await getPageI18n(Promise.resolve({ locale: routeParams.locale }));
  const result = await getPromoEvent(routeParams.id);
  const event = result.data;
  if (!event) notFound();

  return (
    <AppShell locale={locale} dict={dict} title={dict.promoEvents.detailTitle} currentPath={`/promo-events/${event.id}`} isDemo={result.isDemo}>
      <DataNotice dict={dict} error={result.error} />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={event.severity}>{translateEnum(dict, "severity", event.severity)}</Badge>
            <Badge>{translateEnum(dict, "channel", event.channel)}</Badge>
            <Badge>{translateEnum(dict, "eventType", event.event_type)}</Badge>
          </div>
          <h2 className="mt-3 text-lg font-semibold">{event.event_title}</h2>
          <p className="mt-2 text-sm text-slate-600">{event.event_summary}</p>
          <dl className="mt-5 grid gap-4 md:grid-cols-2">
            <div><dt className="text-xs text-slate-500">{dict.common.competitor}</dt><dd className="font-medium">{event.competitor_products?.brands?.name} / {event.competitor_products?.normalized_name}</dd></div>
            <div><dt className="text-xs text-slate-500">{dict.common.makukuSku}</dt><dd className="font-medium">{event.sku_master?.makuku_sku_name ?? "-"}</dd></div>
            <div><dt className="text-xs text-slate-500">{dict.promoEvents.oldIdrPc}</dt><dd className="font-medium">{formatPricePerPiece(event.old_price_per_piece)}</dd></div>
            <div><dt className="text-xs text-slate-500">{dict.promoEvents.newIdrPc}</dt><dd className="font-medium">{formatPricePerPiece(event.new_price_per_piece)}</dd></div>
            <div><dt className="text-xs text-slate-500">{dict.promoEvents.gapVsMakuku}</dt><dd className="font-medium">{formatPercent(event.price_gap_vs_makuku_pct)}</dd></div>
            <div><dt className="text-xs text-slate-500">{dict.promoEvents.started}</dt><dd className="font-medium">{formatJakartaTime(event.started_at)}</dd></div>
            <div><dt className="text-xs text-slate-500">{dict.common.city}</dt><dd className="font-medium">{event.city ?? "-"}</dd></div>
            <div><dt className="text-xs text-slate-500">{dict.common.evidence}</dt><dd className="font-medium">{event.evidence_url ? <a href={event.evidence_url} className="hover:underline">{dict.common.openEvidence}</a> : "-"}</dd></div>
          </dl>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-semibold">{dict.promoEvents.aiStrategy}</h2>
            <GenerateAiButton eventId={event.id} dict={dict} />
          </div>
          <div className="space-y-4">
            {(event.ai_strategy_recommendations ?? []).map((item) => (
              <div key={item.id} className="rounded-md border border-slate-200 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <Badge tone={item.risk_level}>{translateEnum(dict, "severity", item.risk_level)}</Badge>
                  <span className="text-xs text-slate-500">{translateEnum(dict, "recommendationStatus", item.status)} / {Math.round((item.confidence_score ?? 0) * 100)}%</span>
                </div>
                <p className="text-sm text-slate-700">{item.impact_summary}</p>
                <ul className="mt-3 space-y-2">
                  {item.recommended_actions.map((action, index) => (
                    <li key={`${item.id}-${index}`} className="rounded-md bg-slate-50 p-2 text-sm">
                      <div className="font-medium">{action.channel}: {action.action}</div>
                      <div className="text-slate-600">{action.reason}</div>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 text-sm text-slate-600">{dict.common.suggested}: {formatPricePerPiece(item.suggested_price_per_piece)}</div>
                <div className="mt-3 flex gap-2">
                  <RecommendationStatusButton recommendationId={item.id} status="accepted" dict={dict} />
                  <RecommendationStatusButton recommendationId={item.id} status="rejected" dict={dict} />
                </div>
              </div>
            ))}
            {(event.ai_strategy_recommendations ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">{dict.promoEvents.noAi}</p>
            ) : null}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
