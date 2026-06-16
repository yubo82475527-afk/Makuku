import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth-session";
import { readRequestBody } from "@/lib/request";
import { createSupabaseServiceClient } from "@/lib/supabase";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function revalidateViews() {
  revalidatePath("/zh/organizations");
  revalidatePath("/en/organizations");
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;
    const { body } = await readRequestBody(request);
    const organizationId = clean(body.organization_id);
    const appUserId = clean(body.app_user_id);
    if (!organizationId || !appUserId) return Response.json({ error: "Missing organization or user" }, { status: 400 });

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("organization_members")
      .insert({ organization_id: organizationId, app_user_id: appUserId, active: true })
      .select("*")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 400 });
    revalidateViews();
    return Response.json({ member: data });
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
    if (!id) return Response.json({ error: "Missing member id" }, { status: 400 });

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("organization_members")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 400 });
    revalidateViews();
    return Response.json({ member: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
