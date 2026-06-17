import * as XLSX from "xlsx";

export type CompetitorProductExcelRow = {
  row_number: number;
  competitor_sku_code: string | null;
  brand: string;
  product_series: string | null;
  product_name: string;
  package_type: string;
  size: string;
  piece_count: number;
  target_material_sku_code: string | null;
  errors: string[];
};

export type CompetitorProductExcelPreview = {
  total_rows: number;
  product_count: number;
  brand_count: number;
  rows: CompetitorProductExcelRow[];
  errors: Array<{ row_number: number; errors: string[] }>;
};

export type CompetitorProductExcelImportInput = {
  competitor_sku_code?: string | null;
  brand?: string | null;
  product_series?: string | null;
  product_name?: string | null;
  package_type?: string | null;
  size?: string | null;
  piece_count?: number | string | null;
  target_material_sku_code?: string | null;
};

export function parseCompetitorProductExcel(buffer: ArrayBuffer): CompetitorProductExcelPreview {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { total_rows: 0, product_count: 0, brand_count: 0, rows: [], errors: [{ row_number: 0, errors: ["Empty workbook"] }] };

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const parsedRows = rows.map((row, index) => normalizeRow(row, index + 2));
  const errors = parsedRows.flatMap((row) => row.errors.length > 0 ? [{ row_number: row.row_number, errors: row.errors }] : []);
  return {
    total_rows: parsedRows.length,
    product_count: new Set(parsedRows.map((row) => row.competitor_sku_code || `${row.brand}|${row.product_series ?? ""}|${row.product_name}|${row.package_type}|${row.size}|${row.piece_count}`)).size,
    brand_count: new Set(parsedRows.map((row) => row.brand)).size,
    rows: parsedRows,
    errors,
  };
}

function normalizeRow(row: Record<string, unknown>, row_number: number): CompetitorProductExcelRow {
  const errors: string[] = [];
  const competitor_sku_code = cleanText(row.competitor_sku_code);
  const brand = cleanText(row.brand) ?? "";
  const product_series = cleanText(row.product_series);
  const product_name = cleanText(row.product_name) ?? "";
  const package_type = cleanText(row.package_type) || "unknown";
  const size = (cleanText(row.size) ?? "").toUpperCase();
  const target_material_sku_code = cleanText(row.target_material_sku_code);
  const piece_count = normalizePieceCount(row.piece_count);

  if (!brand) errors.push("brand is required");
  if (!product_name) errors.push("product_name is required");
  if (!size) errors.push("size is required");
  if (!piece_count) errors.push("piece_count must be a positive integer");
  if (!package_type) errors.push("package_type is required");

  return {
    row_number,
    competitor_sku_code,
    brand,
    product_series,
    product_name,
    package_type,
    size,
    piece_count,
    target_material_sku_code,
    errors,
  };
}

function normalizePieceCount(value: unknown) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return 0;
  return number;
}

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}
