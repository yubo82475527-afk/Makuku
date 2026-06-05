import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, Card, DataNotice, MetricCard } from "@/components/ui";
import { formatIdr, formatJakartaTime, formatPricePerPiece } from "@/lib/format";
import { getDashboardCategoryChannelMatrix, getProductSegmentBattles } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import type { ProductSegmentBattle } from "@/lib/types";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const [matrixResult, segmentResult] = await Promise.all([
    getDashboardCategoryChannelMatrix(locale),
    getProductSegmentBattles(locale),
  ]);
  const isZh = locale === "zh";
  const matrix = matrixResult.data;
  const { summary, battles } = segmentResult.data;

  return (
    <AppShell locale={locale} dict={dict} title={dict.dashboard.title} currentPath="/dashboard" isDemo={matrixResult.isDemo || segmentResult.isDemo}>
      <DataNotice dict={dict} error={matrixResult.error ?? segmentResult.error} />

      <section className="mb-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-normal text-emerald-700">
              {isZh ? "\u0037\u5929\u6837\u677f\u76ee\u6807" : "7-day pilot objective"}
            </div>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">
              {isZh ? "\u4ea7\u54c1\u6218\u51b5\u603b\u89c8" : "Product Battle Overview"}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              {isZh
                ? "\u6309\u4ea7\u54c1\u7ebf/\u5c3a\u7801\u6bb5\u770b Makuku \u4e3b\u6570\u636e\u4ef7\u683c\u5e26\u6b63\u5728\u88ab\u54ea\u4e9b\u7ade\u54c1\u3001\u54ea\u4e9b\u6e20\u9053\u3001\u54ea\u4e9b\u4ef7\u683c\u8bc1\u636e\u538b\u5236\u3002"
                : "Read product segments first: Makuku price band versus competitor lows, channels, and evidence."}
            </p>
          </div>
          <Link href={`/${locale}/sku-master`} className="text-sm font-medium text-slate-700 hover:underline">
            {isZh ? "\u8fdb\u5165\u4ea7\u54c1\u4e3b\u6570\u636e" : "Open product master"}
          </Link>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={isZh ? "\u4ea7\u54c1\u7ebf/\u5c3a\u7801\u6bb5" : "Product Segments"} value={summary.segmentCount} hint={isZh ? "\u6309\u4ea7\u54c1\u7ebf\u548c\u5c3a\u7801\u805a\u5408" : "Grouped by line and size"} />
        <MetricCard label={isZh ? "\u4f4e\u4e8e Floor" : "Below Floor"} value={summary.belowFloorSegmentCount} hint={isZh ? "\u7ade\u54c1\u5230\u624b\u4ef7\u51fb\u7a7f\u5e95\u4ef7" : "Competitor low breached floor"} />
        <MetricCard label={isZh ? "\u4ef7\u683c\u8bc1\u636e" : "Price Evidence"} value={summary.evidenceCount} hint={isZh ? "\u4ef7\u683c\u5feb\u7167 + \u4fc3\u9500\u4e8b\u4ef6" : "Snapshots plus promo events"} />
        <MetricCard label={isZh ? "\u5bf9\u6807\u7ade\u54c1" : "Competitor SKUs"} value={summary.competitorProductCount} hint={isZh ? "\u5df2\u5339\u914d Makuku \u4ea7\u54c1\u6bb5" : "Matched to Makuku segments"} />
      </div>

      <ProductSegmentBattleBoard battles={battles.slice(0, 8)} isZh={isZh} />

      <section className="mt-6">
        <div className="mb-3">
          <h2 className="text-lg font-semibold">{isZh ? "\u8bca\u65ad\u6570\u636e" : "Diagnostics"}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {isZh
              ? "\u7528\u4e8e\u89e3\u91ca\u4ea7\u54c1\u4ef7\u683c\u538b\u529b\u7684\u6765\u6e90\uff0c\u4e0d\u4f5c\u4e3a\u9996\u5c4f\u4e3b\u7ebf\u3002"
              : "Use these views to explain product price pressure; they are not the first-screen story."}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label={isZh ? "\u57ce\u5e02" : "Cities"} value={matrix.totals.cityCount} hint={isZh ? "\u6709\u95e8\u5e97\u6216\u4fc3\u9500\u4fe1\u53f7" : "With store or promo signals"} />
          <MetricCard label={isZh ? "\u95e8\u5e97" : "Stores"} value={matrix.totals.storeCount} hint={isZh ? "\u5df2\u7eb3\u5165\u6837\u677f" : "In the pilot sample"} />
          <MetricCard label={isZh ? "\u8fd1 24h \u4fc3\u9500" : "24h Promos"} value={matrix.totals.recentPromoCount} hint={isZh ? "\u4ec5\u4f5c\u538b\u529b\u6765\u6e90" : "Pressure source only"} />
          <MetricCard label={isZh ? "AI \u4ef7\u683c\u51c6\u786e\u7387" : "AI Price Accuracy"} value={formatPercent(matrix.collection.approvedAccuracy)} hint={isZh ? `${matrix.collection.approvedCandidateCount} \u6761\u5df2\u5ba1\u6279` : `${matrix.collection.approvedCandidateCount} approved`} />
        </div>
      </section>
    </AppShell>
  );
}

function ProductSegmentBattleBoard({ battles, isZh }: { battles: ProductSegmentBattle[]; isZh: boolean }) {
  return (
    <Card className="mt-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{isZh ? "\u4ea7\u54c1\u7ebf/\u5c3a\u7801\u6bb5 VS \u7ade\u54c1\u4ef7\u683c\u538b\u529b" : "Product Segment Battle Board"}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {isZh
              ? "\u70b9\u51fb\u4ea7\u54c1\u6bb5\u8fdb\u5165\u5df2\u7b5b\u9009\u7684\u4ef7\u683c\u8bc1\u636e\u660e\u7ec6\u3002"
              : "Click a segment to open filtered price evidence."}
          </p>
        </div>
        <div className="text-sm text-slate-500">{battles.length} shown</div>
      </div>

      {battles.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
          {isZh ? "\u6682\u65e0\u4ea7\u54c1\u6bb5\u4ef7\u683c\u538b\u529b\u6570\u636e\u3002" : "No product segment pressure data yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {battles.map((battle) => (
            <ProductSegmentBattleRow key={battle.id} battle={battle} isZh={isZh} />
          ))}
        </div>
      )}
    </Card>
  );
}

function ProductSegmentBattleRow({ battle, isZh }: { battle: ProductSegmentBattle; isZh: boolean }) {
  return (
    <Link href={battle.href} className="block rounded-md border border-slate-200 px-3 py-3 hover:bg-slate-50">
      <div className="grid gap-3 lg:grid-cols-[minmax(180px,1.1fr)_minmax(0,2fr)_180px] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={battle.severity}>{battle.severity}</Badge>
            <span className="text-xs font-medium text-slate-500">{battle.makukuSkuCount} Makuku SKU</span>
          </div>
          <h3 className="mt-2 break-words text-base font-semibold text-slate-950">{battle.label}</h3>
          <div className="mt-1 text-xs text-slate-500">
            {battle.segmentLabels.length > 0 ? battle.segmentLabels.join(" / ") : "-"}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <BattleFact label={isZh ? "Makuku price band" : "Makuku price band"} value={formatPriceBand(battle)} />
          <BattleFact label={isZh ? "\u7ade\u54c1\u6700\u4f4e\u4ef7" : "Competitor low"} value={formatPricePerPiece(battle.lowestCompetitorPricePerPiece)} />
          <BattleFact label={isZh ? "Gap" : "Gap"} value={formatGap(battle.floorGapPct ?? battle.targetGapPct)} strong={Boolean(battle.floorGapPct !== null && battle.floorGapPct < 0)} />
        </div>

        <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
          <div className="font-medium text-slate-950">{battle.strongestCompetitorBrand ?? (isZh ? "\u65e0\u7ade\u54c1\u4ef7\u683c" : "No competitor low")}</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">
            {battle.strongestChannel ?? "-"} / {battle.evidenceCount} {isZh ? "\u6761\u8bc1\u636e" : "evidence"}
          </div>
          <div className="text-xs text-slate-500">{formatJakartaTime(battle.latestCapturedAt)}</div>
        </div>
      </div>
    </Link>
  );
}

function BattleFact({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md border border-slate-200 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={strong ? "mt-1 font-semibold text-red-700" : "mt-1 font-semibold text-slate-950"}>{value}</div>
    </div>
  );
}

function formatPriceBand(battle: ProductSegmentBattle) {
  const target = formatRange(battle.targetPriceMin, battle.targetPriceMax);
  const floor = formatRange(battle.floorPriceMin, battle.floorPriceMax);
  return `${target} / floor ${floor}`;
}

function formatRange(min: number | null, max: number | null) {
  if (min === null && max === null) return "-";
  if (min === max || max === null) return formatIdr(min);
  if (min === null) return formatIdr(max);
  return `${formatIdr(min)}-${formatIdr(max)}`;
}

function formatGap(value: number | null) {
  if (value === null) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatPercent(value: number | null) {
  return value === null ? "-" : `${Math.round(value * 100)}%`;
}
