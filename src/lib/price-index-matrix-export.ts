import XLSX from "xlsx-js-style";
import type {
  WeeklyPriceCoefficientBoard,
  WeeklyPriceCoefficientNode,
  WeeklyPriceCoefficientNodeLevel,
} from "./types.ts";

type WorkSheet = XLSX.WorkSheet;
type CellObject = XLSX.CellObject;
type Range = XLSX.Range;

export type PriceIndexExportLocale = "zh" | "en";

export type PriceIndexMatrixBuild = {
  aoa: Array<Array<string | number | null>>;
  merges: Range[];
  dataRowCount: number;
  dimCount: number;
  /** Absolute column indexes that hold average prices (for thousand-separator formatting). */
  avgColumnIndexes: number[];
  /** Absolute column indexes that hold coefficients. */
  coeffColumnIndexes: number[];
};

const AVG_NUM_FMT = "#,##0";
const COEFF_NUM_FMT = "0.00";

const THIN_BORDER = {
  top: { style: "thin" as const, color: { rgb: "CBD5E1" } },
  bottom: { style: "thin" as const, color: { rgb: "CBD5E1" } },
  left: { style: "thin" as const, color: { rgb: "CBD5E1" } },
  right: { style: "thin" as const, color: { rgb: "CBD5E1" } },
};

const HEADER_BRAND_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11, name: "Calibri" },
  fill: { patternType: "solid" as const, fgColor: { rgb: "1E293B" } },
  alignment: { horizontal: "center" as const, vertical: "center" as const, wrapText: true },
  border: THIN_BORDER,
};

const HEADER_METRIC_STYLE = {
  font: { bold: true, color: { rgb: "334155" }, sz: 10, name: "Calibri" },
  fill: { patternType: "solid" as const, fgColor: { rgb: "E2E8F0" } },
  alignment: { horizontal: "center" as const, vertical: "center" as const, wrapText: true },
  border: THIN_BORDER,
};

const HEADER_DIM_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11, name: "Calibri" },
  fill: { patternType: "solid" as const, fgColor: { rgb: "0F172A" } },
  alignment: { horizontal: "center" as const, vertical: "center" as const, wrapText: true },
  border: THIN_BORDER,
};

const DATA_TEXT_STYLE = {
  font: { sz: 10, name: "Calibri", color: { rgb: "0F172A" } },
  alignment: { horizontal: "left" as const, vertical: "center" as const },
  border: THIN_BORDER,
};

const DATA_NUM_STYLE = {
  font: { sz: 10, name: "Calibri", color: { rgb: "0F172A" } },
  alignment: { horizontal: "right" as const, vertical: "center" as const },
  border: THIN_BORDER,
};

const DIMENSION_HEADER: Record<WeeklyPriceCoefficientNodeLevel, { zh: string; en: string }> = {
  organization: { zh: "组织", en: "Organization" },
  province: { zh: "省", en: "Province" },
  city: { zh: "市", en: "City" },
  district: { zh: "区", en: "District" },
  size: { zh: "尺码", en: "Size" },
  sku: { zh: "SKU", en: "SKU" },
};

function nodeLabelForLevel(node: WeeklyPriceCoefficientNode, level: WeeklyPriceCoefficientNodeLevel) {
  switch (level) {
    case "organization":
      return node.organization;
    case "province":
      return node.province;
    case "city":
      return node.cityName;
    case "district":
      return node.district;
    case "size":
      return node.size;
    case "sku":
      return node.skuCode ? `${node.skuCode} ${node.skuName ?? ""}`.trim() : null;
  }
}

function metricLabel(weekLabel: string, kind: "avg" | "coeff", locale: PriceIndexExportLocale) {
  if (locale === "zh") {
    return kind === "avg" ? `${weekLabel} 均价` : `${weekLabel} 系数`;
  }
  return kind === "avg" ? `${weekLabel} Avg` : `${weekLabel} Coeff`;
}

function seriesHeaderLabel(
  label: string,
  isBenchmark: boolean,
  locale: PriceIndexExportLocale,
) {
  if (!isBenchmark) return label;
  return `${label}${locale === "zh" ? "（标杆）" : " (Benchmark)"}`;
}

function flattenNodes(nodes: WeeklyPriceCoefficientNode[]): WeeklyPriceCoefficientNode[] {
  const result: WeeklyPriceCoefficientNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children.length) result.push(...flattenNodes(node.children));
  }
  return result;
}

function colLetter(index: number) {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function cellAddress(row: number, col: number) {
  return `${colLetter(col)}${row + 1}`;
}

function ensureCell(sheet: WorkSheet, address: string) {
  if (!sheet[address]) sheet[address] = { t: "s", v: "" };
  return sheet[address] as CellObject;
}

/**
 * Build a dashboard-like matrix: dimension columns + brand × week (avg | coeff).
 */
export function buildPriceIndexMatrix(board: WeeklyPriceCoefficientBoard, locale: PriceIndexExportLocale): PriceIndexMatrixBuild {
  const dimensions = board.dimensions.length ? board.dimensions : (["organization", "size"] as WeeklyPriceCoefficientNodeLevel[]);
  const weeks = board.weeks;
  const weekSpan = weeks.length * 2;
  const dimCount = dimensions.length;

  const ownLabel = board.selectedOwnSeries
    ? `MAKUKU ${board.selectedOwnSeries}`
    : "MAKUKU";
  const brandHeaders = [
    { key: "own", label: ownLabel },
    ...board.competitorSeries.map((series) => ({
      key: series.key,
      label: seriesHeaderLabel(series.label, series.isBenchmark, locale),
    })),
  ];

  const headerRow0: Array<string | number | null> = dimensions.map((level) =>
    locale === "zh" ? DIMENSION_HEADER[level].zh : DIMENSION_HEADER[level].en,
  );
  const headerRow1: Array<string | number | null> = dimensions.map(() => null);

  const avgColumnIndexes: number[] = [];
  const coeffColumnIndexes: number[] = [];

  for (const brand of brandHeaders) {
    headerRow0.push(brand.label);
    for (let index = 1; index < weekSpan; index += 1) headerRow0.push(null);
    for (const week of weeks) {
      const avgCol = headerRow1.length;
      headerRow1.push(metricLabel(week.label, "avg", locale));
      avgColumnIndexes.push(avgCol);
      const coeffCol = headerRow1.length;
      headerRow1.push(metricLabel(week.label, "coeff", locale));
      coeffColumnIndexes.push(coeffCol);
    }
  }

  const merges: Range[] = [];
  for (let col = 0; col < dimCount; col += 1) {
    merges.push({ s: { r: 0, c: col }, e: { r: 1, c: col } });
  }
  for (let brandIndex = 0; brandIndex < brandHeaders.length; brandIndex += 1) {
    if (weekSpan <= 1) continue;
    const startCol = dimCount + brandIndex * weekSpan;
    merges.push({ s: { r: 0, c: startCol }, e: { r: 0, c: startCol + weekSpan - 1 } });
  }

  const nodes = flattenNodes(board.rows);
  const dataRows = nodes.map((node) => {
    const row: Array<string | number | null> = dimensions.map((level) =>
      node.level === level ? (nodeLabelForLevel(node, level) ?? "") : null,
    );

    const cellByWeek = new Map(node.cells.map((cell) => [cell.week, cell]));

    for (const week of weeks) {
      const cell = cellByWeek.get(week.key) ?? cellByWeek.get(week.label);
      row.push(cell?.ownAvgPrice ?? null);
      row.push(cell?.ownCoefficient ?? null);
    }

    for (const series of board.competitorSeries) {
      for (const week of weeks) {
        const cell = cellByWeek.get(week.key) ?? cellByWeek.get(week.label);
        const competitor = cell?.competitorCells.find((item) => item.seriesKey === series.key);
        row.push(competitor?.benchmarkAvgPrice ?? null);
        row.push(competitor?.coefficient ?? null);
      }
    }

    return row;
  });

  return {
    aoa: [headerRow0, headerRow1, ...dataRows],
    merges,
    dataRowCount: dataRows.length,
    dimCount,
    avgColumnIndexes,
    coeffColumnIndexes,
  };
}

/** Apply header styling, thousand-separator number formats, column widths. */
export function stylePriceIndexMatrixSheet(sheet: WorkSheet, matrix: PriceIndexMatrixBuild) {
  const colCount = matrix.aoa[0]?.length ?? 0;
  const avgCols = new Set(matrix.avgColumnIndexes);
  const coeffCols = new Set(matrix.coeffColumnIndexes);

  for (let col = 0; col < colCount; col += 1) {
    const isDim = col < matrix.dimCount;
    for (const row of [0, 1]) {
      const address = cellAddress(row, col);
      const cell = ensureCell(sheet, address);
      if (isDim) {
        cell.s = HEADER_DIM_STYLE;
      } else if (row === 0) {
        cell.s = HEADER_BRAND_STYLE;
      } else {
        cell.s = HEADER_METRIC_STYLE;
      }
    }
  }

  for (let row = 2; row < matrix.aoa.length; row += 1) {
    for (let col = 0; col < colCount; col += 1) {
      const address = cellAddress(row, col);
      const cell = sheet[address] as CellObject | undefined;
      if (!cell) continue;
      if (avgCols.has(col)) {
        cell.z = AVG_NUM_FMT;
        cell.s = DATA_NUM_STYLE;
      } else if (coeffCols.has(col)) {
        cell.z = COEFF_NUM_FMT;
        cell.s = DATA_NUM_STYLE;
      } else {
        cell.s = DATA_TEXT_STYLE;
      }
    }
  }

  sheet["!cols"] = Array.from({ length: colCount }, (_, col) => {
    if (col < matrix.dimCount) return { wch: col === 0 ? 22 : 12 };
    return { wch: 12 };
  });
  sheet["!rows"] = [{ hpt: 26 }, { hpt: 22 }];
  sheet["!freeze"] = {
    xSplit: matrix.dimCount,
    ySplit: 2,
    topLeftCell: cellAddress(2, matrix.dimCount),
    activePane: "bottomRight",
    state: "frozen",
  };
}

export function buildPriceIndexMatrixSheet(board: WeeklyPriceCoefficientBoard, locale: PriceIndexExportLocale) {
  const matrix = buildPriceIndexMatrix(board, locale);
  if (matrix.dataRowCount === 0 && board.rows.length === 0) {
    return XLSX.utils.aoa_to_sheet([[locale === "zh" ? "无数据" : "No data"]]);
  }
  const sheet = XLSX.utils.aoa_to_sheet(matrix.aoa);
  sheet["!merges"] = matrix.merges;
  stylePriceIndexMatrixSheet(sheet, matrix);
  return sheet;
}
