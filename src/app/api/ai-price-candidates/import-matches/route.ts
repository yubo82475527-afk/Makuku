import { requireAdminSession } from "@/lib/auth-session";
import { createSupabaseServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type ImportRow = {
  candidate_id: string;
  matched_entity_type: string | null;
  matched_entity_id: string | null;
  matched_label: string | null;
};

type ImportResult = {
  total: number;
  success: number;
  failed: number;
  errors: Array<{ row: number; candidate_id: string; error: string }>;
};

function parseCSV(csvText: string): ImportRow[] {
  const lines = csvText.split("\n").filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const candidateIdIndex = headers.indexOf("candidate_id");
  const entityTypeIndex = headers.indexOf("matched_entity_type");
  const entityIdIndex = headers.indexOf("matched_entity_id");
  const labelIndex = headers.indexOf("matched_label");

  if (candidateIdIndex === -1) {
    throw new Error("Missing required column: candidate_id");
  }

  const rows: ImportRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));

    const candidateId = values[candidateIdIndex];
    if (!candidateId) continue; // Skip empty rows

    rows.push({
      candidate_id: candidateId,
      matched_entity_type: entityTypeIndex >= 0 ? (values[entityTypeIndex] || null) : null,
      matched_entity_id: entityIdIndex >= 0 ? (values[entityIdIndex] || null) : null,
      matched_label: labelIndex >= 0 ? (values[labelIndex] || null) : null,
    });
  }

  return rows;
}

async function validateAndImport(rows: ImportRow[]): Promise<ImportResult> {
  const supabase = createSupabaseServiceClient();
  const result: ImportResult = {
    total: rows.length,
    success: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Validate
    if (!row.matched_entity_type || !row.matched_entity_id) {
      result.failed++;
      result.errors.push({
        row: i + 2, // +2 because of header and 0-index
        candidate_id: row.candidate_id,
        error: "matched_entity_type and matched_entity_id are required",
      });
      continue;
    }

    if (!["material", "material_master", "competitor_product"].includes(row.matched_entity_type)) {
      result.failed++;
      result.errors.push({
        row: i + 2,
        candidate_id: row.candidate_id,
        error: `Invalid matched_entity_type: ${row.matched_entity_type}. Must be one of: material, material_master, competitor_product`,
      });
      continue;
    }

    // Update ai_price_candidates
    const { error } = await supabase
      .from("ai_price_candidates")
      .update({
        matched_entity_type: row.matched_entity_type,
        matched_entity_id: row.matched_entity_id,
        matched_label: row.matched_label,
        // Reset quality gate status to trigger re-evaluation
        quality_gate_status: null,
        quality_gate_evaluated_at: null,
        quality_gate_reason_codes: null,
        review_method: "manual_import",
      })
      .eq("id", row.candidate_id)
      .eq("matched_entity_type", "unmatched"); // Only update unmatched candidates

    if (error) {
      result.failed++;
      result.errors.push({
        row: i + 2,
        candidate_id: row.candidate_id,
        error: error.message,
      });
    } else {
      result.success++;
    }
  }

  return result;
}

export async function POST(request: Request) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!file.name.endsWith(".csv")) {
      return Response.json({ error: "Only CSV files are supported" }, { status: 400 });
    }

    const csvText = await file.text();
    const rows = parseCSV(csvText);

    if (rows.length === 0) {
      return Response.json({ error: "No valid rows found in CSV" }, { status: 400 });
    }

    const result = await validateAndImport(rows);

    return Response.json({
      success: result.success > 0,
      result,
      message: `Imported ${result.success} of ${result.total} rows. ${result.failed} failed.`,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
