/** Price Index coefficient: baseAvg / brandAvg (2 decimals). Own is base when no competitor benchmark. */

export type PriceIndexCompetitorSeriesInput = {
  key: string;
  isBenchmark: boolean;
  avgPrice: number | null;
};

export type PriceIndexCoefficientResult = {
  ownCoefficient: number | null;
  competitorCoefficients: { key: string; coefficient: number | null }[];
};

function isPositiveAvg(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function roundCoefficient(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Coefficient = round(benchmarkAvg / brandAvg, 2).
 * Benchmark column (own or competitor) is 1 when that brand has an average.
 * If no competitor series is both flagged and priced, own average is the base.
 */
export function computePriceIndexCoefficients(input: {
  ownAvgPrice: number | null;
  competitorSeries: PriceIndexCompetitorSeriesInput[];
}): PriceIndexCoefficientResult {
  const benchmarkWithPrice = input.competitorSeries.find(
    (series) => series.isBenchmark && isPositiveAvg(series.avgPrice),
  );
  const baseAvg = isPositiveAvg(benchmarkWithPrice?.avgPrice)
    ? benchmarkWithPrice.avgPrice
    : isPositiveAvg(input.ownAvgPrice)
      ? input.ownAvgPrice
      : null;
  const ownIsBenchmark = !benchmarkWithPrice;

  let ownCoefficient: number | null = null;
  if (baseAvg !== null) {
    if (ownIsBenchmark) {
      ownCoefficient = isPositiveAvg(input.ownAvgPrice) ? 1 : null;
    } else if (isPositiveAvg(input.ownAvgPrice)) {
      ownCoefficient = roundCoefficient(baseAvg / input.ownAvgPrice);
    }
  }

  const competitorCoefficients = input.competitorSeries.map((series) => {
    // Only the series actually used as base is identity 1; extra flagged benchmarks rebase like peers.
    if (benchmarkWithPrice && series.key === benchmarkWithPrice.key) {
      return { key: series.key, coefficient: 1 as number | null };
    }
    if (baseAvg === null || !isPositiveAvg(series.avgPrice)) {
      return { key: series.key, coefficient: null };
    }
    return { key: series.key, coefficient: roundCoefficient(baseAvg / series.avgPrice) };
  });

  return { ownCoefficient, competitorCoefficients };
}
