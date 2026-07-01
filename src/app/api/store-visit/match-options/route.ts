import { requireAppSession } from "@/lib/auth-session";
import { createSupabaseServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAppSession(request);
  if (auth.response) return auth.response;

  const supabase = createSupabaseServiceClient();
  const [materialsResult, productsResult] = await Promise.all([
    supabase
      .from("material_master")
      .select("*")
      .order("tenant_sku_code", { ascending: true }),
    supabase
      .from("competitor_products")
      .select("*, brands(id,name)")
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);

  if (materialsResult.error) {
    return Response.json({ error: materialsResult.error.message }, { status: 500 });
  }
  if (productsResult.error) {
    return Response.json({ error: productsResult.error.message }, { status: 500 });
  }

  return Response.json({
    items: materialsResult.data ?? [],
    products: productsResult.data ?? [],
  });
}
