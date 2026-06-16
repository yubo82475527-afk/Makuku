import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth-session";
import { readRequestBody } from "@/lib/request";
import { createSupabaseServiceClient } from "@/lib/supabase";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function revalidateOrganizationViews() {
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
    const name = clean(body.name);
    const notes = clean(body.notes) || null;
    if (!name) return Response.json({ error: "Missing organization name" }, { status: 400 });

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("organizations")
      .insert({ name, notes, status: "active" })
      .select("*")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 400 });
    revalidateOrganizationViews();
    return Response.json({ organization: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;
    const { body } = await readRequestBody(request);
    const id = clean(body.id);
    const status = clean(body.status);
    if (!id) return Response.json({ error: "Missing organization id" }, { status: 400 });
    if (status !== "active" && status !== "inactive") return Response.json({ error: "Missing valid status" }, { status: 400 });

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("organizations")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 400 });
    revalidateOrganizationViews();
    return Response.json({ organization: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
