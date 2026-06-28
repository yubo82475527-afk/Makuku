import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth-session";
import { formReturnRedirect, readRequestBody } from "@/lib/request";
import { createSupabaseServiceClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;

    const { body, isForm } = await readRequestBody(request);
    const brandId = cleanRequired(body.brand_id, "brand_id");
    const productSeries = cleanOptional(body.product_series);
    const intent = String(body.intent ?? "save");
    const supabase = createSupabaseServiceClient();

    if (intent === "clear" || intent === "delete_rule") {
      await deactivateRule(supabase, brandId, productSeries);
      revalidateCompetitorMappingPages();
      if (isForm) return formReturnRedirect(request, body, "/competitor-mappings");
      return Response.json({ data: { deleted: true } });
    }

    if (intent === "set_benchmark") {
      const targetMakukuSeries = cleanRequired(body.target_makuku_series, "target_makuku_series");
      const benchmarkRule = await setDefaultBenchmarkRule(supabase, {
        brand_id: brandId,
        product_series: productSeries,
        target_makuku_series: targetMakukuSeries,
      });
      revalidateCompetitorMappingPages();
      if (isForm) return formReturnRedirect(request, body, "/competitor-mappings");
      return Response.json({ data: benchmarkRule });
    }

    if (intent === "clear_benchmark") {
      const benchmarkRule = await clearDefaultBenchmarkRule(supabase, brandId, productSeries);
      revalidateCompetitorMappingPages();
      if (isForm) return formReturnRedirect(request, body, "/competitor-mappings");
      return Response.json({ data: benchmarkRule });
    }

    const targetMakukuSeries = cleanRequired(body.target_makuku_series, "target_makuku_series");
    const rule = await saveRule(supabase, {
      brand_id: brandId,
      product_series: productSeries,
      target_makuku_series: targetMakukuSeries,
    });

    revalidateCompetitorMappingPages();
    if (isForm) return formReturnRedirect(request, body, "/competitor-mappings?mapping=all");
    return Response.json({ data: rule });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

async function saveRule(supabase: ReturnType<typeof createSupabaseServiceClient>, payload: { brand_id: string; product_series: string | null; target_makuku_series: string }) {
  const existing = await findActiveRule(supabase, payload.brand_id, payload.product_series);
  if (existing?.id) {
    const { data, error } = await supabase
      .from("competitor_series_mappings")
      .update({
        product_series: payload.product_series,
        target_makuku_series: payload.target_makuku_series,
        active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await supabase
    .from("competitor_series_mappings")
    .insert({
      brand_id: payload.brand_id,
      product_series: payload.product_series,
      target_makuku_series: payload.target_makuku_series,
      active: true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function setDefaultBenchmarkRule(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  payload: { brand_id: string; product_series: string | null; target_makuku_series: string },
) {
  const existing = await findActiveRule(supabase, payload.brand_id, payload.product_series);
  if (!existing?.id) throw new Error("Active series mapping rule is required before setting benchmark");

  const { error: clearError } = await supabase
    .from("competitor_series_mappings")
    .update({ is_default_benchmark: false, updated_at: new Date().toISOString() })
    .eq("active", true)
    .ilike("target_makuku_series", payload.target_makuku_series);
  if (clearError) throw new Error(clearError.message);

  const { data, error } = await supabase
    .from("competitor_series_mappings")
    .update({ is_default_benchmark: true, updated_at: new Date().toISOString() })
    .eq("id", existing.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function clearDefaultBenchmarkRule(supabase: ReturnType<typeof createSupabaseServiceClient>, brandId: string, productSeries: string | null) {
  const existing = await findActiveRule(supabase, brandId, productSeries);
  if (!existing?.id) throw new Error("Active series mapping rule is required before clearing benchmark");

  const { data, error } = await supabase
    .from("competitor_series_mappings")
    .update({ is_default_benchmark: false, updated_at: new Date().toISOString() })
    .eq("id", existing.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function deactivateRule(supabase: ReturnType<typeof createSupabaseServiceClient>, brandId: string, productSeries: string | null) {
  const existing = await findActiveRule(supabase, brandId, productSeries);
  if (!existing?.id) return;
  const { error } = await supabase
    .from("competitor_series_mappings")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", existing.id);
  if (error) throw new Error(error.message);
}

async function findActiveRule(supabase: ReturnType<typeof createSupabaseServiceClient>, brandId: string, productSeries: string | null) {
  let query = supabase
    .from("competitor_series_mappings")
    .select("id")
    .eq("brand_id", brandId)
    .eq("active", true);
  query = productSeries ? query.ilike("product_series", productSeries) : query.is("product_series", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string } | null;
}

function revalidateCompetitorMappingPages() {
  revalidatePath("/zh/competitors");
  revalidatePath("/en/competitors");
  revalidatePath("/zh/competitor-products");
  revalidatePath("/en/competitor-products");
  revalidatePath("/zh/competitor-mappings");
  revalidatePath("/en/competitor-mappings");
  revalidatePath("/zh/market-benchmarks");
  revalidatePath("/en/market-benchmarks");
  revalidatePath("/zh/prices");
  revalidatePath("/en/prices");
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
