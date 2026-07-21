import {
  getWeeklyPriceCoefficientBoard,
  type WeeklyPriceCoefficientFilters,
} from "@/lib/data";
import { normalizePriceIndexDimensions } from "@/lib/price-index-dimensions";
import type { WeeklyPriceCoefficientBoard } from "@/lib/types";

export type DashboardSearchParams = {
  month?: string;
  ownSeries?: string;
  organization?: string;
  dimensions?: string;
};

export type DashboardPricePayload = {
  data: {
    priceBoard: WeeklyPriceCoefficientBoard;
  };
  error: string | null;
  isDemo: boolean;
};

export async function getDashboardPriceData(
  locale: string,
  query: DashboardSearchParams,
): Promise<DashboardPricePayload> {
  const priceFilters: WeeklyPriceCoefficientFilters = {
    month: query.month || undefined,
    ownSeries: query.ownSeries || undefined,
    organization: query.organization || undefined,
    dimensions: normalizePriceIndexDimensions(query.dimensions),
  };

  const priceResult = await getWeeklyPriceCoefficientBoard(locale, priceFilters);
  return {
    data: { priceBoard: priceResult.data },
    error: priceResult.error,
    isDemo: priceResult.isDemo,
  };
}
