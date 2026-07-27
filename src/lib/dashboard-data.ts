import {
  getPriceIndexPackageFilterOptions,
  getWeeklyPriceCoefficientBoard,
  type PriceIndexPackageFilterOptions,
  type WeeklyPriceCoefficientFilters,
} from "@/lib/data";
import type { DataScope } from "@/lib/data-scope";
import { normalizePriceIndexDimensions } from "@/lib/price-index-dimensions";
import type { WeeklyPriceCoefficientBoard } from "@/lib/types";

export type DashboardSearchParams = {
  month?: string;
  ownSeries?: string;
  ownPackage?: string;
  competitorPackage?: string;
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

export type DashboardPackageOptionsPayload = {
  data: PriceIndexPackageFilterOptions;
  error: string | null;
  isDemo: boolean;
};

export async function getDashboardPriceData(
  locale: string,
  query: DashboardSearchParams,
  dataScope?: DataScope,
): Promise<DashboardPricePayload> {
  const priceFilters: WeeklyPriceCoefficientFilters = {
    month: query.month || undefined,
    ownSeries: query.ownSeries || undefined,
    ownPackage: query.ownPackage || undefined,
    competitorPackage: query.competitorPackage || undefined,
    organization: query.organization || undefined,
    dimensions: normalizePriceIndexDimensions(query.dimensions),
    dataScope,
  };

  const priceResult = await getWeeklyPriceCoefficientBoard(locale, priceFilters);
  return {
    data: { priceBoard: priceResult.data },
    error: priceResult.error,
    isDemo: priceResult.isDemo,
  };
}

export async function getDashboardPackageOptionsData(
  query: Pick<DashboardSearchParams, "ownSeries" | "ownPackage">,
): Promise<DashboardPackageOptionsPayload> {
  const result = await getPriceIndexPackageFilterOptions({
    ownSeries: query.ownSeries || undefined,
    ownPackage: query.ownPackage || undefined,
  });
  return {
    data: result.data,
    error: result.error,
    isDemo: result.isDemo,
  };
}
