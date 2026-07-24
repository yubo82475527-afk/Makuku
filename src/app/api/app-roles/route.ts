import { revalidatePath } from "next/cache";
import { requirePagePermission } from "@/lib/auth-session";
import {
  ROLE_PAGE_KEYS,
  filterRoleAssignablePages,
  isRolePageKey,
  isSystemRoleCode,
} from "@/lib/page-permissions";
import { clearRoleAccessCache } from "@/lib/role-access";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeCode(value: unknown) {
  return clean(value).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizePageKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value) {
    const key = clean(item);
    if (isRolePageKey(key)) unique.add(key);
  }
  return [...unique];
}

function revalidateRoleViews() {
  revalidatePath("/zh/roles");
  revalidatePath("/en/roles");
  revalidatePath("/zh/users");
  revalidatePath("/en/users");
}

async function loadRoles() {
  const supabase = createSupabaseServiceClient();
  const { data: roles, error } = await supabase
    .from("app_roles")
    .select("id,code,name,description,is_system,data_scope,status,created_at,updated_at")
    .order("is_system", { ascending: false })
    .order("code", { ascending: true });
  if (error) throw new Error(error.message);

  const roleIds = (roles ?? []).map((role) => role.id);
  const { data: permissions } = roleIds.length
    ? await supabase.from("app_role_page_permissions").select("role_id,page_key").in("role_id", roleIds)
    : { data: [] as Array<{ role_id: string; page_key: string }> };

  const pagesByRole = new Map<string, string[]>();
  for (const row of permissions ?? []) {
    const list = pagesByRole.get(row.role_id) ?? [];
    list.push(String(row.page_key));
    pagesByRole.set(row.role_id, list);
  }

  return (roles ?? []).map((role) => ({
    ...role,
    page_keys: role.code === "admin"
      ? [...ROLE_PAGE_KEYS]
      : filterRoleAssignablePages(pagesByRole.get(role.id)),
  }));
}

export async function GET(request: Request) {
  const auth = await requirePagePermission(request, "roles");
  if (auth.response) {
    // Users page also needs active role options.
    const usersAuth = await requirePagePermission(request, "users");
    if (usersAuth.response) return usersAuth.response;
  }

  try {
    if (!hasSupabaseServiceConfig()) {
      return Response.json({
        roles: [
          { code: "admin", name: "Admin", is_system: true, data_scope: "all", status: "active", page_keys: [...ROLE_PAGE_KEYS] },
          { code: "field_agent", name: "Field agent", is_system: true, data_scope: "organization", status: "active", page_keys: [] },
          { code: "manager", name: "Manager", is_system: false, data_scope: "organization", status: "active", page_keys: [...ROLE_PAGE_KEYS] },
        ],
        page_keys: ROLE_PAGE_KEYS,
      });
    }
    const roles = await loadRoles();
    return Response.json({ roles, page_keys: ROLE_PAGE_KEYS });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requirePagePermission(request, "roles");
  if (auth.response) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const code = normalizeCode(body.code);
    const name = clean(body.name);
    const description = clean(body.description) || null;
    const pageKeys = normalizePageKeys(body.page_keys);

    if (!code || !name) {
      return Response.json({ error: "Missing required fields: code, name" }, { status: 400 });
    }
    if (isSystemRoleCode(code)) {
      return Response.json({ error: "Cannot create a role with a reserved system code" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const { data: role, error } = await supabase
      .from("app_roles")
      .insert({
        code,
        name,
        description,
        is_system: false,
        data_scope: "organization",
        status: "active",
      })
      .select("id,code,name,description,is_system,data_scope,status,created_at,updated_at")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 400 });

    if (pageKeys.length > 0) {
      const { error: permissionError } = await supabase
        .from("app_role_page_permissions")
        .insert(pageKeys.map((page_key) => ({ role_id: role.id, page_key })));
      if (permissionError) return Response.json({ error: permissionError.message }, { status: 400 });
    }

    clearRoleAccessCache(code);
    revalidateRoleViews();
    return Response.json({ role: { ...role, page_keys: pageKeys } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requirePagePermission(request, "roles");
  if (auth.response) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const id = clean(body.id);
    if (!id) return Response.json({ error: "Missing role id" }, { status: 400 });

    const supabase = createSupabaseServiceClient();
    const { data: existing, error: existingError } = await supabase
      .from("app_roles")
      .select("id,code,is_system,data_scope,status")
      .eq("id", id)
      .single();
    if (existingError || !existing) return Response.json({ error: existingError?.message ?? "Role not found" }, { status: 404 });

    const update: Record<string, string | null> = { updated_at: new Date().toISOString() };
    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const name = clean(body.name);
      if (!name) return Response.json({ error: "Role name cannot be empty" }, { status: 400 });
      update.name = name;
    }
    if (Object.prototype.hasOwnProperty.call(body, "description")) {
      update.description = clean(body.description) || null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "status") && !existing.is_system) {
      const status = clean(body.status);
      if (status !== "active" && status !== "inactive") {
        return Response.json({ error: "Invalid status" }, { status: 400 });
      }
      update.status = status;
    }

    if (Object.keys(update).length > 1) {
      const { error: updateError } = await supabase.from("app_roles").update(update).eq("id", id);
      if (updateError) return Response.json({ error: updateError.message }, { status: 400 });
    }

    if (Object.prototype.hasOwnProperty.call(body, "page_keys")) {
      if (existing.code === "admin" || existing.code === "field_agent") {
        // System roles keep fixed page sets.
      } else {
        const pageKeys = normalizePageKeys(body.page_keys);
        await supabase.from("app_role_page_permissions").delete().eq("role_id", id);
        if (pageKeys.length > 0) {
          const { error: permissionError } = await supabase
            .from("app_role_page_permissions")
            .insert(pageKeys.map((page_key) => ({ role_id: id, page_key })));
          if (permissionError) return Response.json({ error: permissionError.message }, { status: 400 });
        }
      }
    }

    clearRoleAccessCache(existing.code);
    revalidateRoleViews();
    const roles = await loadRoles();
    const role = roles.find((item) => item.id === id);
    return Response.json({ role });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requirePagePermission(request, "roles");
  if (auth.response) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const id = clean(body.id);
    if (!id) return Response.json({ error: "Missing role id" }, { status: 400 });

    const supabase = createSupabaseServiceClient();
    const { data: existing, error: existingError } = await supabase
      .from("app_roles")
      .select("id,code,is_system")
      .eq("id", id)
      .single();
    if (existingError || !existing) return Response.json({ error: existingError?.message ?? "Role not found" }, { status: 404 });
    if (existing.is_system || isSystemRoleCode(existing.code)) {
      return Response.json({ error: "System roles cannot be deleted" }, { status: 400 });
    }

    const { count } = await supabase
      .from("app_users")
      .select("id", { count: "exact", head: true })
      .eq("role", existing.code);
    if ((count ?? 0) > 0) {
      return Response.json({ error: "Role is still assigned to users" }, { status: 400 });
    }

    const { error } = await supabase.from("app_roles").delete().eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 400 });

    clearRoleAccessCache(existing.code);
    revalidateRoleViews();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
