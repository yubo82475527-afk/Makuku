import { currentBenchmarkPeriod, type BenchmarkPeriod } from "@/lib/periods";
import type { MarketBenchmarkPeriodPrice, MarketBenchmarkPeriodType, MarketBenchmarkRule, PriceSnapshot } from "@/lib/types";

export function latestPeriodPrice(rule: MarketBenchmarkRule, periodType: MarketBenchmarkPeriodType = "week") {
  const prices = [...(rule.market_benchmark_period_prices ?? [])]
    .filter((price) => price.period_type === periodType);
  if (periodType === "week") {
    const currentPeriod = currentBenchmarkPeriod("week");
    const currentPrice = prices.find((price) =>
      price.start_date === currentPeriod.startDate && price.end_date === currentPeriod.endDate,
    );
    if (currentPrice) return currentPrice;
  }
  return prices.sort((left, right) => right.start_date.localeCompare(left.start_date))[0] ?? null;
}

export function calculateBenchmarkAverage(input: {
  rule: Pick<MarketBenchmarkRule, "province" | "city_name" | "district" | "brand_id" | "product_series">;
  snapshots: PriceSnapshot[];
  period: BenchmarkPeriod;
}) {
  const prices = input.snapshots
    .filter((snapshot) => snapshotMatchesRule(snapshot, input.rule, input.period))
    .map((snapshot) => Number(snapshot.price_per_piece))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (prices.length === 0) return null;
  const average = prices.reduce((sum, value) => sum + value, 0) / prices.length;
  return {
    benchmark_price_per_piece: Math.round(average * 10000) / 10000,
    sample_count: prices.length,
  };
}

export function snapshotMatchesRule(
  snapshot: PriceSnapshot,
  rule: Pick<MarketBenchmarkRule, "province" | "city_name" | "district" | "brand_id" | "product_series">,
  period: Pick<BenchmarkPeriod, "startDate" | "endDate">,
) {
  const product = snapshot.competitor_products;
  if (!product || product.brand_id !== rule.brand_id) return false;
  if (normalizeText(product.product_series) !== normalizeText(rule.product_series)) return false;

  const capturedDate = dateKey(new Date(snapshot.captured_at));
  if (capturedDate < period.startDate || capturedDate > period.endDate) return false;

  const region = snapshotRegion(snapshot);
  if (!sameText(region.province, rule.province) || !sameText(region.cityName, rule.city_name)) return false;
  if (cleanText(rule.district) && !sameText(region.district, rule.district)) return false;
  return true;
}

export function benchmarkRegionLabel(rule: Pick<MarketBenchmarkRule, "province" | "city_name" | "district">) {
  return [rule.province, rule.city_name, rule.district].map(cleanText).filter(Boolean).join(" / ");
}

export function benchmarkSeriesLabel(rule: Pick<MarketBenchmarkRule, "product_series" | "brands">) {
  return [rule.brands?.name, rule.product_series].map(cleanText).filter(Boolean).join(" ");
}

export function formatBenchmarkPeriod(price: Pick<MarketBenchmarkPeriodPrice, "start_date" | "end_date"> | null) {
  return price ? `${price.start_date} ~ ${price.end_date}` : "-";
}

function snapshotRegion(snapshot: PriceSnapshot) {
  const visit = snapshot.ai_price_candidates?.[0]?.offline_store_visits;
  const store = snapshot.offline_stores;
  const fallback = splitLegacyRegion(visit?.city ?? store?.city);
  return {
    province: cleanText(visit?.province) ?? cleanText(store?.province) ?? fallback.province,
    cityName: cleanText(visit?.city_name) ?? cleanText(store?.city_name) ?? fallback.cityName,
    district: cleanText(visit?.district) ?? cleanText(store?.district) ?? fallback.district,
  };
}

function splitLegacyRegion(value: string | null | undefined) {
  const parts = String(value ?? "").split(" / ").map((part) => part.trim()).filter(Boolean);
  return {
    province: cleanText(parts[0]),
    cityName: cleanText(parts[1] ?? parts[0]),
    district: cleanText(parts[2]),
  };
}

function sameText(left: string | null | undefined, right: string | null | undefined) {
  return normalizeText(left) === normalizeText(right);
}

function normalizeText(value: string | null | undefined) {
  return cleanText(value)?.toLowerCase() ?? "";
}

function cleanText(value: string | null | undefined) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || null;
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
