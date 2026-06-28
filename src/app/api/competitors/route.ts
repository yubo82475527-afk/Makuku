import { createSupabaseServiceClient } from "@/lib/supabase";
import { formReturnRedirect, readRequestBody } from "@/lib/request";
import { requireAdminSession } from "@/lib/auth-session";
import { normalizeProductGrade } from "@/lib/segments";

export async function GET(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("competitor_products")
      .select("*, brands(id,name)")
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ products: data ?? [] });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;
    const { body, isForm } = await readRequestBody(request);
    const supabase = createSupabaseServiceClient();
    if (body.intent === "update_segment") {
      const ids = readCompetitorProductIds(body);
      if (ids.length === 0) return Response.json({ error: "Missing competitor product id" }, { status: 400 });
      const { data, error } = await supabase
        .from("competitor_products")
        .update({ segment: normalizeProductGrade(String(body.segment ?? "")) })
        .in("id", ids)
        .select("*");
      if (error) return Response.json({ error: error.message }, { status: 400 });
      if (isForm) return formReturnRedirect(request, body, "/competitor-products");
      return Response.json({ data, count: data?.length ?? 0 });
    }

    if (body.intent === "update_package_type") {
      const ids = readCompetitorProductIds(body);
      if (ids.length === 0) return Response.json({ error: "Missing competitor product id" }, { status: 400 });
      const cleanPackageType = String(body.package_type ?? "").trim() || "unknown";
      const { data, error } = await supabase
        .from("competitor_products")
        .update({ package_type: cleanPackageType })
        .in("id", ids)
        .select("*");
      if (error) return Response.json({ error: error.message }, { status: 400 });
      if (isForm) return formReturnRedirect(request, body, "/competitor-products");
      return Response.json({ data, count: data?.length ?? 0 });
    }

    if (body.intent === "update_fields") {
      const ids = readCompetitorProductIds(body);
      if (ids.length === 0) return Response.json({ error: "Missing competitor product id" }, { status: 400 });
      const update = buildCompetitorProductUpdate(body);
      if (Object.keys(update).length === 0) return Response.json({ error: "No supported fields to update" }, { status: 400 });
      const { data, error } = await supabase
        .from("competitor_products")
        .update({ ...update, updated_at: new Date().toISOString() })
        .in("id", ids)
        .select("*");
      if (error) return Response.json({ error: error.message }, { status: 400 });
      if (isForm) return formReturnRedirect(request, body, "/competitor-products");
      return Response.json({ data, count: data?.length ?? 0 });
    }

    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("id,name,is_own_brand")
      .eq("id", body.brand_id)
      .single();
    if (brandError) return Response.json({ error: brandError.message }, { status: 400 });
    if (brand?.is_own_brand || isOwnBrandName(brand?.name)) {
      return Response.json({ error: "Own brand cannot be added as a competitor" }, { status: 400 });
    }

    const { data: product, error } = await supabase
      .from("competitor_products")
      .insert({
        brand_id: body.brand_id,
        raw_title: body.raw_title,
        normalized_name: body.normalized_name,
        channel: body.channel,
        shop_name: body.shop_name || null,
        product_url: body.product_url || null,
        image_url: body.image_url || null,
        pack_type: body.pack_type,
        competitor_sku_code: normalizeOptionalText(body.competitor_sku_code),
        product_series: normalizeOptionalText(body.product_series),
        package_type: String(body.package_type ?? "unknown"),
        size: body.size,
        piece_count: Number(body.piece_count),
        segment: normalizeProductGrade(String(body.segment ?? "")),
        status: normalizeCompetitorStatus(body.status),
      })
      .select("*")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 400 });

    if (body.sku_master_id) {
      const { error: matchError } = await supabase.from("sku_matches").insert({
        competitor_product_id: product.id,
        sku_master_id: body.sku_master_id,
        match_score: Number(body.match_score ?? 0.85),
        match_method: body.match_method ?? "manual",
        reviewed: true,
      });
      if (matchError) return Response.json({ error: matchError.message }, { status: 400 });
    }

    if (isForm) return formReturnRedirect(request, body, "/competitor-products");
    return Response.json({ data: product });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;
    const { body, isForm } = await readRequestBody(request);
    const id = String(body.id ?? "").trim();
    if (!id) return Response.json({ error: "Missing competitor product id" }, { status: 400 });

    const supabase = createSupabaseServiceClient();
    const update = buildCompetitorProductUpdate(body);
    const { data, error } = await supabase
      .from("competitor_products")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 400 });

    if (isForm) return formReturnRedirect(request, body, "/competitor-products");
    return Response.json({ data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

function readCompetitorProductIds(body: Record<string, unknown>) {
  if (Array.isArray(body.ids)) {
    return body.ids.map((id) => String(id).trim()).filter(Boolean);
  }
  const id = String(body.id ?? "").trim();
  return id ? [id] : [];
}

function buildCompetitorProductUpdate(body: Record<string, unknown>) {
  const update: Record<string, unknown> = {};
  if ("brand_id" in body) update.brand_id = requiredCleanText(body.brand_id, "brand_id");
  if ("normalized_name" in body) update.normalized_name = requiredCleanText(body.normalized_name, "normalized_name");
  if ("raw_title" in body) update.raw_title = requiredCleanText(body.raw_title, "raw_title");
  if ("competitor_sku_code" in body) update.competitor_sku_code = normalizeOptionalText(body.competitor_sku_code);
  if ("product_series" in body) update.product_series = normalizeOptionalText(body.product_series);
  if ("package_type" in body) update.package_type = String(body.package_type ?? "").trim() || "unknown";
  if ("pack_type" in body) update.pack_type = normalizePackType(body.pack_type);
  if ("size" in body) update.size = normalizeOptionalText(body.size);
  if ("piece_count" in body) update.piece_count = normalizePieceCount(body.piece_count);
  if ("segment" in body) update.segment = normalizeProductGrade(String(body.segment ?? ""));
  if ("status" in body) update.status = normalizeCompetitorStatus(body.status);
  return update;
}

function requiredCleanText(value: unknown, field: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${field} is required`);
  return text;
}

function normalizeOptionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizePieceCount(value: unknown) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error("piece_count must be a positive integer");
  return number;
}

function normalizePackType(value: unknown) {
  const text = String(value ?? "").trim();
  if (text === "pants" || text === "tape" || text === "unknown") return text;
  return "unknown";
}

function normalizeCompetitorStatus(value: unknown) {
  return String(value ?? "").trim() === "disabled" ? "disabled" : "active";
}

function isOwnBrandName(value: string | null | undefined) {
  return value?.trim().toLowerCase() === "makuku";
}
