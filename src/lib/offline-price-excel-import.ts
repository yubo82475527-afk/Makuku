import * as XLSX from "xlsx";
import { normalizeProductGrade } from "@/lib/segments";
import type { Segment } from "@/lib/types";

export type OfflinePriceExcelWeek = {
  week: 1 | 2 | 3 | 4;
  source: string;
  captured_at: string;
  package_price: number | null;
  price_per_piece: number | null;
};

export type OfflinePriceExcelRow = {
  row_number: number;
  area: string;
  city: string;
  store_name: string;
  store_type: string;
  segment: Segment;
  brand: string;
  package_type: string;
  product_name: string;
  size: string;
  piece_count: number | null;
  is_makuku: boolean;
  weeks: OfflinePriceExcelWeek[];
  errors: string[];
};

export type OfflinePriceExcelPreview = {
  file_month: string;
  total_rows: number;
  store_count: number;
  product_spec_count: number;
  snapshot_count: number;
  error_count: number;
  rows: OfflinePriceExcelRow[];
  errors: Array<{ row_number: number; errors: string[] }>;
};

const requiredHeaders = [
  "AREA",
  "KOTA",
  "NAMA TOKO",
  "TYPE TOKO",
  "CATEGORY",
  "BRAND",
  "GPL 2",
  "NAMA PRODUCT MAKUKU",
  "SIZE",
  "PACK",
  "PRICE/ PACK W1",
  "PRICE/PCS W1",
  "PRICE/ PACK W2",
  "PRICE/PCS W2",
  "PRICE/ PACK W3",
  "PRICE/PCS W3",
  "PRICE/ PACK W4",
  "PRICE/PCS W4",
] as const;

const weekDays = [1, 8, 15, 22] as const;

export function parseOfflinePriceExcel(buffer: ArrayBuffer, fileName: string): OfflinePriceExcelPreview {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) throw new Error("No worksheet found");

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });
  const headerRow = rawRows[0]?.map((cell) => cleanText(cell).toUpperCase()) ?? [];
  const headerIndex = new Map(headerRow.map((header, index) => [header, index]));
  const missingHeaders = requiredHeaders.filter((header) => !headerIndex.has(header));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing columns: ${missingHeaders.join(", ")}`);
  }

  const fileMonth = inferFileMonth(fileName);
  const rows = rawRows
    .slice(1)
    .map((row, index) => parseRow(row, index + 2, headerIndex, fileMonth))
    .filter((row) => rowHasContent(row));

  const validRows = rows.filter((row) => row.errors.length === 0);
  const storeKeys = new Set(validRows.map((row) => storeKey(row)));
  const productKeys = new Set(validRows.map((row) => productKey(row)));
  const snapshotCount = validRows.reduce((sum, row) => sum + row.weeks.filter((week) => week.package_price !== null).length, 0);

  return {
    file_month: fileMonth,
    total_rows: rows.length,
    store_count: storeKeys.size,
    product_spec_count: productKeys.size,
    snapshot_count: snapshotCount,
    error_count: rows.filter((row) => row.errors.length > 0).length,
    rows,
    errors: rows.filter((row) => row.errors.length > 0).map((row) => ({ row_number: row.row_number, errors: row.errors })),
  };
}

export function storeKey(row: Pick<OfflinePriceExcelRow, "area" | "city" | "store_name" | "store_type">) {
  return [row.area, row.city, row.store_name, row.store_type].map(normalizeKey).join("|");
}

export function productKey(row: Pick<OfflinePriceExcelRow, "brand" | "package_type" | "product_name" | "size" | "piece_count">) {
  return [row.brand, row.package_type, row.product_name, row.size, row.piece_count ?? ""].map(normalizeKey).join("|");
}

export function importSource(fileMonth: string, week: number) {
  return `excel_import:${fileMonth}:W${week}`;
}

export function isAllowedStoreType(value: string) {
  return new Set([
    "BABY SHOP",
    "BS",
    "LKA",
    "LKA BS",
    "MODERN TRADE",
    "MT-LKA-BABYSHOP",
    "MT-LKA-SUPERMARKET",
    "NKA",
  ]).has(value);
}

function parseRow(row: unknown[], rowNumber: number, headerIndex: Map<string, number>, fileMonth: string): OfflinePriceExcelRow {
  const result: OfflinePriceExcelRow = {
    row_number: rowNumber,
    area: valueAt(row, headerIndex, "AREA"),
    city: valueAt(row, headerIndex, "KOTA"),
    store_name: valueAt(row, headerIndex, "NAMA TOKO"),
    store_type: valueAt(row, headerIndex, "TYPE TOKO"),
    segment: normalizeProductGrade(valueAt(row, headerIndex, "CATEGORY")),
    brand: valueAt(row, headerIndex, "BRAND"),
    package_type: valueAt(row, headerIndex, "GPL 2") || "unknown",
    product_name: valueAt(row, headerIndex, "NAMA PRODUCT MAKUKU"),
    size: valueAt(row, headerIndex, "SIZE").toUpperCase(),
    piece_count: positiveInteger(valueAt(row, headerIndex, "PACK")),
    is_makuku: valueAt(row, headerIndex, "BRAND").toLowerCase().startsWith("makuku"),
    weeks: [1, 2, 3, 4].map((week) => parseWeek(row, headerIndex, fileMonth, week as 1 | 2 | 3 | 4)),
    errors: [],
  };

  if (!result.store_name) result.errors.push("Missing NAMA TOKO");
  if (!result.store_type) result.errors.push("Missing TYPE TOKO");
  if (result.store_type && !isAllowedStoreType(result.store_type)) result.errors.push(`Unsupported TYPE TOKO: ${result.store_type}`);
  if (!result.brand) result.errors.push("Missing BRAND");
  if (!result.product_name) result.errors.push("Missing NAMA PRODUCT MAKUKU");
  if (!result.size) result.errors.push("Missing SIZE");
  if (!result.piece_count) result.errors.push("Invalid PACK");
  if (result.segment === "unknown") result.errors.push("Unknown CATEGORY");
  if (!result.weeks.some((week) => week.package_price !== null)) result.errors.push("No weekly package price");
  return result;
}

function parseWeek(row: unknown[], headerIndex: Map<string, number>, fileMonth: string, week: 1 | 2 | 3 | 4): OfflinePriceExcelWeek {
  return {
    week,
    source: importSource(fileMonth, week),
    captured_at: capturedAt(fileMonth, week),
    package_price: positiveNumber(valueAt(row, headerIndex, `PRICE/ PACK W${week}`)),
    price_per_piece: positiveNumber(valueAt(row, headerIndex, `PRICE/PCS W${week}`)),
  };
}

function capturedAt(fileMonth: string, week: 1 | 2 | 3 | 4) {
  const year = Number(fileMonth.slice(0, 4));
  const month = Number(fileMonth.slice(4, 6));
  return new Date(Date.UTC(year, month - 1, weekDays[week - 1], 5, 0, 0)).toISOString();
}

function inferFileMonth(fileName: string) {
  const match = fileName.match(/20\d{4}/);
  if (match) return match[0];
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function rowHasContent(row: OfflinePriceExcelRow) {
  return [
    row.area,
    row.city,
    row.store_name,
    row.store_type,
    row.brand,
    row.package_type,
    row.product_name,
    row.size,
    row.piece_count,
  ].some((value) => String(value ?? "").trim() !== "");
}

function valueAt(row: unknown[], headerIndex: Map<string, number>, header: string) {
  return cleanText(row[headerIndex.get(header) ?? -1]);
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
