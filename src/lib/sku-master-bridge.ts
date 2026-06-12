import { createSupabaseServiceClient } from "@/lib/supabase";
import type { MaterialMaster, PackType, Segment } from "@/lib/types";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export async function ensureSkuMasterFromMaterial(
  supabase: SupabaseServiceClient,
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
  const { data: existingByCode, error: existingByCodeError } = await supabase
    .from("sku_master")
    .select("id")
    .eq("material_sku_code", materialSkuCode)
    .maybeSingle();
  if (existingByCodeError) throw new Error(existingByCodeError.message);

  let existing = existingByCode;
  if (!existing) {
    const { data: existingByShape, error: existingByShapeError } = await supabase
      .from("sku_master")
      .select("id")
      .eq("makuku_sku_name", skuPayload.makuku_sku_name)
      .eq("pack_type", skuPayload.pack_type)
      .eq("size", skuPayload.size)
      .eq("piece_count", skuPayload.piece_count)
      .maybeSingle();
    if (existingByShapeError) throw new Error(existingByShapeError.message);
    existing = existingByShape;
  }

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
    material_sku_code: material.tenant_sku_code,
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
  const category = `${material.category ?? ""} ${material.sub_category ?? ""} ${material.type ?? ""}`.toLowerCase();
  if (value.includes("adult") || category.includes("adult") || value.includes("ad")) return "AD";
  if (value.includes("eco") || value.includes("economy") || value.includes("value") || value.includes("basic")) return "BD Eco";
  if (value.includes("mid") || value.includes("medium") || value.includes("comfort") || value.includes("premium") || value.includes("slim") || value.includes("air")) return "BD MID";
  return "unknown";
}
