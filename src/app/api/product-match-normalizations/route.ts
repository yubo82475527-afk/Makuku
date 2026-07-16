import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth-session";
import { formReturnRedirect, readRequestBody } from "@/lib/request";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type { ProductMatchNormalizationField } from "@/lib/product-match-normalizations";

const fields = new Set<ProductMatchNormalizationField>(["brand", "series", "size", "piece_count"]);

export async function POST(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;
    const { body, isForm } = await readRequestBody(request);
    const supabase = createSupabaseServiceClient();
    const intent = String(body.intent ?? "save");

    if (intent === "deactivate") {
      const id = cleanRequired(body.id, "id");
      const { error } = await supabase
        .from("product_match_normalizations")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
      revalidatePages();
      if (isForm) return formReturnRedirect(request, body, "/product-match-normalizations");
      return Response.json({ data: { deactivated: true } });
    }

    const field = cleanField(body.field);
    const brandScope = cleanOptional(body.brand_scope);
    const editingRuleId = cleanOptional(body.editing_rule_id);
    const sourceValue = cleanRequired(body.source_value, "source_value");
    const canonicalValue = cleanRequired(body.canonical_value, "canonical_value");
    if (normalized(sourceValue) === normalized(canonicalValue)) throw new Error("source_value must differ from canonical_value");
    if (field === "piece_count" && /^\d+$/.test(sourceValue) && sourceValue !== canonicalValue) {
      throw new Error("piece_count rules cannot remap a bare integer");
    }

    const canonicalOptions = await loadCanonicalOptions(supabase, field);
    const canonical = canonicalOptions.find((value) => normalized(value) === normalized(canonicalValue));
    if (!canonical) throw new Error("canonical_value must exist in active product master data");

    const { data: activeRows, error: activeError } = await supabase
      .from("product_match_normalizations")
      .select("id,source_value,brand_scope")
      .eq("field", field)
      .eq("active", true);
    if (activeError) throw new Error(activeError.message);
    const replacedIds = new Set((activeRows ?? [])
      .filter((row) => normalized((row as { source_value?: string }).source_value) === normalized(sourceValue))
      .filter((row) => normalized((row as { brand_scope?: string | null }).brand_scope) === normalized(brandScope))
      .map((row) => String((row as { id: string }).id)));
    if (editingRuleId) replacedIds.add(editingRuleId);
    if (replacedIds.size > 0) {
      const { error } = await supabase
        .from("product_match_normalizations")
        .update({ active: false, updated_at: new Date().toISOString() })
        .in("id", Array.from(replacedIds));
      if (error) throw new Error(error.message);
    }

    const { data, error } = await supabase
      .from("product_match_normalizations")
      .insert({
        field,
        brand_scope: brandScope,
        source_value: sourceValue,
        canonical_value: canonical,
        active: true,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    revalidatePages();
    if (isForm) return formReturnRedirect(request, body, "/product-match-normalizations");
    return Response.json({ data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}

async function loadCanonicalOptions(supabase: ReturnType<typeof createSupabaseServiceClient>, field: ProductMatchNormalizationField) {
  const [{ data: materials, error: materialError }, { data: products, error: productError }] = await Promise.all([
    supabase.from("material_master").select("brand,sub_brand,sub_type,pack_count").limit(5000),
    supabase.from("competitor_products").select("product_series,size,piece_count,status,brands(name)").eq("status", "active").limit(5000),
  ]);
  if (materialError) throw new Error(materialError.message);
  if (productError) throw new Error(productError.message);
  const values = new Set<string>();
  for (const material of materials ?? []) {
    const row = material as Record<string, unknown>;
    if (field === "brand") values.add(String(row.brand ?? "").trim());
    if (field === "series") values.add(String(row.sub_brand ?? "").trim());
    if (field === "size") values.add(String(row.sub_type ?? "").trim());
    if (field === "piece_count") values.add(String(row.pack_count ?? "").trim());
  }
  for (const product of products ?? []) {
    const row = product as Record<string, unknown>;
    if (field === "brand") values.add(String((row.brands as { name?: string } | null)?.name ?? "").trim());
    if (field === "series") values.add(String(row.product_series ?? "").trim());
    if (field === "size") values.add(String(row.size ?? "").trim());
    if (field === "piece_count") values.add(String(row.piece_count ?? "").trim());
  }
  return Array.from(values).filter(Boolean).sort((left, right) => left.localeCompare(right, undefined, { numeric: field === "piece_count" }));
}

function cleanField(value: unknown): ProductMatchNormalizationField {
  const field = String(value ?? "").trim() as ProductMatchNormalizationField;
  if (!fields.has(field)) throw new Error("field must be brand, series, size, or piece_count");
  return field;
}

function cleanRequired(value: unknown, field: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${field} is required`);
  return text;
}

function cleanOptional(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalized(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

function revalidatePages() {
  revalidatePath("/zh/product-match-normalizations");
  revalidatePath("/en/product-match-normalizations");
}
