import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { formReturnRedirect, readRequestBody } from "@/lib/request";
import { requirePagePermission } from "@/lib/auth-session";
import { DEFAULT_H5_ROLE_CODE, isSystemAdminRole } from "@/lib/page-permissions";
import { loadRoleAccess } from "@/lib/role-access";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type { AppUserStatus } from "@/lib/types";

const statuses: AppUserStatus[] = ["enabled", "disabled"];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function cleanNullable(value: unknown) {
  const text = clean(value);
  return text || null;
}

function normalizeUsername(value: unknown) {
  return clean(value).toLowerCase();
}

async function normalizeRole(value: unknown): Promise<string | null> {
  const role = clean(value);
  if (!role) return null;
  const access = await loadRoleAccess(role);
  if (!access || access.status !== "active") return null;
  return access.code;
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
    const auth = await requirePagePermission(request, "users");
    if (auth.response) return auth.response;
    const { body, isForm } = await readRequestBody(request);
    const username = normalizeUsername(body.username);
    const displayName = clean(body.display_name);
    const email = cleanNullable(body.email)?.toLowerCase() ?? null;
    const feishuUserId = cleanNullable(body.feishu_user_id);
    const password = clean(body.password);
    const role = (await normalizeRole(body.role)) ?? DEFAULT_H5_ROLE_CODE;

    if (!username || !displayName || !password) {
      return Response.json({ error: "Missing required fields: username, display_name, password" }, { status: 400 });
    }
    if (isSystemAdminRole(role) && !isSystemAdminRole(auth.session.role)) {
      return Response.json({ error: "Only admin can assign the admin role" }, { status: 403 });
    }

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("app_users")
      .insert({
        username,
        display_name: displayName,
        email,
        feishu_user_id: feishuUserId,
        password_hash: hashPassword(password),
        password_login_enabled: true,
        feishu_org_mismatch: false,
        role,
        status: "enabled",
        disabled_at: null,
      })
      .select("id,username,display_name,email,feishu_user_id,password_login_enabled,feishu_org_mismatch,feishu_org_ids,feishu_org_names,organization_assignment_method,role,status,disabled_at,updated_at,created_at")
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
    const auth = await requirePagePermission(request, "users");
    if (auth.response) return auth.response;
    const { body } = await readRequestBody(request);
    const id = clean(body.id);
    const status = normalizeStatus(body.status);
    const hasRole = Object.prototype.hasOwnProperty.call(body, "role");
    const role = hasRole ? await normalizeRole(body.role) : null;
    const password = clean(body.password);
    const hasEmail = Object.prototype.hasOwnProperty.call(body, "email");
    const email = cleanNullable(body.email)?.toLowerCase() ?? null;
    const hasFeishuUserId = Object.prototype.hasOwnProperty.call(body, "feishu_user_id");
    const feishuUserId = cleanNullable(body.feishu_user_id);

    if (!id) return Response.json({ error: "Missing user id" }, { status: 400 });
    if (!status && !role && !password && !hasEmail && !hasFeishuUserId) {
      return Response.json({ error: "Missing status, role, password, email, or feishu_user_id" }, { status: 400 });
    }
    if (hasRole && !role) {
      return Response.json({ error: "Unknown or inactive role" }, { status: 400 });
    }
    if (role && isSystemAdminRole(role) && !isSystemAdminRole(auth.session.role)) {
      return Response.json({ error: "Only admin can assign the admin role" }, { status: 403 });
    }

    const update: Record<string, string | null> = {
      updated_at: new Date().toISOString(),
    };
    if (status) {
      update.status = status;
      update.disabled_at = status === "disabled" ? new Date().toISOString() : null;
    }
    if (role) update.role = role;
    if (password) update.password_hash = hashPassword(password);
    if (hasEmail) update.email = email;
    if (hasFeishuUserId) update.feishu_user_id = feishuUserId;

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("app_users")
      .update(update)
      .eq("id", id)
      .select("id,username,display_name,email,feishu_user_id,password_login_enabled,feishu_org_mismatch,feishu_org_ids,feishu_org_names,organization_assignment_method,role,status,disabled_at,updated_at,created_at")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 400 });

    revalidateUserViews();
    return Response.json({ user: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
