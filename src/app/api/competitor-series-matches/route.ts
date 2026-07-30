import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth-session";
import { normalizeMaterialGroup2Targets } from "@/lib/competitor-series-mapping";
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
      const benchmarkRule = await setDefaultBenchmarkRule(supabase, {
        brand_id: brandId,
        product_series: productSeries,
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

    const targetMaterialGroup2s = parseTargetMaterialGroup2s(body);
    if (!targetMaterialGroup2s.length) throw new Error("target_material_group2 is required");
    const rule = await saveRule(supabase, {
      brand_id: brandId,
      product_series: productSeries,
      target_material_group2s: targetMaterialGroup2s,
    });

    revalidateCompetitorMappingPages();
    if (isForm) return formReturnRedirect(request, body, "/competitor-mappings?mapping=all");
    return Response.json({ data: rule });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

async function saveRule(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  payload: { brand_id: string; product_series: string | null; target_material_group2s: string[] },
) {
  const existing = await findActiveRule(supabase, payload.brand_id, payload.product_series);
  if (existing?.id) {
    const { data, error } = await supabase
      .from("competitor_series_mappings")
      .update({
        product_series: payload.product_series,
        target_material_group2s: payload.target_material_group2s,
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
      target_material_group2s: payload.target_material_group2s,
      active: true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function setDefaultBenchmarkRule(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  payload: { brand_id: string; product_series: string | null },
) {
  const existing = await findActiveRule(supabase, payload.brand_id, payload.product_series);
  if (!existing?.id) throw new Error("Active series mapping rule is required before setting benchmark");

  const targets = normalizeMaterialGroup2Targets(existing.target_material_group2s);
  if (!targets.length) throw new Error("Mapping targets are required before setting benchmark");

  const { data: activeRules, error: listError } = await supabase
    .from("competitor_series_mappings")
    .select("id,target_material_group2s,is_default_benchmark")
    .eq("active", true);
  if (listError) throw new Error(listError.message);

  const targetKeys = new Set(targets.map((value) => value.toLowerCase()));
  const overlappingIds = (activeRules ?? [])
    .filter((rule) => {
      if (rule.id === existing.id) return false;
      if (!rule.is_default_benchmark) return false;
      return normalizeMaterialGroup2Targets(rule.target_material_group2s)
        .some((value) => targetKeys.has(value.toLowerCase()));
    })
    .map((rule) => rule.id);

  if (overlappingIds.length) {
    const { error: clearError } = await supabase
      .from("competitor_series_mappings")
      .update({ is_default_benchmark: false, updated_at: new Date().toISOString() })
      .in("id", overlappingIds);
    if (clearError) throw new Error(clearError.message);
  }

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
    .select("id,target_material_group2s")
    .eq("brand_id", brandId)
    .eq("active", true);
  query = productSeries ? query.ilike("product_series", productSeries) : query.is("product_series", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; target_material_group2s: string[] | null } | null;
}

function parseTargetMaterialGroup2s(body: Record<string, unknown>) {
  const raw = body.target_material_group2 ?? body.target_material_group2s;
  return normalizeMaterialGroup2Targets(raw as string[] | string | null | undefined);
}

function revalidateCompetitorMappingPages() {
  revalidatePath("/zh/competitors");
  revalidatePath("/en/competitors");
  revalidatePath("/zh/competitor-products");
  revalidatePath("/en/competitor-products");
  revalidatePath("/zh/competitor-mappings");
  revalidatePath("/en/competitor-mappings");
  revalidatePath("/zh/prices");
  revalidatePath("/en/prices");
  revalidatePath("/zh/dashboard");
  revalidatePath("/en/dashboard");
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
