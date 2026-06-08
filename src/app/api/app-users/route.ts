import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { formReturnRedirect, readRequestBody } from "@/lib/request";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type { AppUserRole, AppUserStatus } from "@/lib/types";

const roles: AppUserRole[] = ["field_agent", "manager", "admin"];
const statuses: AppUserStatus[] = ["enabled", "disabled"];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeUsername(value: unknown) {
  return clean(value).toLowerCase();
}

function normalizeRole(value: unknown): AppUserRole {
  const role = clean(value);
  return roles.includes(role as AppUserRole) ? role as AppUserRole : "field_agent";
}

function normalizeStatus(value: unknown): AppUserStatus | null {
  const status = clean(value);
  return statuses.includes(status as AppUserStatus) ? status as AppUserStatus : null;
}

function hashPassword(password: string) {
  return `sha256:${crypto.createHash("sha256").update(password).digest("hex")}`;
}

function revalidateUserViews() {
  revalidatePath("/zh/users");
  revalidatePath("/en/users");
  revalidatePath("/zh/mobile/offline-capture");
  revalidatePath("/en/mobile/offline-capture");
}

export async function POST(request: Request) {
  try {
    const { body, isForm } = await readRequestBody(request);
    const username = normalizeUsername(body.username);
    const displayName = clean(body.display_name);
    const password = clean(body.password);
    const role = normalizeRole(body.role);

    if (!username || !displayName || !password) {
      return Response.json({ error: "Missing required fields: username, display_name, password" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("app_users")
      .insert({
        username,
        display_name: displayName,
        password_hash: hashPassword(password),
        role,
        status: "enabled",
        disabled_at: null,
      })
      .select("id,username,display_name,role,status,disabled_at,updated_at,created_at")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 400 });

    revalidateUserViews();
    if (isForm) return formReturnRedirect(request, body, "/users");
    return Response.json({ user: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { body } = await readRequestBody(request);
    const id = clean(body.id);
    const status = normalizeStatus(body.status);
    const password = clean(body.password);

    if (!id) return Response.json({ error: "Missing user id" }, { status: 400 });
    if (!status && !password) return Response.json({ error: "Missing status or password" }, { status: 400 });

    const update: Record<string, string | null> = {
      updated_at: new Date().toISOString(),
    };
    if (status) {
      update.status = status;
      update.disabled_at = status === "disabled" ? new Date().toISOString() : null;
    }
    if (password) update.password_hash = hashPassword(password);

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("app_users")
      .update(update)
      .eq("id", id)
      .select("id,username,display_name,role,status,disabled_at,updated_at,created_at")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 400 });

    revalidateUserViews();
    return Response.json({ user: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
