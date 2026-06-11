import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/auth-session";

type MaterialImportRow = {
  tenant_sku_code: string;
  tenant_sku_name: string;
  category: string;
  sub_category: string;
  brand: string;
  sub_brand: string | null;
  type: string | null;
  sub_type: string | null;
  pack_count: number;
  box_count: number;
  pcs_price: number;
  f_expiry_date: string;
};

const expectedColumnCount = 12;
const maxFileSizeBytes = 10 * 1024 * 1024;
const allowedExtensions = [".xlsx", ".xls", ".csv"];

function requiredText(value: unknown, rowNumber: number, field: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`Row ${rowNumber}: missing ${field}`);
  return text;
}

function optionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function requiredNumber(value: unknown, rowNumber: number, field: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Row ${rowNumber}: invalid ${field}`);
  return number;
}

function dateToIso(value: unknown, rowNumber: number) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S))).toISOString();
    }
  }
  const text = requiredText(value, rowNumber, "f_expiry_date");
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error(`Row ${rowNumber}: invalid f_expiry_date`);
  return date.toISOString();
}

function parseWorkbook(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) throw new Error("No worksheet found");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });

  return rows
    .slice(1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row, index): MaterialImportRow => {
      const rowNumber = index + 2;
      if (row.length < expectedColumnCount) {
        throw new Error(`Row ${rowNumber}: expected ${expectedColumnCount} columns`);
      }

      return {
        tenant_sku_code: requiredText(row[0], rowNumber, "tenant_sku_code"),
        tenant_sku_name: requiredText(row[1], rowNumber, "tenant_sku_name"),
        category: requiredText(row[2], rowNumber, "category"),
        sub_category: requiredText(row[3], rowNumber, "sub_category"),
        brand: requiredText(row[4], rowNumber, "brand"),
        sub_brand: optionalText(row[5]),
        type: optionalText(row[6]),
        sub_type: optionalText(row[7]),
        pack_count: requiredNumber(row[8], rowNumber, "pack_count"),
        box_count: requiredNumber(row[9], rowNumber, "box_count"),
        pcs_price: requiredNumber(row[10], rowNumber, "pcs_price"),
        f_expiry_date: dateToIso(row[11], rowNumber),
      };
    });
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "Missing import file" }, { status: 400 });
    }
    if (file.size > maxFileSizeBytes) {
      return Response.json({ error: "Import file must be 10MB or smaller" }, { status: 400 });
    }

    const lowerName = file.name.toLowerCase();
    if (!allowedExtensions.some((extension) => lowerName.endsWith(extension))) {
      return Response.json({ error: "Only .xlsx, .xls, and .csv files are supported" }, { status: 400 });
    }

    const rows = parseWorkbook(await file.arrayBuffer());
    if (rows.length === 0) {
      return Response.json({ error: "No data rows found" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const { error } = await supabase
      .from("material_master")
      .upsert(rows, { onConflict: "tenant_sku_code" });

    if (error) return Response.json({ error: error.message }, { status: 400 });

    revalidatePath("/zh/sku-master");
    revalidatePath("/en/sku-master");

    return Response.json({
      imported: rows.length,
      importedCodes: rows.slice(0, 5).map((row) => row.tenant_sku_code),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
