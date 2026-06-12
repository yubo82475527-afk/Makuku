import { requireAdminSession } from "@/lib/auth-session";
import { materialMasterColumns } from "@/lib/material-master";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type { MaterialMaster } from "@/lib/types";

export const dynamic = "force-dynamic";

function csvEscape(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadName() {
  const date = new Date().toISOString().slice(0, 10);
  return `sku-master-${date}.csv`;
}

export async function GET(request: Request) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("material_master")
    .select("*")
    .order("tenant_sku_code", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = ((data ?? []) as MaterialMaster[]).map((sku) => [
    sku.tenant_sku_code,
    sku.tenant_sku_name,
    sku.category,
    sku.sub_category,
    sku.brand,
    sku.sub_brand,
    sku.type,
    sku.sub_type,
    sku.pack_count,
    sku.box_count,
    sku.pcs_price,
    sku.f_expiry_date,
  ].map(csvEscape).join(","));

  const csv = [materialMasterColumns.map(csvEscape).join(","), ...rows].join("\r\n");
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": `attachment; filename="${downloadName()}"`,
      "Cache-Control": "no-store",
    },
  });
}
