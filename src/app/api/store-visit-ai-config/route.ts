import { revalidatePath } from "next/cache";
import {
  listStoreVisitAiConfigs,
  normalizeStoreVisitAiConfigInput,
  verifyStoreVisitAiTestToken,
} from "@/lib/store-visit-ai-config";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";

export async function GET() {
  const configs = await listStoreVisitAiConfigs();
  return Response.json(configs);
}

export async function POST(request: Request) {
  try {
    if (!hasSupabaseServiceConfig()) {
      return Response.json({ error: "Missing Supabase service configuration" }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const config = normalizeStoreVisitAiConfigInput(body);
    const token = String(body.test_token ?? "");
    const testPayload = token ? verifyStoreVisitAiTestToken(token, config) : null;
    const supabase = createSupabaseServiceClient();

    const { data: created, error: createError } = await supabase
      .from("store_visit_ai_configs")
      .insert({
        ...config,
        status: "archived",
        last_test_visit_id: testPayload?.visit_id ?? null,
        last_test_result: testPayload
          ? {
            tested_at: new Date().toISOString(),
            config_hash: testPayload.config_hash,
          }
          : {
            saved_without_test: true,
            saved_at: new Date().toISOString(),
          },
      })
      .select("*")
      .single();
    if (createError) throw new Error(createError.message);

    const { error: archiveError } = await supabase
      .from("store_visit_ai_configs")
      .update({ status: "archived" })
      .eq("status", "active");
    if (archiveError) throw new Error(archiveError.message);

    const { data, error } = await supabase
      .from("store_visit_ai_configs")
      .update({ status: "active", activated_at: new Date().toISOString() })
      .eq("id", created.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    revalidatePath("/zh/store-visit-ai-debug");
    revalidatePath("/en/store-visit-ai-debug");
    return Response.json({ config: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
