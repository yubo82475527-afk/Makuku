"use client";

import type { Locale } from "@/lib/i18n/config";
import { formatIdr } from "@/lib/format";
import { getMobileCopy } from "@/lib/mobile-i18n";
import { calculatePricePerPiece, parseIdrPrice } from "@/lib/price-utils";
import type { StoreVisitAiResult } from "@/lib/types";

export function StoreVisitResultCard({
  result,
  locale = "en",
}: {
  result: StoreVisitAiResult;
  locale?: Locale;
}) {
  const copy = getMobileCopy(locale).result;
  const shelf = result.shelf_understanding;
  const prices = result.price_insights;
  const promotions = result.promotion_insights;
  const promotionItems = (promotions?.competitor_promotions ?? []).length > 0
    ? (promotions?.competitor_promotions ?? []).map((item) => ({
      brand: item.brand,
      type: item.type,
      visibility: item.visibility,
      description: item.description,
    }))
    : result.competitor_promotion.map((item) => ({
      brand: item.brand,
      type: item.promotion_type,
      visibility: null,
      description: item.description,
    }));

  return (
    <section className="space-y-3">
      <ResultSection title={copy.validation}>
        <div className={`rounded-lg px-3 py-2 text-sm ${result.validation?.is_valid ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
          <div className="font-semibold">{result.validation?.is_valid ? copy.validAnalysis : copy.needsReview}</div>
          <div className="mt-1 text-xs">{(result.validation?.warnings ?? []).length} {copy.warnings}</div>
        </div>
        {(result.validation?.warnings ?? []).map((warning, index) => (
          <div key={`${warning.type}-${index}`} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <div className="font-semibold">{warning.type.replaceAll("_", " ")}</div>
            <div className="mt-1">{warning.message}</div>
          </div>
        ))}
      </ResultSection>

      <ResultSection title={copy.shelfUnderstanding}>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Metric label={copy.coverage} value={shelf?.category_coverage?.replaceAll("_", " ") ?? "PARTIAL"} />
          <Metric label={copy.condition} value={shelf?.shelf_condition?.replaceAll("_", " ") ?? "NORMAL"} />
        </div>
        {(shelf?.brands_present ?? []).length > 0 ? (
          <div className="space-y-2">
            {(shelf?.brands_present ?? []).map((item, index) => (
              <div key={`${item.brand}-${index}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="font-semibold">{item.brand}</span>
                <span className="text-slate-600">{item.shelf_share_estimate}% {copy.shelfShare}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyLine text={copy.noShelfData} />
        )}
      </ResultSection>

      <ResultSection title={copy.priceInsights}>
        {(prices?.key_sku_prices ?? result.price_detection).map((item, index) => {
          const packagePrice = parseIdrPrice(item.price);
          const pieceCount = "piece_count" in item ? item.piece_count : null;
          const pricePerPiece = calculatePricePerPiece(packagePrice, pieceCount);
          return (
            <div key={`${item.brand}-${item.product}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold">{item.brand} {item.product}</span>
                {"tag" in item ? <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">{item.tag}</span> : null}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <Metric label={copy.packagePrice} value={item.price || copy.priceUnclear} />
                <Metric label={copy.pieceCount} value={pieceCount ? String(pieceCount) : "-"} />
                <Metric label={copy.perPiecePrice} value={pricePerPiece ? formatIdr(pricePerPiece) : "-"} />
              </div>
            </div>
          );
        })}
        {(prices?.brand_price_range ?? []).length > 0 ? (
          <div className="space-y-2">
            {(prices?.brand_price_range ?? []).map((item, index) => (
              <div key={`${item.brand}-${index}`} className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900">
                <span className="font-semibold">{item.brand}</span>
                <span>{item.min_price} - {item.max_price}</span>
              </div>
            ))}
          </div>
        ) : null}
      </ResultSection>

      <ResultSection title={copy.stockRisk}>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-sm font-semibold">{result.stock_risk.level}</div>
          <p className="mt-1 text-sm text-slate-600">{result.stock_risk.reason}</p>
        </div>
        {(result.stock_risk.affected_brands ?? []).length > 0 ? (
          <div className="space-y-2">
            {(result.stock_risk.affected_brands ?? []).map((item, index) => (
              <div key={`${item.brand}-${index}`} className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <span className="font-semibold">{item.brand}</span>
                <span>{item.risk_signal.replaceAll("_", " ")}</span>
              </div>
            ))}
          </div>
        ) : null}
      </ResultSection>

      <ResultSection title={copy.promotionInsights}>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="font-semibold">{copy.promoPressure}</span>
          <span className="text-slate-500"> : </span>
          <span>{promotions?.promo_pressure_level ?? "LOW"}</span>
        </div>
        {promotionItems.map((item, index) => (
          <div key={`${item.brand}-${item.type}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold">{item.brand} {item.type}</span>
              {item.visibility ? <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">{item.visibility}</span> : null}
            </div>
            <div className="mt-1 text-slate-600">{item.description}</div>
          </div>
        ))}
      </ResultSection>

      <ResultSection title={copy.storeSummary}>
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900">{result.store_summary}</p>
      </ResultSection>

    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500">{text}</div>;
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-bold text-slate-900">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
