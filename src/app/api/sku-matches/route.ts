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
