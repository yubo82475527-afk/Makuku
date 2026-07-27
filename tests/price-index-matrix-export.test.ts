import assert from "node:assert/strict";
import test from "node:test";
import { buildPriceIndexMatrix, buildPriceIndexMatrixSheet } from "../src/lib/price-index-matrix-export.ts";
import type { WeeklyPriceCoefficientBoard } from "../src/lib/types.ts";

function mockBoard(): WeeklyPriceCoefficientBoard {
  return {
    dimensions: ["organization", "size"],
    month: "2026-07",
    title: "BABY DIAPERS MID",
    ownSeriesOptions: ["Comfort Fit"],
    selectedOwnSeries: "Comfort Fit",
    ownPackageOptions: [],
    selectedOwnPackage: [],
    competitorPackageOptions: [],
    selectedCompetitorPackage: [],
    skuOptions: [],
    selectedSku: null,
    organizationOptions: ["GREATER JAKARTA"],
    selectedOrganization: null,
    weeks: [
      { key: "W1", label: "W1", startDate: "2026-07-01", endDate: "2026-07-07" },
      { key: "W2", label: "W2", startDate: "2026-07-08", endDate: "2026-07-14" },
    ],
    competitorSeries: [
      { key: "sweety", label: "SWEETY SILVER", brand: "SWEETY", series: "SILVER", isBenchmark: true },
    ],
    rows: [
      {
        id: "org-1",
        level: "organization",
        organization: "GREATER JAKARTA",
        province: null,
        cityName: null,
        district: null,
        size: null,
        skuCode: null,
        skuName: null,
        cells: [
          {
            week: "W1",
            startDate: "2026-07-01",
            endDate: "2026-07-07",
            ownAvgPrice: 1803,
            ownCoefficient: 0.82,
            ownSampleCount: 10,
            ownHref: "#",
            competitorCells: [
              {
                seriesKey: "sweety",
                benchmarkAvgPrice: 2200,
                benchmarkSampleCount: 8,
                coefficient: 1,
                benchmarkHref: "#",
              },
            ],
          },
          {
            week: "W2",
            startDate: "2026-07-08",
            endDate: "2026-07-14",
            ownAvgPrice: 1900,
            ownCoefficient: 0.85,
            ownSampleCount: 9,
            ownHref: "#",
            competitorCells: [
              {
                seriesKey: "sweety",
                benchmarkAvgPrice: 2235,
                benchmarkSampleCount: 7,
                coefficient: 1,
                benchmarkHref: "#",
              },
            ],
          },
        ],
        children: [
          {
            id: "size-m",
            level: "size",
            organization: "GREATER JAKARTA",
            province: null,
            cityName: null,
            district: null,
            size: "M",
            skuCode: null,
            skuName: null,
            cells: [
              {
                week: "W1",
                startDate: "2026-07-01",
                endDate: "2026-07-07",
                ownAvgPrice: 1700,
                ownCoefficient: 0.8,
                ownSampleCount: 4,
                ownHref: "#",
                competitorCells: [
                  {
                    seriesKey: "sweety",
                    benchmarkAvgPrice: 2100,
                    benchmarkSampleCount: 3,
                    coefficient: 1,
                    benchmarkHref: "#",
                  },
                ],
              },
              {
                week: "W2",
                startDate: "2026-07-08",
                endDate: "2026-07-14",
                ownAvgPrice: null,
                ownCoefficient: null,
                ownSampleCount: 0,
                ownHref: "#",
                competitorCells: [],
              },
            ],
            children: [],
          },
        ],
      },
    ],
  };
}

test("price index matrix uses brand x week headers with avg and coeff columns", () => {
  const matrix = buildPriceIndexMatrix(mockBoard(), "zh");
  const [row0, row1] = matrix.aoa;

  assert.deepEqual(row0.slice(0, 2), ["组织", "尺码"]);
  assert.equal(row0[2], "MAKUKU Comfort Fit");
  assert.equal(row0[6], "SWEETY SILVER（标杆）");
  assert.deepEqual(row1.slice(2, 6), ["W1 均价", "W1 系数", "W2 均价", "W2 系数"]);
  assert.deepEqual(row1.slice(6, 10), ["W1 均价", "W1 系数", "W2 均价", "W2 系数"]);
  assert.deepEqual(matrix.avgColumnIndexes, [2, 4, 6, 8]);
  assert.deepEqual(matrix.coeffColumnIndexes, [3, 5, 7, 9]);

  assert.ok(matrix.merges.some((merge) => merge.s.r === 0 && merge.e.r === 1 && merge.s.c === 0));
  assert.ok(matrix.merges.some((merge) => merge.s.r === 0 && merge.s.c === 2 && merge.e.c === 5));
  assert.ok(matrix.merges.some((merge) => merge.s.r === 0 && merge.s.c === 6 && merge.e.c === 9));
});

test("price index matrix emits one data row per tree node, not node x week", () => {
  const matrix = buildPriceIndexMatrix(mockBoard(), "zh");
  assert.equal(matrix.dataRowCount, 2);
  assert.equal(matrix.aoa.length, 4);

  const orgRow = matrix.aoa[2];
  assert.equal(orgRow[0], "GREATER JAKARTA");
  assert.equal(orgRow[1], null);
  assert.equal(orgRow[2], 1803);
  assert.equal(orgRow[3], 0.82);
  assert.equal(orgRow[6], 2200);
  assert.equal(orgRow[7], 1);

  const sizeRow = matrix.aoa[3];
  assert.equal(sizeRow[0], null);
  assert.equal(sizeRow[1], "M");
  assert.equal(sizeRow[2], 1700);
  assert.equal(sizeRow[4], null);
});

test("price index matrix does not use long-table path/level/week columns", () => {
  const matrix = buildPriceIndexMatrix(mockBoard(), "zh");
  const flatHeaders = matrix.aoa.slice(0, 2).flat().map(String);
  assert.equal(flatHeaders.includes("路径"), false);
  assert.equal(flatHeaders.includes("层级"), false);
  assert.equal(flatHeaders.includes("周"), false);
  assert.equal(flatHeaders.includes("自有均价"), false);
});

test("price index matrix sheet styles headers and formats avg with thousand separators", () => {
  const sheet = buildPriceIndexMatrixSheet(mockBoard(), "zh");
  assert.equal(sheet.C1?.s?.fill?.fgColor?.rgb, "1E293B");
  assert.equal(sheet.C2?.s?.fill?.fgColor?.rgb, "E2E8F0");
  assert.equal(sheet.A1?.s?.fill?.fgColor?.rgb, "0F172A");
  assert.equal(sheet.C3?.z, "#,##0");
  assert.equal(sheet.D3?.z, "0.00");
  assert.equal(sheet.C3?.v, 1803);
  assert.ok(Array.isArray(sheet["!cols"]));
  assert.equal(sheet["!rows"]?.[0]?.hpt, 26);
});
