import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseCompetitorProductExcel } from "../src/lib/competitor-product-excel-import.ts";

function workbookBuffer(rows: Record<string, unknown>[]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "sku");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const validRow = {
  brand: "SWEETY",
  product_series: "DRY CARE",
  product_name: "SWEETY DRY CARE PANTS M14",
  package_type: "BIG PACK",
  size: "M",
  piece_count: 14,
};

test("piece_count is accepted directly as an integer total", () => {
  const preview = parseCompetitorProductExcel(workbookBuffer([validRow]));
  assert.equal(preview.errors.length, 0);
  assert.equal(preview.rows[0].piece_count, 14);
  assert.equal("target_material_sku_code" in preview.rows[0], false);
});

test("package expressions are rejected instead of recalculated", () => {
  const preview = parseCompetitorProductExcel(workbookBuffer([{ ...validRow, piece_count: "10+4" }]));
  assert.match(preview.rows[0].errors.join(" "), /positive integer/);
});

test("blank required fields are rejected", () => {
  const preview = parseCompetitorProductExcel(workbookBuffer([{ ...validRow, brand: "" }]));
  assert.match(preview.rows[0].errors.join(" "), /brand is required/);
});

