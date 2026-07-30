import assert from "node:assert/strict";
import test from "node:test";
import { computePriceIndexCoefficients } from "../src/lib/price-index-coefficient.ts";

test("TC1: no competitor benchmark uses own as base", () => {
  const result = computePriceIndexCoefficients({
    ownAvgPrice: 100,
    competitorSeries: [
      { key: "A", isBenchmark: false, avgPrice: 80 },
      { key: "B", isBenchmark: false, avgPrice: 125 },
    ],
  });
  assert.equal(result.ownCoefficient, 1);
  assert.equal(result.competitorCoefficients.find((item) => item.key === "A")?.coefficient, 1.25);
  assert.equal(result.competitorCoefficients.find((item) => item.key === "B")?.coefficient, 0.8);
});

test("TC2: competitor benchmark rebases own and other competitors", () => {
  const result = computePriceIndexCoefficients({
    ownAvgPrice: 100,
    competitorSeries: [
      { key: "A", isBenchmark: true, avgPrice: 80 },
      { key: "B", isBenchmark: false, avgPrice: 100 },
    ],
  });
  assert.equal(result.competitorCoefficients.find((item) => item.key === "A")?.coefficient, 1);
  assert.equal(result.ownCoefficient, 0.8);
  assert.equal(result.competitorCoefficients.find((item) => item.key === "B")?.coefficient, 0.8);
});

test("TC3: same base separates cheaper and dearer competitors", () => {
  const result = computePriceIndexCoefficients({
    ownAvgPrice: 100,
    competitorSeries: [
      { key: "A", isBenchmark: true, avgPrice: 100 },
      { key: "B", isBenchmark: false, avgPrice: 80 },
      { key: "C", isBenchmark: false, avgPrice: 125 },
    ],
  });
  assert.equal(result.competitorCoefficients.find((item) => item.key === "A")?.coefficient, 1);
  assert.equal(result.ownCoefficient, 1);
  assert.equal(result.competitorCoefficients.find((item) => item.key === "B")?.coefficient, 1.25);
  assert.equal(result.competitorCoefficients.find((item) => item.key === "C")?.coefficient, 0.8);
});

test("TC4: rounds coefficients to two decimal places", () => {
  const noBench = computePriceIndexCoefficients({
    ownAvgPrice: 100,
    competitorSeries: [{ key: "A", isBenchmark: false, avgPrice: 30 }],
  });
  assert.equal(noBench.competitorCoefficients[0]?.coefficient, 3.33);

  const withBench = computePriceIndexCoefficients({
    ownAvgPrice: 100,
    competitorSeries: [{ key: "A", isBenchmark: true, avgPrice: 70 }],
  });
  assert.equal(withBench.ownCoefficient, 0.7);
  assert.equal(withBench.competitorCoefficients[0]?.coefficient, 1);
});

test("TC5: missing averages and benchmark fallback", () => {
  const noBase = computePriceIndexCoefficients({
    ownAvgPrice: null,
    competitorSeries: [{ key: "A", isBenchmark: false, avgPrice: 80 }],
  });
  assert.equal(noBase.ownCoefficient, null);
  assert.equal(noBase.competitorCoefficients[0]?.coefficient, null);

  const missingComp = computePriceIndexCoefficients({
    ownAvgPrice: 100,
    competitorSeries: [
      { key: "A", isBenchmark: false, avgPrice: null },
      { key: "B", isBenchmark: false, avgPrice: 80 },
    ],
  });
  assert.equal(missingComp.ownCoefficient, 1);
  assert.equal(missingComp.competitorCoefficients.find((item) => item.key === "A")?.coefficient, null);
  assert.equal(missingComp.competitorCoefficients.find((item) => item.key === "B")?.coefficient, 1.25);

  const benchMissingPrice = computePriceIndexCoefficients({
    ownAvgPrice: 100,
    competitorSeries: [
      { key: "A", isBenchmark: true, avgPrice: null },
      { key: "B", isBenchmark: false, avgPrice: 80 },
    ],
  });
  assert.equal(benchMissingPrice.ownCoefficient, 1);
  assert.equal(benchMissingPrice.competitorCoefficients.find((item) => item.key === "A")?.coefficient, null);
  assert.equal(benchMissingPrice.competitorCoefficients.find((item) => item.key === "B")?.coefficient, 1.25);

  const benchAndOwnMissing = computePriceIndexCoefficients({
    ownAvgPrice: null,
    competitorSeries: [
      { key: "A", isBenchmark: true, avgPrice: null },
      { key: "B", isBenchmark: false, avgPrice: 80 },
    ],
  });
  assert.equal(benchAndOwnMissing.ownCoefficient, null);
  assert.equal(benchAndOwnMissing.competitorCoefficients.find((item) => item.key === "A")?.coefficient, null);
  assert.equal(benchAndOwnMissing.competitorCoefficients.find((item) => item.key === "B")?.coefficient, null);

  const ownMissingWithBench = computePriceIndexCoefficients({
    ownAvgPrice: null,
    competitorSeries: [
      { key: "A", isBenchmark: true, avgPrice: 80 },
      { key: "B", isBenchmark: false, avgPrice: 100 },
    ],
  });
  assert.equal(ownMissingWithBench.ownCoefficient, null);
  assert.equal(ownMissingWithBench.competitorCoefficients.find((item) => item.key === "A")?.coefficient, 1);
  assert.equal(ownMissingWithBench.competitorCoefficients.find((item) => item.key === "B")?.coefficient, 0.8);
});

test("TC6: rejects legacy Own/Bench and Own/Comp results for rebasing case", () => {
  const result = computePriceIndexCoefficients({
    ownAvgPrice: 100,
    competitorSeries: [
      { key: "A", isBenchmark: true, avgPrice: 80 },
      { key: "B", isBenchmark: false, avgPrice: 100 },
    ],
  });
  assert.notEqual(result.ownCoefficient, 1.25);
  assert.equal(result.ownCoefficient, 0.8);
  assert.notEqual(result.competitorCoefficients.find((item) => item.key === "B")?.coefficient, 1);
  assert.equal(result.competitorCoefficients.find((item) => item.key === "B")?.coefficient, 0.8);
});

test("only the first priced default benchmark is identity 1 when multiple are flagged", () => {
  const result = computePriceIndexCoefficients({
    ownAvgPrice: 100,
    competitorSeries: [
      { key: "A", isBenchmark: true, avgPrice: 80 },
      { key: "B", isBenchmark: true, avgPrice: 100 },
    ],
  });
  assert.equal(result.competitorCoefficients.find((item) => item.key === "A")?.coefficient, 1);
  assert.equal(result.ownCoefficient, 0.8);
  assert.equal(result.competitorCoefficients.find((item) => item.key === "B")?.coefficient, 0.8);
});
