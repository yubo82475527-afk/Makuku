import {
  DEFAULT_H5_ROLE_CODE,
  PAGE_KEYS,
  ROLE_PAGE_KEYS,
  SYSTEM_ADMIN_ROLE_CODE,
  type PageKey,
  isPageKey,
  isSystemAdminRole,
} from "@/lib/page-permissions";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";

export type RoleDataScopeMode = "all" | "organization";

export type RoleAccess = {
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  dataScope: RoleDataScopeMode;
  status: "active" | "inactive";
  pages: PageKey[];
};

const cacheTtlMs = 30_000;
const roleAccessCache = new Map<string, { expiresAt: number; value: RoleAccess | null }>();

function fallbackRoleAccess(roleCode: string): RoleAccess | null {
  const code = String(roleCode ?? "").trim();
  if (!code) return null;
  if (code === "admin") {
    return {
      code,
      name: "Admin",
      description: "System administrator with full page and data access",
      isSystem: true,
      dataScope: "all",
      status: "active",
      pages: [...PAGE_KEYS],
    };
  }
  if (code === "field_agent") {
    return {
      code,
      name: "Field agent",
      description: "H5 capture default role; no PC page permissions",
      isSystem: true,
      dataScope: "organization",
      status: "active",
      pages: [],
    };
  }
  if (code === "manager") {
    return {
      code,
      name: "Manager",
      description: "Compatibility PC role; not a system role",
      isSystem: false,
      dataScope: "organization",
      status: "active",
      pages: [...ROLE_PAGE_KEYS],
    };
  }
  return null;
}

function normalizePages(pages: string[] | null | undefined, roleCode: string): PageKey[] {
  if (isSystemAdminRole(roleCode)) return [...PAGE_KEYS];
  const unique = new Set<PageKey>();
  for (const page of pages ?? []) {
    if (isPageKey(page)) unique.add(page);
  }
  return [...unique];
}

export function clearRoleAccessCache(roleCode?: string) {
  if (roleCode) {
    roleAccessCache.delete(roleCode);
    return;
  }
  roleAccessCache.clear();
}

export async function loadRoleAccess(roleCode: string | null | undefined): Promise<RoleAccess | null> {
  const code = String(roleCode ?? "").trim();
  if (!code) return null;

  const cached = roleAccessCache.get(code);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value = fallbackRoleAccess(code);

  if (hasSupabaseServiceConfig()) {
    try {
      const supabase = createSupabaseServiceClient();
      const { data: role, error } = await supabase
        .from("app_roles")
        .select("id,code,name,description,is_system,data_scope,status")
        .eq("code", code)
        .maybeSingle();

      if (!error && role) {
        const { data: permissions } = await supabase
          .from("app_role_page_permissions")
          .select("page_key")
          .eq("role_id", role.id);

        value = {
          code: role.code,
          name: role.name,
          description: role.description ?? null,
          isSystem: Boolean(role.is_system),
          dataScope: role.data_scope === "all" ? "all" : "organization",
          status: role.status === "inactive" ? "inactive" : "active",
          pages: normalizePages((permissions ?? []).map((row) => String(row.page_key)), role.code),
        };
      }
    } catch {
      // Keep fallback when roles table is unavailable.
    }
  }

  if (value?.status === "inactive") value = null;

  roleAccessCache.set(code, { expiresAt: Date.now() + cacheTtlMs, value });
  return value;
}

export async function roleHasPagePermission(roleCode: string | null | undefined, pageKey: PageKey) {
  const access = await loadRoleAccess(roleCode);
  if (!access) return false;
  if (isSystemAdminRole(access.code)) return true;
  return access.pages.includes(pageKey);
}

export async function roleCanAccessPc(roleCode: string | null | undefined) {
  const access = await loadRoleAccess(roleCode);
  return Boolean(access && access.pages.length > 0);
}

export async function listActiveRoles(): Promise<RoleAccess[]> {
  if (!hasSupabaseServiceConfig()) {
    return [fallbackRoleAccess(SYSTEM_ADMIN_ROLE_CODE), fallbackRoleAccess(DEFAULT_H5_ROLE_CODE), fallbackRoleAccess("manager")].filter(
      (role): role is RoleAccess => Boolean(role),
    );
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { data: roles, error } = await supabase
      .from("app_roles")
      .select("id,code,name,description,is_system,data_scope,status")
      .eq("status", "active")
      .order("is_system", { ascending: false })
      .order("code", { ascending: true });

    if (error || !roles) {
      return [fallbackRoleAccess(SYSTEM_ADMIN_ROLE_CODE), fallbackRoleAccess(DEFAULT_H5_ROLE_CODE), fallbackRoleAccess("manager")].filter(
        (role): role is RoleAccess => Boolean(role),
      );
    }

    const roleIds = roles.map((role) => role.id);
    const { data: permissions } = roleIds.length
      ? await supabase.from("app_role_page_permissions").select("role_id,page_key").in("role_id", roleIds)
      : { data: [] as Array<{ role_id: string; page_key: string }> };

    const pagesByRole = new Map<string, string[]>();
    for (const row of permissions ?? []) {
      const list = pagesByRole.get(row.role_id) ?? [];
      list.push(String(row.page_key));
      pagesByRole.set(row.role_id, list);
    }

    return roles.map((role) => ({
      code: role.code,
      name: role.name,
      description: role.description ?? null,
      isSystem: Boolean(role.is_system),
      dataScope: role.data_scope === "all" ? "all" : "organization",
      status: "active" as const,
      pages: normalizePages(pagesByRole.get(role.id), role.code),
    }));
  } catch {
    return [fallbackRoleAccess(SYSTEM_ADMIN_ROLE_CODE), fallbackRoleAccess(DEFAULT_H5_ROLE_CODE), fallbackRoleAccess("manager")].filter(
      (role): role is RoleAccess => Boolean(role),
    );
  }
}
