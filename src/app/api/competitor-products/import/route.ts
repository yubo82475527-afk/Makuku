import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/auth-session";
import { parseCompetitorProductExcel } from "@/lib/competitor-product-excel-import";
import { ensureSkuMasterFromMaterial } from "@/lib/sku-master-bridge";

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

    const supabase = createSupabaseServiceClient();
    const result = await importPreview(supabase, preview);
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

async function importPreview(supabase: ReturnType<typeof createSupabaseServiceClient>, preview: ReturnType<typeof parseCompetitorProductExcel>) {
  const rows = preview.rows.filter((row) => row.errors.length === 0);
  const brandResult = await ensureBrands(supabase, rows);
  const productResult = await upsertProducts(supabase, rows, brandResult.brandMap, brandResult.ownBrandKeys);
  const mappingResult = await applyMappings(supabase, productResult.products, rows);

  return {
    brands: brandResult.insertedCount,
    competitor_products: productResult.insertedCount + productResult.updatedCount,
    mapped_count: mappingResult.mappedCount,
    skipped_manual_mappings: mappingResult.skippedManualCount,
    row_errors: [...productResult.rowErrors, ...mappingResult.rowErrors].slice(0, 100),
  };
}

async function ensureBrands(supabase: ReturnType<typeof createSupabaseServiceClient>, rows: ReturnType<typeof parseCompetitorProductExcel>["rows"]) {
  const brandNames = Array.from(new Set(rows.map((row) => row.brand))).filter(Boolean);
  const { data, error } = await supabase.from("brands").select("id,name,is_own_brand").limit(10000);
  if (error) throw new Error(error.message);
  const brandMap = new Map((data ?? []).map((brand) => [normalizeKey(brand.name), brand.id]));
  const ownBrandKeys = new Set((data ?? []).filter((brand) => brand.is_own_brand).map((brand) => normalizeKey(brand.name)));
  const missing = brandNames.filter((name) => !brandMap.has(normalizeKey(name)));
  if (missing.length > 0) {
    const { data: inserted, error: insertError } = await supabase.from("brands").insert(missing.map((name) => ({ name, country: "Indonesia", is_own_brand: false }))).select("id,name");
    if (insertError) throw new Error(insertError.message);
    for (const brand of inserted ?? []) brandMap.set(normalizeKey(brand.name), brand.id);
  }
  return { brandMap, ownBrandKeys, insertedCount: missing.length };
}

async function upsertProducts(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  rows: ReturnType<typeof parseCompetitorProductExcel>["rows"],
  brands: Map<string, string>,
  ownBrandKeys: Set<string>,
) {
  const { data: existing, error } = await supabase.from("competitor_products").select("*, brands(id,name), sku_matches(*, sku_master(*))").limit(10000);
  if (error) throw new Error(error.message);

  const productsByCode = new Map<string, string>();
  for (const product of (existing ?? [])) {
    if (product.competitor_sku_code) productsByCode.set(product.competitor_sku_code, product.id);
  }

  const rowErrors: Array<{ row_number: number; errors: string[] }> = [];
  let insertedCount = 0;
  let updatedCount = 0;
  const products: Array<{ id: string; competitor_sku_code?: string | null; target_material_sku_code: string | null; row_number: number }> = [];

  for (const row of rows) {
    if (ownBrandKeys.has(normalizeKey(row.brand))) {
      rowErrors.push({ row_number: row.row_number, errors: [`Own brand cannot be imported as competitor: ${row.brand}`] });
      continue;
    }
    const brand_id = brands.get(normalizeKey(row.brand));
    if (!brand_id) {
      rowErrors.push({ row_number: row.row_number, errors: [`Unknown brand ${row.brand}`] });
      continue;
    }

    const lookupCode = row.competitor_sku_code?.trim();
    const payload = {
      brand_id,
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
      status: "active",
    };

    if (lookupCode) {
      const existingId = productsByCode.get(lookupCode);
      if (!existingId) {
        rowErrors.push({ row_number: row.row_number, errors: [`Competitor SKU code not found: ${lookupCode}`] });
        continue;
      }
      const { data, error: updateError } = await supabase
        .from("competitor_products")
        .update(payload)
        .eq("competitor_sku_code", lookupCode)
        .select("id,competitor_sku_code")
        .single();
      if (updateError) {
        rowErrors.push({ row_number: row.row_number, errors: [updateError.message] });
        continue;
      }
      updatedCount += 1;
      products.push({ id: data.id, competitor_sku_code: data.competitor_sku_code, target_material_sku_code: row.target_material_sku_code, row_number: row.row_number });
      continue;
    }

    const { data, error: insertError } = await supabase
      .from("competitor_products")
      .insert({ ...payload, competitor_sku_code: null })
      .select("id,competitor_sku_code")
      .single();
    if (insertError) {
      rowErrors.push({ row_number: row.row_number, errors: [insertError.message] });
      continue;
    }
    insertedCount += 1;
    products.push({ id: data.id, competitor_sku_code: data.competitor_sku_code, target_material_sku_code: row.target_material_sku_code, row_number: row.row_number });
  }

  return { insertedCount, updatedCount, products, rowErrors };
}

async function applyMappings(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  products: Array<{ id: string; target_material_sku_code: string | null; row_number: number }>,
  rows: ReturnType<typeof parseCompetitorProductExcel>["rows"],
) {
  let mappedCount = 0;
  let skippedManualCount = 0;
  const rowErrors: Array<{ row_number: number; errors: string[] }> = [];

  for (const product of products) {
    const row = rows.find((item) => item.row_number === product.row_number);
    if (!row?.target_material_sku_code) continue;
    let skuMasterId: string;
    try {
      skuMasterId = await ensureSkuMasterFromMaterial(supabase, row.target_material_sku_code);
    } catch {
      rowErrors.push({ row_number: row.row_number, errors: [`Target material SKU not found: ${row.target_material_sku_code}`] });
      continue;
    }

    const { data: manualMatch, error: manualMatchError } = await supabase
      .from("sku_matches")
      .select("id,match_method")
      .eq("competitor_product_id", product.id)
      .eq("match_method", "manual")
      .maybeSingle();
    if (manualMatchError) {
      rowErrors.push({ row_number: row.row_number, errors: [manualMatchError.message] });
      continue;
    }
    if (manualMatch?.match_method === "manual") {
      skippedManualCount += 1;
      continue;
    }

    const { error: deleteError } = await supabase
      .from("sku_matches")
      .delete()
      .eq("competitor_product_id", product.id);
    if (deleteError) {
      rowErrors.push({ row_number: row.row_number, errors: [deleteError.message] });
      continue;
    }

    const { error: upsertError } = await supabase.from("sku_matches").insert({
      competitor_product_id: product.id,
      sku_master_id: skuMasterId,
      match_score: 0.85,
      match_method: "manual",
      reviewed: true,
    });
    if (upsertError) {
      rowErrors.push({ row_number: row.row_number, errors: [upsertError.message] });
      continue;
    }
    mappedCount += 1;
  }

  return { mappedCount, skippedManualCount, rowErrors };
}

function normalizeKey(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function inferPackType(productName: string) {
  return productName.toLowerCase().includes("tape") ? "tape" : "pants";
}
