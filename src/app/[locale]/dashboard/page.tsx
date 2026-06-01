import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, Card, DataNotice, MetricCard } from "@/components/ui";
import { getDashboardCategoryChannelMatrix } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import type { DashboardBattleMapCity, DashboardCategoryChannelCell, DashboardCityChannelCell, DashboardInsight } from "@/lib/types";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const matrixResult = await getDashboardCategoryChannelMatrix(locale);
  const matrix = matrixResult.data;
  const isZh = locale === "zh";

  return (
    <AppShell locale={locale} dict={dict} title={dict.dashboard.title} currentPath="/dashboard" isDemo={matrixResult.isDemo}>
      <DataNotice dict={dict} error={matrixResult.error} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={isZh ? "\u54c1\u7c7b\u6570" : "Categories"} value={matrix.totals.categoryCount} hint={isZh ? "\u6765\u81ea\u4e3b\u6570\u636e sub_brand" : "From material master sub_brand"} />
        <MetricCard label={isZh ? "\u6e20\u9053\u6570" : "Channels"} value={matrix.totals.channelCount} hint={isZh ? "\u5df2\u542f\u7528\u6e20\u9053" : "Active channel master"} />
        <MetricCard label={isZh ? "\u57ce\u5e02\u6570" : "Cities"} value={matrix.totals.cityCount} hint={isZh ? "\u95e8\u5e97+\u4fc3\u9500\u8986\u76d6" : "Store and promo coverage"} />
        <MetricCard label={isZh ? "\u95e8\u5e97\u6570" : "Stores"} value={matrix.totals.storeCount} hint={isZh ? "\u5df2\u5efa\u6863\u95e8\u5e97" : "Managed offline stores"} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <IndonesiaBattleMap cities={matrix.battleMapCities} isZh={isZh} />

          <Card>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{isZh ? "\u54c1\u7c7b x \u7ebf\u4e0b\u6e20\u9053\u4fc3\u9500\u77e9\u9635" : "Category x Offline Channel Promo Matrix"}</h2>
                <p className="mt-1 text-sm text-slate-500">{isZh ? "\u5355\u5143\u683c\u663e\u793a\u6570\u91cf\u3001\u98ce\u9669\u3001\u6298\u6263\u548c\u7a7a\u767d\u673a\u4f1a\uff0c\u70b9\u51fb\u8fdb\u5165\u4e8b\u4ef6\u6d41\u3002" : "Cells show count, risk, discount depth, and whitespace opportunities."}</p>
              </div>
              <Link href={`/${locale}/promo-events`} className="text-sm font-medium text-slate-700 hover:underline">{dict.common.viewAll}</Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="sticky left-0 bg-white py-2 pr-4">{isZh ? "\u54c1\u7c7b" : "Category"}</th>
                    {matrix.channels.map((channel) => (
                      <th key={channel.id} className="py-2 pr-3 text-center">{channel.name}</th>
                    ))}
                    <th className="py-2 pr-3 text-center">{isZh ? "\u5408\u8ba1" : "Total"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {matrix.rows.map((row) => (
                    <tr key={row.category}>
                      <td className="sticky left-0 bg-white py-3 pr-4 font-medium">{row.category}</td>
                      {row.cells.map((cell) => (
                        <td key={`${row.category}-${cell.channelCode}`} className="py-3 pr-3 text-center">
                          <MatrixSignalCell cell={cell} isZh={isZh} />
                        </td>
                      ))}
                      <td className="py-3 pr-3 text-center font-semibold">{row.totalPromoCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{isZh ? "\u57ce\u5e02 x \u7ebf\u4e0b\u6e20\u9053\u4fc3\u9500\u77e9\u9635" : "City x Offline Channel Promo Matrix"}</h2>
                <p className="mt-1 text-sm text-slate-500">{isZh ? "\u57ce\u5e02\u884c\u5c55\u793a\u95e8\u5e97\u8986\u76d6\u3001\u4fc3\u9500\u538b\u529b\u548c\u5f85\u8865\u91c7\u673a\u4f1a\u3002" : "Rows show store coverage, promo pressure, and capture opportunities."}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="sticky left-0 bg-white py-2 pr-4">{isZh ? "\u57ce\u5e02" : "City"}</th>
                    <th className="py-2 pr-3 text-center">{isZh ? "\u95e8\u5e97\u6570" : "Stores"}</th>
                    {matrix.channels.map((channel) => (
                      <th key={channel.id} className="py-2 pr-3 text-center">{channel.name}</th>
                    ))}
                    <th className="py-2 pr-3 text-center">{isZh ? "\u4fc3\u9500\u5408\u8ba1" : "Promo Total"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {matrix.cityRows.map((row) => (
                    <tr key={row.city}>
                      <td className="sticky left-0 bg-white py-3 pr-4 font-medium">{row.city}</td>
                      <td className="py-3 pr-3 text-center text-slate-700">{row.storeCount}</td>
                      {row.cells.map((cell) => (
                        <td key={`${row.city}-${cell.channelCode}`} className="py-3 pr-3 text-center">
                          <MatrixSignalCell cell={cell} isZh={isZh} />
                        </td>
                      ))}
                      <td className="py-3 pr-3 text-center font-semibold">{row.totalPromoCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <div className="mb-4">
              <h2 className="font-semibold">AI Insight</h2>
              <p className="mt-1 text-sm text-slate-500">
                {isZh ? "\u57fa\u4e8e\u54c1\u7c7b\u3001\u57ce\u5e02\u548c\u6e20\u9053\u77e9\u9635\u81ea\u52a8\u63d0\u70bc\u673a\u4f1a\u4e0e\u98ce\u9669\u3002" : "Rule-based opportunities and risks from the category, city, and channel matrices."}
              </p>
            </div>

            <InsightList
              title={isZh ? "\u589e\u957f\u673a\u4f1a" : "Growth Opportunities"}
              emptyText={isZh ? "\u6682\u65e0\u660e\u663e\u589e\u957f\u673a\u4f1a" : "No clear growth opportunities yet"}
              insights={matrix.insights.growthOpportunities}
            />

            <div className="mt-5 border-t border-slate-200 pt-4">
              <InsightList
                title={isZh ? "\u98ce\u9669\u6d1e\u5bdf" : "Risk Insights"}
                emptyText={isZh ? "\u6682\u65e0\u660e\u663e\u98ce\u9669\u4fe1\u53f7" : "No clear risk signals yet"}
                insights={matrix.insights.riskInsights}
              />
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function IndonesiaBattleMap({ cities, isZh }: { cities: DashboardBattleMapCity[]; isZh: boolean }) {
  const capturedCount = cities.filter((city) => city.captured).length;
  const strongCount = cities.filter((city) => city.competitionLevel === "strong").length;
  const missingShareCount = cities.filter((city) => city.shareSampleCount === 0).length;
  const topCities = cities.slice(0, 5);

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{isZh ? "\u5370\u5c3c\u57ce\u5e02\u6218\u51b5\u5730\u56fe" : "Indonesia City Battle Map"}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {isZh
              ? "\u7ea2\u8272\u4ee3\u8868\u4ef7\u683c\u7ade\u4e89\u5f3a\uff0c\u6d45\u8272\u4ee3\u8868\u7ade\u4e89\u5f31\uff1bMakuku \u8d27\u67b6\u4efd\u989d\u8fbe\u5230 30% \u89c6\u4e3a\u5df2\u5360\u9886\u3002"
              : "Red means heavy price competition, pale means weak competition; a city is captured when Makuku shelf share reaches 30%."}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <BattleStat label={isZh ? "\u5df2\u5360\u9886" : "Captured"} value={`${capturedCount}/${cities.length}`} />
          <BattleStat label={isZh ? "\u5f3a\u7ade\u4e89" : "Hot"} value={strongCount} />
          <BattleStat label={isZh ? "\u5f85\u8865\u91c7" : "Gaps"} value={missingShareCount} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="relative h-[360px] overflow-hidden rounded-md border border-slate-200 bg-[#eef7fb]">
          <div className="absolute left-[3%] top-[18%] h-14 w-[25%] -rotate-12 rounded-[45%] border border-slate-300 bg-slate-200" />
          <div className="absolute left-[25%] top-[59%] h-10 w-[30%] rotate-3 rounded-[45%] border border-slate-300 bg-slate-200" />
          <div className="absolute left-[41%] top-[34%] h-24 w-[23%] -rotate-12 rounded-[45%] border border-slate-300 bg-slate-200" />
          <div className="absolute left-[61%] top-[46%] h-20 w-[17%] rotate-12 rounded-[45%] border border-slate-300 bg-slate-200" />
          <div className="absolute left-[78%] top-[38%] h-24 w-[18%] rotate-2 rounded-[45%] border border-slate-300 bg-slate-200" />
          <div className="absolute bottom-3 left-4 text-xs font-medium uppercase tracking-normal text-slate-500">Indonesia</div>

          {cities.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
              {isZh ? "\u6682\u65e0\u57ce\u5e02\u6570\u636e" : "No city data yet"}
            </div>
          ) : null}

          {cities.map((city) => (
            <BattleCityMarker key={city.city} city={city} isZh={isZh} />
          ))}
        </div>

        <div className="flex flex-col justify-between gap-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">{isZh ? "\u4f18\u5148\u6218\u533a" : "Priority Cities"}</h3>
            <div className="space-y-2">
              {topCities.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500">
                  {isZh ? "\u7b49\u5f85\u95e8\u5e97\u6216\u4fc3\u9500\u6570\u636e" : "Waiting for store or promo data"}
                </div>
              ) : topCities.map((city) => (
                <Link key={city.city} href={city.href} className="block rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-950">{city.city}</span>
                    <Badge tone={city.captured ? "low" : city.maxSeverity ?? "neutral"}>{battleStatusLabel(city, isZh)}</Badge>
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    {isZh ? "\u4fc3\u9500" : "Promos"} {city.promoCount} / {isZh ? "\u95e8\u5e97" : "Stores"} {city.storeCount} / {isZh ? "\u4efd\u989d" : "Share"} {formatShare(city.makukuShareAvg)}
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
            <LegendItem className="bg-red-600" label={isZh ? "\u7ade\u4e89\u5f3a" : "Heavy"} />
            <LegendItem className="bg-amber-500" label={isZh ? "\u7ade\u4e89\u4e2d" : "Medium"} />
            <LegendItem className="bg-slate-300" label={isZh ? "\u7ade\u4e89\u5f31" : "Weak"} />
            <LegendItem className="bg-emerald-600" label={isZh ? "\u5df2\u5360\u9886" : "Captured"} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function BattleStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-16 rounded-md border border-slate-200 px-2 py-1.5">
      <div className="text-sm font-semibold text-slate-950">{value}</div>
      <div className="text-slate-500">{label}</div>
    </div>
  );
}

function BattleCityMarker({ city, isZh }: { city: DashboardBattleMapCity; isZh: boolean }) {
  const size = Math.min(54, 26 + city.promoCount * 5 + city.storeCount * 2);
  const markerClass = city.captured
    ? "border-emerald-950 bg-emerald-600 text-white ring-4 ring-emerald-100"
    : city.competitionLevel === "strong"
      ? "border-red-950 bg-red-600 text-white ring-4 ring-red-100"
      : city.competitionLevel === "medium"
        ? "border-amber-800 bg-amber-500 text-slate-950 ring-4 ring-amber-100"
        : "border-slate-500 bg-slate-300 text-slate-900 ring-4 ring-white";

  return (
    <Link
      href={city.href}
      title={`${city.city}: ${city.promoCount} promos, Makuku ${formatShare(city.makukuShareAvg)}`}
      className="absolute z-10 -translate-x-1/2 -translate-y-1/2 text-xs"
      style={{ left: `${city.x}%`, top: `${city.y}%` }}
    >
      <span
        className={`flex items-center justify-center rounded-full border text-[11px] font-semibold shadow-sm transition hover:scale-105 ${markerClass}`}
        style={{ width: size, height: size }}
      >
        {city.captured ? "30%+" : city.promoCount}
      </span>
      <span className="mt-1 block max-w-24 truncate rounded bg-white/90 px-1.5 py-0.5 text-center font-medium text-slate-700 shadow-sm">
        {city.city}
      </span>
      <span className="sr-only">{battleStatusLabel(city, isZh)}</span>
    </Link>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3 w-3 rounded-full ${className}`} />
      <span>{label}</span>
    </div>
  );
}

function battleStatusLabel(city: DashboardBattleMapCity, isZh: boolean) {
  if (city.captured) return isZh ? "\u5df2\u5360\u9886" : "Captured";
  if (city.shareSampleCount === 0) return isZh ? "\u5f85\u8865\u91c7" : "Capture gap";
  if (city.competitionLevel === "strong") return isZh ? "\u7ade\u4e89\u5f3a" : "Heavy";
  if (city.competitionLevel === "medium") return isZh ? "\u7ade\u4e89\u4e2d" : "Medium";
  return isZh ? "\u7ade\u4e89\u5f31" : "Weak";
}

function formatShare(value: number | null) {
  return value === null ? "NA" : `${value.toFixed(1)}%`;
}

function InsightList({ title, emptyText, insights }: { title: string; emptyText: string; insights: DashboardInsight[] }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{title}</h3>
      {insights.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500">{emptyText}</div>
      ) : (
        <div className="space-y-2">
          {insights.map((insight) => (
            <InsightItem key={insight.id} insight={insight} />
          ))}
        </div>
      )}
    </section>
  );
}

function InsightItem({ insight }: { insight: DashboardInsight }) {
  const content = (
    <div className="rounded-md border border-slate-200 px-3 py-3 hover:bg-slate-50">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium text-slate-950">{insight.title}</div>
        <Badge tone={insight.level}>{insight.level}</Badge>
      </div>
      <p className="mt-2 text-sm leading-5 text-slate-600">{insight.summary}</p>
    </div>
  );

  if (!insight.href) return content;
  return (
    <Link href={insight.href} className="block">
      {content}
    </Link>
  );
}

function MatrixSignalCell({ cell, isZh }: { cell: DashboardCategoryChannelCell | DashboardCityChannelCell; isZh: boolean }) {
  const hasRisk = cell.signalType === "risk";
  const isOpportunity = cell.signalType === "opportunity";
  const className = hasRisk
    ? "border-slate-900 bg-slate-950 text-white hover:bg-slate-800"
    : isOpportunity
      ? "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
      : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100";
  const label = hasRisk
    ? String(cell.promoCount)
    : isOpportunity
      ? (isZh ? "\u8865\u91c7" : "Capture")
      : "0";

  return (
    <Link
      href={cell.href}
      className={`mx-auto flex min-h-16 w-24 flex-col items-center justify-center rounded-md border px-2 py-2 text-xs transition ${className}`}
    >
      <span className="text-base font-semibold leading-none">{label}</span>
      <span className="mt-1 flex flex-wrap items-center justify-center gap-1">
        {cell.maxSeverity ? <Badge tone={cell.maxSeverity}>{cell.maxSeverity}</Badge> : null}
        {cell.maxDiscountRate !== null ? <span>{cell.maxDiscountRate.toFixed(1)}% off</span> : null}
        {cell.recentPromoCount > 0 ? <span>{isZh ? "\u8fd124h" : "24h"} {cell.recentPromoCount}</span> : null}
        {!hasRisk && isOpportunity ? <span>{isZh ? "\u673a\u4f1a" : "Opportunity"}</span> : null}
      </span>
    </Link>
  );
}
