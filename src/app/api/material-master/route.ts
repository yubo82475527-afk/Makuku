import { requireAdminSession } from "@/lib/auth-session";
import { createSupabaseServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("material_master")
    .select("*")
    .order("tenant_sku_code", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ items: data ?? [] });
}
