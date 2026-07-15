import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/auth-session";
import { parseCompetitorProductExcel } from "@/lib/competitor-product-excel-import";

export async function POST(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;

    const formData = await request.formData();
    const intent = String(formData.get("intent") ?? "preview");
    const file = formData.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Missing Excel file" }, { status: 400 });

    const preview = parseCompetitorProductExcel(await file.arrayBuffer());
    if (intent !== "import") return Response.json({ preview: summarizePreview(preview) });
    if (preview.errors.length > 0) {
      return Response.json({ error: "Fix invalid rows before importing.", preview: summarizePreview(preview) }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const result = await replaceCompetitorMaster(supabase, preview);
    revalidatePath("/zh/competitor-products");
    revalidatePath("/en/competitor-products");
    revalidatePath("/zh/competitor-mappings");
    revalidatePath("/en/competitor-mappings");
    return Response.json({ preview: summarizePreview(preview), result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 500 });
  }
}

function summarizePreview(preview: ReturnType<typeof parseCompetitorProductExcel>) {
  return {
    ...preview,
    rows: preview.rows.slice(0, 50),
    errors: preview.errors.slice(0, 100),
  };
}

async function replaceCompetitorMaster(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  preview: ReturnType<typeof parseCompetitorProductExcel>,
) {
  const rows = preview.rows;
  const brandNames = Array.from(new Set(rows.map((row) => row.brand))).filter(Boolean);
  const { data: existingBrands, error: brandError } = await supabase
    .from("brands")
    .select("id,name,is_own_brand")
    .limit(10000);
  if (brandError) throw new Error(brandError.message);

  const brandMap = new Map((existingBrands ?? []).map((brand) => [normalizeKey(brand.name), brand]));
  const ownBrandKeys = new Set((existingBrands ?? []).filter((brand) => brand.is_own_brand).map((brand) => normalizeKey(brand.name)));
  const ownBrandRows = rows.filter((row) => ownBrandKeys.has(normalizeKey(row.brand)));
  if (ownBrandRows.length > 0) {
    throw new Error(`Own-brand rows cannot be imported as competitors: ${ownBrandRows.map((row) => row.brand).join(", ")}`);
  }

  const missingBrands = brandNames.filter((name) => !brandMap.has(normalizeKey(name)));
  if (missingBrands.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from("brands")
      .insert(missingBrands.map((name) => ({ name, country: "Indonesia", is_own_brand: false })))
      .select("id,name,is_own_brand");
    if (insertError) throw new Error(insertError.message);
    for (const brand of inserted ?? []) brandMap.set(normalizeKey(brand.name), brand);
  }

  const payload = rows.map((row) => ({
    competitor_sku_code: row.competitor_sku_code,
    brand_id: brandMap.get(normalizeKey(row.brand))?.id ?? null,
    raw_title: row.product_name,
    normalized_name: row.product_name,
    channel: "manual",
    shop_name: null,
    product_url: null,
    image_url: null,
    pack_type: inferPackType(row.product_name),
    product_series: row.product_series,
    package_type: row.package_type,
    size: row.size,
    piece_count: row.piece_count,
    segment: "unknown",
  }));
  if (payload.some((row) => !row.brand_id)) throw new Error("Unable to resolve one or more competitor brands");

  const { data, error } = await supabase.rpc("replace_competitor_product_master", { p_rows: payload });
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as { disabled_count?: number; inserted_count?: number; brand_count?: number };
  return {
    brands: missingBrands.length,
    disabled_competitor_products: Number(result.disabled_count ?? 0),
    competitor_products: Number(result.inserted_count ?? rows.length),
    row_errors: [],
  };
}

function normalizeKey(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function inferPackType(productName: string) {
  const text = productName.toLowerCase();
  if (text.includes("tape")) return "tape";
  if (text.includes("pants") || text.includes("pant") || text.includes("celana")) return "pants";
  return "unknown";
}
