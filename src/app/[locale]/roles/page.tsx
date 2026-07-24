import { PageShellState } from "@/components/page-shell-state";
import { RoleManagement } from "@/components/role-management";
import { Card, DataNotice } from "@/components/ui";
import { getPageI18n } from "@/lib/i18n/server";
import { ROLE_PAGE_KEYS, filterRoleAssignablePages, type RolePageKey } from "@/lib/page-permissions";
import { listActiveRoles } from "@/lib/role-access";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";
import type { AppRole } from "@/lib/types";

export const dynamic = "force-dynamic";

async function loadRoles(): Promise<{ data: AppRole[]; error: string | null; isDemo: boolean }> {
  const active = await listActiveRoles();
  if (!hasSupabaseServiceConfig()) {
    return {
      data: active.map((role) => ({
        id: role.code,
        code: role.code,
        name: role.name,
        description: role.description,
        is_system: role.isSystem,
        data_scope: role.dataScope,
        status: role.status,
        created_at: new Date(0).toISOString(),
        page_keys: role.code === "admin" ? [...ROLE_PAGE_KEYS] : filterRoleAssignablePages(role.pages),
      })),
      error: null,
      isDemo: true,
    };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("app_roles")
      .select("id,code,name,description,is_system,data_scope,status,created_at,updated_at")
      .order("is_system", { ascending: false })
      .order("code", { ascending: true });
    if (error) return { data: [], error: error.message, isDemo: false };

    const roleIds = (data ?? []).map((role) => role.id);
    const { data: permissions } = roleIds.length
      ? await supabase.from("app_role_page_permissions").select("role_id,page_key").in("role_id", roleIds)
      : { data: [] as Array<{ role_id: string; page_key: string }> };
    const pagesByRole = new Map<string, string[]>();
    for (const row of permissions ?? []) {
      const list = pagesByRole.get(row.role_id) ?? [];
      list.push(String(row.page_key));
      pagesByRole.set(row.role_id, list);
    }

    return {
      data: (data ?? []).map((role) => ({
        ...role,
        page_keys: role.code === "admin"
          ? [...ROLE_PAGE_KEYS]
          : filterRoleAssignablePages(pagesByRole.get(role.id)),
      })),
      error: null,
      isDemo: false,
    };
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : "Unknown error", isDemo: false };
  }
}

export default async function RolesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const result = await loadRoles();
  const isZh = locale === "zh";

  return (
    <>
      <PageShellState
        locale={locale}
        dict={dict}
        title={isZh ? "角色权限" : "Roles & Permissions"}
        currentPath="/roles"
        isDemo={result.isDemo}
      />
      <DataNotice dict={dict} error={result.error} />
      <Card>
        <RoleManagement roles={result.data} pageKeys={[...ROLE_PAGE_KEYS] as RolePageKey[]} locale={locale} />
      </Card>
    </>
  );
}
