import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { formReturnRedirect, readRequestBody } from "@/lib/request";
import type { MaterialMaster, PackType, Segment } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { body, isForm } = await readRequestBody(request);
    const competitorProductId = String(body.competitor_product_id ?? "");
    const materialSkuCode = String(body.material_sku_code ?? "");
    const legacySkuMasterId = String(body.sku_master_id ?? "");
    const matchId = body.match_id ? String(body.match_id) : null;
    if (!competitorProductId || (!materialSkuCode && !legacySkuMasterId)) {
      return Response.json({ error: "competitor_product_id and material_sku_code are required" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const skuMasterId = materialSkuCode
      ? await ensureSkuMasterFromMaterial(supabase, materialSkuCode)
      : legacySkuMasterId;
    const payload = {
      competitor_product_id: competitorProductId,
      sku_master_id: skuMasterId,
      match_score: Number(body.match_score ?? 0.85),
      match_method: body.match_method ?? "manual",
      reviewed: true,
    };

    if (matchId) {
      const { error } = await supabase.from("sku_matches").update(payload).eq("id", matchId);
      if (error) return Response.json({ error: error.message }, { status: 400 });
    } else {
      const { error } = await supabase.from("sku_matches").insert(payload);
      if (error) return Response.json({ error: error.message }, { status: 400 });
    }

    revalidatePath("/zh/competitors");
    revalidatePath("/en/competitors");
    revalidatePath("/zh/market-benchmarks");
    revalidatePath("/en/market-benchmarks");

    if (isForm) return formReturnRedirect(request, body, "/competitors");
    return Response.json({ data: payload });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

async function ensureSkuMasterFromMaterial(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  materialSkuCode: string,
) {
  const { data: material, error: materialError } = await supabase
    .from("material_master")
    .select("*")
    .eq("tenant_sku_code", materialSkuCode)
    .single();

  if (materialError || !material) {
    throw new Error(materialError?.message ?? `Material master ${materialSkuCode} not found`);
  }

  const skuPayload = buildSkuMasterPayloadFromMaterial(material as MaterialMaster);
  const { data: existing, error: existingError } = await supabase
    .from("sku_master")
    .select("id")
    .eq("makuku_sku_name", skuPayload.makuku_sku_name)
    .eq("pack_type", skuPayload.pack_type)
    .eq("size", skuPayload.size)
    .eq("piece_count", skuPayload.piece_count)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("sku_master")
      .update(skuPayload)
      .eq("id", existing.id);
    if (updateError) throw new Error(updateError.message);
    return existing.id as string;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("sku_master")
    .insert(skuPayload)
    .select("id")
    .single();

  if (insertError || !inserted?.id) throw new Error(insertError?.message ?? "Failed to create SKU bridge from material master");
  return inserted.id as string;
}

export function buildSkuMasterPayloadFromMaterial(material: MaterialMaster) {
  const targetPrice = Number(material.pcs_price) > 0 ? Number(material.pcs_price) : 1;
  return {
    makuku_sku_name: material.tenant_sku_name,
    pack_type: derivePackType(material),
    size: material.sub_type?.trim() || "unknown",
    piece_count: Number(material.pack_count) > 0 ? Number(material.pack_count) : 1,
    segment: deriveSegment(material),
    target_price_per_piece: targetPrice,
    floor_price_per_piece: Math.round(targetPrice * 0.9 * 100) / 100,
    gross_margin_rate: 0.3,
    active: true,
  };
}

function derivePackType(material: MaterialMaster): PackType {
  const value = `${material.type ?? ""} ${material.sub_category ?? ""}`.toLowerCase();
  if (value.includes("pants") || value.includes("拉拉")) return "pants";
  if (value.includes("tape") || value.includes("纸尿") || value.includes("diaper")) return "tape";
  return "unknown";
}

function deriveSegment(material: MaterialMaster): Segment {
  const value = `${material.sub_brand ?? ""} ${material.tenant_sku_name ?? ""}`.toLowerCase();
  if (value.includes("value") || value.includes("basic") || value.includes("性价比")) return "value";
  if (value.includes("comfort") || value.includes("mid") || value.includes("中端")) return "mid";
  if (value.includes("premium") || value.includes("slim") || value.includes("air") || value.includes("高端")) return "premium";
  return "unknown";
}
