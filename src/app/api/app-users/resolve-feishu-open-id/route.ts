import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth-session";
import { resolveFeishuOpenIdByEmail } from "@/lib/feishu";
import { readRequestBody } from "@/lib/request";
import { createSupabaseServiceClient } from "@/lib/supabase";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function revalidateUserViews() {
  revalidatePath("/zh/users");
  revalidatePath("/en/users");
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;
    const { body } = await readRequestBody(request);
    const id = clean(body.id);
    const requestedEmail = clean(body.email).toLowerCase();
    if (!id) return Response.json({ error: "Missing user id" }, { status: 400 });

    const supabase = createSupabaseServiceClient();
    const { data: user, error: userError } = await supabase
      .from("app_users")
      .select("id,email")
      .eq("id", id)
      .single();

    if (userError || !user) return Response.json({ error: userError?.message ?? "User not found" }, { status: 404 });
    const email = requestedEmail || clean(user.email).toLowerCase();
    if (!email) return Response.json({ error: "User email is empty" }, { status: 400 });

    const feishuUserId = await resolveFeishuOpenIdByEmail(email);
    const { data, error } = await supabase
      .from("app_users")
      .update({ email, feishu_user_id: feishuUserId, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id,username,display_name,email,feishu_user_id,role,status,disabled_at,updated_at,created_at")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 400 });
    revalidateUserViews();
    return Response.json({ user: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
