import { readSessionFromCookies, type AppSession } from "@/lib/auth-session";
import { isSystemAdminRole } from "@/lib/page-permissions";
import { loadRoleAccess } from "@/lib/role-access";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";

export type DataScope =
  | { mode: "all" }
  | { mode: "empty" }
  | { mode: "organization"; organizationIds: string[] };

export async function resolveDataScope(userId: string, roleCode: string): Promise<DataScope> {
  if (isSystemAdminRole(roleCode)) return { mode: "all" };

  const access = await loadRoleAccess(roleCode);
  if (!access) return { mode: "empty" };
  if (access.dataScope === "all") return { mode: "all" };

  if (!hasSupabaseServiceConfig()) return { mode: "empty" };

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("app_user_id", userId)
    .eq("active", true);

  if (error) return { mode: "empty" };

  const organizationIds = Array.from(
    new Set((data ?? []).map((row) => String(row.organization_id)).filter(Boolean)),
  );
  if (organizationIds.length === 0) return { mode: "empty" };
  return { mode: "organization", organizationIds };
}

export async function resolveDataScopeForSession(session: Pick<AppSession, "id" | "role"> | null | undefined) {
  if (!session?.id || !session.role) return { mode: "empty" } as DataScope;
  return resolveDataScope(session.id, session.role);
}

export async function resolveSessionDataScope(): Promise<DataScope> {
  const session = await readSessionFromCookies();
  return resolveDataScopeForSession(session);
}

/** Intersect optional UI org store IDs with permission scope store IDs. */
export function intersectStoreIdLists(
  uiStoreIds: string[] | null | undefined,
  scopedStoreIds: string[] | null,
): string[] | null {
  if (scopedStoreIds === null) return uiStoreIds ?? null;
  if (scopedStoreIds.length === 0) return [];
  if (uiStoreIds == null) return scopedStoreIds;
  const allowed = new Set(scopedStoreIds);
  return uiStoreIds.filter((id) => allowed.has(id));
}

export function organizationIdsInScope(scope: DataScope): string[] | null {
  if (scope.mode === "all") return null;
  if (scope.mode === "empty") return [];
  return scope.organizationIds;
}

/** Returns store IDs visible under scope. null = unrestricted; [] = none. */
export async function resolveScopedStoreIds(scope: DataScope): Promise<string[] | null> {
  if (scope.mode === "all") return null;
  if (scope.mode === "empty") return [];
  if (!hasSupabaseServiceConfig()) return [];

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("offline_stores")
    .select("id")
    .in("organization_id", scope.organizationIds);

  if (error) return [];
  return (data ?? []).map((row) => String(row.id));
}

export function storeMatchesDataScope(
  store: { organization_id?: string | null },
  scope: DataScope,
) {
  if (scope.mode === "all") return true;
  if (scope.mode === "empty") return false;
  const organizationId = store.organization_id ?? null;
  if (!organizationId) return false;
  return scope.organizationIds.includes(organizationId);
}

export function filterItemsByStoreScope<T extends { store_id?: string | null }>(
  items: T[],
  scopedStoreIds: string[] | null,
) {
  if (scopedStoreIds === null) return items;
  if (scopedStoreIds.length === 0) return [];
  const allowed = new Set(scopedStoreIds);
  return items.filter((item) => item.store_id && allowed.has(item.store_id));
}

/**
 * Clamp a client-provided organization filter to the caller's data scope.
 * - Returns "empty" when the request must yield no rows.
 * - Returns "all" / org id / "unassigned" only when allowed.
 */
export function clampOrganizationFilter(
  requested: string | undefined,
  scope: DataScope,
): "all" | "unassigned" | "empty" | string {
  const value = String(requested ?? "").trim() || "all";

  if (scope.mode === "all") return value === "" ? "all" : value;
  if (scope.mode === "empty") return "empty";

  if (value === "unassigned") return "empty";
  if (value === "all") return "all";
  if (scope.organizationIds.includes(value)) return value;
  return "empty";
}

export function organizationsVisibleInScope<T extends { id: string }>(organizations: T[], scope: DataScope) {
  if (scope.mode === "all") return organizations;
  if (scope.mode === "empty") return [];
  const allowed = new Set(scope.organizationIds);
  return organizations.filter((organization) => allowed.has(organization.id));
}
