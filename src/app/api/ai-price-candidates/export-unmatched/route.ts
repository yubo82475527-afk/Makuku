import { requireAdminSession } from "@/lib/auth-session";
import { createSupabaseServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type UnmatchedExportRow = {
  candidate_id: string;
  visit_id: string;
  visit_code: string | null;
  store_name: string;
  visit_date: string;
  raw_brand: string | null;
  raw_product: string | null;
  size: string | null;
  piece_count: number | null;
  net_price_idr: number | null;
  price_per_piece: number | null;
  ai_match_method: string | null;
  matched_entity_type: string | null;
  matched_entity_id: string | null;
  matched_label: string | null;
  source_image_path: string | null;
  created_at: string;
};

function escapeCSV(value: any): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSV(rows: UnmatchedExportRow[]): string {
  const headers = [
    "candidate_id",
    "visit_code",
    "store_name",
    "visit_date",
    "raw_brand",
    "raw_product",
    "size",
    "piece_count",
    "net_price_idr",
    "price_per_piece",
    "ai_match_method",
    "matched_entity_type",
    "matched_entity_id",
    "matched_label",
    "source_image_path",
    "created_at",
  ];

  const csvRows = [headers.join(",")];

  for (const row of rows) {
    const values = [
      escapeCSV(row.candidate_id),
      escapeCSV(row.visit_code),
      escapeCSV(row.store_name),
      escapeCSV(row.visit_date),
      escapeCSV(row.raw_brand),
      escapeCSV(row.raw_product),
      escapeCSV(row.size),
      escapeCSV(row.piece_count),
      escapeCSV(row.net_price_idr),
      escapeCSV(row.price_per_piece),
      escapeCSV(row.ai_match_method),
      escapeCSV(row.matched_entity_type),
      escapeCSV(row.matched_entity_id),
      escapeCSV(row.matched_label),
      escapeCSV(row.source_image_path),
      escapeCSV(row.created_at),
    ];
    csvRows.push(values.join(","));
  }

  return csvRows.join("\n");
}

export async function GET(request: Request) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;

  try {
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get("date_from");
    const dateTo = url.searchParams.get("date_to");

    const supabase = createSupabaseServiceClient();

    // First, get total count
    let countQuery = supabase
      .from("ai_price_candidates")
      .select("id", { count: "exact", head: true })
      .eq("candidate_type", "SKU")
      .eq("matched_entity_type", "unmatched")
      .is("h5_lifecycle_status", null);

    if (dateFrom) {
      countQuery = countQuery.gte("created_at", dateFrom);
    }
    if (dateTo) {
      countQuery = countQuery.lte("created_at", dateTo);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      return Response.json({ error: countError.message }, { status: 500 });
    }

    const totalCount = count || 0;
    const batchSize = 1000;
    const allRows: UnmatchedExportRow[] = [];

    // Fetch in batches
    for (let offset = 0; offset < totalCount; offset += batchSize) {
      let query = supabase
        .from("ai_price_candidates")
        .select(`
          id,
          visit_id,
          raw_brand,
          raw_product,
          piece_count,
          net_price_idr,
          price_per_piece,
          ai_match_method,
          ai_match_evidence,
          matched_entity_type,
          matched_entity_id,
          matched_label,
          source_image_path,
          created_at,
          offline_store_visits!inner(
            visit_code,
            store_name,
            visit_date
          )
        `)
        .eq("candidate_type", "SKU")
        .eq("matched_entity_type", "unmatched")
        .is("h5_lifecycle_status", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + batchSize - 1);

      if (dateFrom) {
        query = query.gte("created_at", dateFrom);
      }
      if (dateTo) {
        query = query.lte("created_at", dateTo);
      }

      const { data, error } = await query;

      if (error) {
        return Response.json({ error: error.message }, { status: 500 });
      }

      // Transform to export format
      const batchRows: UnmatchedExportRow[] = (data || []).map((row: any) => ({
        candidate_id: row.id,
        visit_id: row.visit_id,
        visit_code: row.offline_store_visits?.visit_code || null,
        store_name: row.offline_store_visits?.store_name || "",
        visit_date: row.offline_store_visits?.visit_date || "",
        raw_brand: row.raw_brand,
        raw_product: row.raw_product,
        size: row.ai_match_evidence?.signature?.size || null,
        piece_count: row.piece_count,
        net_price_idr: row.net_price_idr,
        price_per_piece: row.price_per_piece,
        ai_match_method: row.ai_match_method,
        matched_entity_type: row.matched_entity_type,
        matched_entity_id: row.matched_entity_id,
        matched_label: row.matched_label,
        source_image_path: row.source_image_path,
        created_at: row.created_at,
      }));

      allRows.push(...batchRows);
    }

    const csv = toCSV(allRows);
    const filename = `unmatched-candidates-${new Date().toISOString().split("T")[0]}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
