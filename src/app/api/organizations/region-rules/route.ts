import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth-session";
import { readRequestBody } from "@/lib/request";
import { createSupabaseServiceClient } from "@/lib/supabase";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

type RegionRuleInput = {
  province: string;
  city_name: string | null;
  district: string | null;
};

function revalidateViews() {
  revalidatePath("/zh/organizations");
  revalidatePath("/en/organizations");
  revalidatePath("/zh/offline-stores");
  revalidatePath("/en/offline-stores");
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;
    const { body } = await readRequestBody(request);
    const organizationId = clean(body.organization_id);
    const rawRules: unknown[] = Array.isArray(body.rules) ? body.rules : [body];
    const rules: Array<RegionRuleInput & { organization_id: string; active: boolean }> = rawRules.map((item: unknown) => {
      const rule = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        organization_id: organizationId,
        province: clean(rule.province),
        city_name: clean(rule.city_name) || null,
        district: clean(rule.district) || null,
        active: true,
      };
    }).filter((rule: RegionRuleInput & { organization_id: string; active: boolean }) => rule.organization_id && rule.province);
    if (!organizationId || rules.length === 0) return Response.json({ error: "Missing organization or province" }, { status: 400 });

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("organization_region_rules")
      .insert(rules)
      .select("*")
      .returns<Array<{ id: string }>>();

    if (error) return Response.json({ error: error.message }, { status: 400 });
    revalidateViews();
    return Response.json({ rules: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;
    const { body } = await readRequestBody(request);
    const id = clean(body.id);
    if (!id) return Response.json({ error: "Missing rule id" }, { status: 400 });

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("organization_region_rules")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 400 });
    revalidateViews();
    return Response.json({ rule: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
