import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { formReturnRedirect, readRequestBody } from "@/lib/request";
import { requireAdminSession } from "@/lib/auth-session";
import { ensureSkuMasterFromMaterial } from "@/lib/sku-master-bridge";

export async function POST(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;
    const { body, isForm } = await readRequestBody(request);
    const competitorProductId = String(body.competitor_product_id ?? "");
    const materialSkuCode = String(body.material_sku_code ?? "");
    const legacySkuMasterId = String(body.sku_master_id ?? "");
    if (!competitorProductId) {
      return Response.json({ error: "competitor_product_id is required" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    if (!materialSkuCode && !legacySkuMasterId) {
      const { error } = await supabase
        .from("sku_matches")
        .delete()
        .eq("competitor_product_id", competitorProductId);
      if (error) return Response.json({ error: error.message }, { status: 400 });
      revalidateCompetitorMappingPages();
      if (isForm) return formReturnRedirect(request, body, "/competitor-mappings");
      return Response.json({ data: null, cleared: true });
    }

    const skuMasterId = materialSkuCode
      ? await ensureSkuMasterFromMaterial(supabase, materialSkuCode)
      : legacySkuMasterId;
    const payload = {
      competitor_product_id: competitorProductId,
      sku_master_id: skuMasterId,
      match_score: Number(body.match_score ?? 0.85),
      match_method: "manual",
      reviewed: true,
    };

    const { error: deleteError } = await supabase
      .from("sku_matches")
      .delete()
      .eq("competitor_product_id", competitorProductId);
    if (deleteError) return Response.json({ error: deleteError.message }, { status: 400 });

    const { error } = await supabase.from("sku_matches").insert(payload);
    if (error) return Response.json({ error: error.message }, { status: 400 });

    revalidateCompetitorMappingPages();

    if (isForm) return formReturnRedirect(request, body, "/competitor-mappings");
    return Response.json({ data: payload });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
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
