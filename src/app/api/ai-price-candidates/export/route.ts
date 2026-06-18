import { getAiPriceCandidates } from "@/lib/data";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";
import type { AiPriceCandidate, MaterialMaster } from "@/lib/types";

const csvColumns = [
  "candidate_id",
  "visit_code",
  "visit_date",
  "store_name",
  "city",
  "channel_type",
  "raw_brand",
  "raw_product",
  "raw_price",
  "parsed_price_idr",
  "piece_count",
  "price_per_piece",
  "candidate_type",
  "ai_confidence",
  "matched_sku_code",
  "matched_sku_name",
  "matched_entity_type",
  "match_rate",
  "warnings",
  "status",
  "reviewed_price_per_piece",
  "accuracy",
  "reviewed_at",
  "created_at",
];

function isDateInput(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function csvEscape(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function formatRate(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return `${Math.round(value * 100)}%`;
}

function priceAccuracy(candidate: AiPriceCandidate) {
  if (!candidate.price_per_piece || !candidate.reviewed_price_per_piece || candidate.reviewed_price_per_piece <= 0) return null;
  return Math.max(0, 1 - Math.abs(candidate.price_per_piece - candidate.reviewed_price_per_piece) / candidate.reviewed_price_per_piece);
}

function warningText(candidate: AiPriceCandidate) {
  return (candidate.warnings ?? [])
    .map((warning) => warning.message)
    .filter(Boolean)
    .join(" | ");
}

function downloadName(dateFrom: string | null, dateTo: string | null) {
  const range = [dateFrom, dateTo].filter(Boolean).join("-to-");
  return range ? `ai-price-candidates-${range}.csv` : "ai-price-candidates.csv";
}

async function getMaterialMap(candidates: AiPriceCandidate[]) {
  const skuCodes = Array.from(new Set(candidates
    .filter((candidate) => candidate.matched_entity_type === "material_master" && candidate.matched_entity_id)
    .map((candidate) => candidate.matched_entity_id as string)));

  if (skuCodes.length === 0 || !hasSupabaseServiceConfig()) return new Map<string, MaterialMaster>();

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("material_master")
    .select("tenant_sku_code,tenant_sku_name,category,sub_category,brand,sub_brand,type,sub_type,pack_count,box_count,pcs_price,f_expiry_date")
    .in("tenant_sku_code", skuCodes);

  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as MaterialMaster[]).map((item) => [item.tenant_sku_code, item]));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const visitCode = searchParams.get("visit_code")?.trim();
    const status = searchParams.get("status");

    if ((dateFrom && !isDateInput(dateFrom)) || (dateTo && !isDateInput(dateTo))) {
      return Response.json({ error: "date_from and date_to must use YYYY-MM-DD" }, { status: 400 });
    }
    if (status && !["pending", "approved", "rejected"].includes(status)) {
      return Response.json({ error: "status must be pending, approved, or rejected" }, { status: 400 });
    }

    const result = await getAiPriceCandidates({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      visitCode: visitCode || undefined,
      status: status ? status as "pending" | "approved" | "rejected" : undefined,
      limit: 5000,
    });
    if (result.error && !result.isDemo) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    const materialMap = await getMaterialMap(result.data);
    const rows = result.data.map((candidate) => {
      const visit = candidate.offline_store_visits;
      const material = candidate.matched_entity_type === "material_master" && candidate.matched_entity_id
        ? materialMap.get(candidate.matched_entity_id)
        : null;

      return [
        candidate.id,
        visit?.visit_code,
        visit?.visit_date,
        visit?.store_name,
        visit?.city,
        visit?.channel_type,
        candidate.raw_brand,
        candidate.raw_product,
        candidate.raw_price,
        candidate.parsed_price_idr,
        candidate.piece_count,
        candidate.price_per_piece,
        candidate.candidate_type,
        formatRate(candidate.ai_confidence),
        material?.tenant_sku_code,
        material?.tenant_sku_name,
        candidate.matched_entity_type,
        formatRate(candidate.match_score),
        warningText(candidate),
        candidate.status,
        candidate.reviewed_price_per_piece,
        formatRate(priceAccuracy(candidate)),
        candidate.reviewed_at,
        candidate.created_at,
      ].map(csvEscape).join(",");
    });

    const csv = [csvColumns.join(","), ...rows].join("\r\n");
    return new Response(`\uFEFF${csv}`, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="${downloadName(dateFrom, dateTo)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Export failed" }, { status: 500 });
  }
}
