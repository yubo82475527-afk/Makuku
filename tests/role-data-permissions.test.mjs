import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const migration = readIfExists("supabase/migrations/202607240001_app_roles_page_permissions.sql");
const pagePermissions = readIfExists("src/lib/page-permissions.ts");
const roleAccess = readIfExists("src/lib/role-access.ts");
const dataScope = readIfExists("src/lib/data-scope.ts");
const authSession = readIfExists("src/lib/auth-session.ts");
const proxyFile = readIfExists("proxy.ts");
const appShell = readIfExists("src/components/app-shell.tsx");
const navConfig = readIfExists("src/lib/nav-config.ts");
const navSurface = `${appShell}\n${navConfig}`;
const rolesPage = readIfExists("src/app/[locale]/roles/page.tsx");
const rolesApi = readIfExists("src/app/api/app-roles/route.ts");
const roleManagement = readIfExists("src/components/role-management.tsx");
const dataFile = readIfExists("src/lib/data.ts");
const offlineStoresPage = readIfExists("src/app/[locale]/offline-stores/page.tsx");
const pricesPage = readIfExists("src/app/[locale]/prices/page.tsx");
const candidatesPage = readIfExists("src/app/[locale]/offline-price-candidates/page.tsx");
const dashboardApi = readIfExists("src/app/api/dashboard/route.ts");
const monitorApi = readIfExists("src/app/api/store-visit-monitor/route.ts");
const offlineStoresApi = readIfExists("src/app/api/offline-stores/route.ts");
const usersApi = readIfExists("src/app/api/app-users/route.ts");
const feishuLogin = readIfExists("src/app/api/auth/feishu-login/route.ts");
const operatorReview = readIfExists("src/lib/operator-price-review.ts");

test("roles migration seeds system admin + field_agent and compatibility manager", () => {
  assert.match(migration, /create table if not exists public\.app_roles/);
  assert.match(migration, /create table if not exists public\.app_role_page_permissions/);
  assert.match(migration, /'admin'/);
  assert.match(migration, /'field_agent'/);
  assert.match(migration, /'manager'/);
  assert.match(migration, /is_system boolean/);
  assert.match(migration, /data_scope text/);
  assert.match(migration, /page_key/);
});

test("page permission and data scope kernels exist", () => {
  assert.match(pagePermissions, /export const PAGE_KEYS/);
  assert.match(pagePermissions, /export const ROLE_PAGE_KEYS/);
  assert.match(pagePermissions, /export const LEGACY_PAGE_KEYS/);
  assert.match(pagePermissions, /offline-uploads/);
  assert.match(pagePermissions, /roles/);
  assert.match(pagePermissions, /SYSTEM_ROLE_CODES/);
  assert.match(pagePermissions, /DEFAULT_H5_ROLE_CODE/);
  assert.match(roleAccess, /export async function loadRoleAccess/);
  assert.match(roleAccess, /export async function roleHasPagePermission/);
  assert.match(roleAccess, /export async function roleCanAccessPc/);
  assert.match(dataScope, /mode: "all"/);
  assert.match(dataScope, /mode: "empty"/);
  assert.match(dataScope, /mode: "organization"/);
  assert.match(dataScope, /resolveDataScope/);
  assert.match(dataScope, /clampOrganizationFilter/);
  assert.match(dataScope, /storeMatchesDataScope/);
  assert.match(authSession, /requirePagePermission/);
  assert.match(authSession, /sessionPageKeys/);
});

test("legacy pages are excluded from role assignment UI", () => {
  assert.match(pagePermissions, /LEGACY_PAGE_KEYS/);
  assert.match(pagePermissions, /filterRoleAssignablePages/);
  assert.doesNotMatch(roleManagement, /offline-uploads/);
  assert.match(rolesApi, /ROLE_PAGE_KEYS/);
  assert.match(rolesApi, /isRolePageKey/);
  assert.match(rolesPage, /ROLE_PAGE_KEYS/);
});

test("proxy enforces page permissions and includes roles route", () => {
  assert.match(proxyFile, /roleHasPagePermission/);
  assert.match(proxyFile, /PAGE_KEYS/);
  assert.match(proxyFile, /pageKeyFromPathRoot/);
  assert.match(pagePermissions, /"roles"/);
  assert.match(pagePermissions, /"organizations"/);
  assert.match(pagePermissions, /"store-visit-monitor"/);
  assert.match(pagePermissions, /"report-center"/);
  assert.doesNotMatch(proxyFile, /isAllowedAdminRole/);
});

test("app shell filters nav by page permissions and exposes roles", () => {
  assert.match(appShell, /allowedPages/);
  assert.match(navSurface, /pageKey:\s*"roles"/);
  assert.match(navSurface, /Roles & Permissions/);
  assert.match(appShell, /pages\?: PageKey\[]/);
});

test("role management UI and API are wired", () => {
  assert.match(rolesPage, /RoleManagement/);
  assert.match(rolesPage, /app_roles/);
  assert.match(roleManagement, /\/api\/app-roles/);
  assert.match(roleManagement, /page_keys/);
  assert.match(roleManagement, /is_system/);
  assert.match(rolesApi, /requirePagePermission/);
  assert.match(rolesApi, /System roles cannot be deleted/);
  assert.match(rolesApi, /Cannot create a role with a reserved system code/);
});

test("store-linked read paths accept and enforce dataScope", () => {
  assert.match(dataFile, /dataScope\?: DataScope/);
  assert.match(dataFile, /storeMatchesDataScope/);
  assert.match(dataFile, /resolveScopedStoreIds/);
  assert.match(dataFile, /intersectStoreIdLists/);
  assert.match(offlineStoresPage, /resolveSessionDataScope/);
  assert.match(offlineStoresPage, /clampOrganizationFilter/);
  assert.match(pricesPage, /dataScope/);
  assert.match(candidatesPage, /dataScope/);
  assert.match(operatorReview, /scopedStoreIds/);
  assert.match(dashboardApi, /resolveDataScopeForSession/);
  assert.match(monitorApi, /dataScope/);
  assert.match(offlineStoresApi, /resolveDataScopeForSession/);
});

test("H5 provisioning stays on field_agent and users API validates roles", () => {
  assert.match(feishuLogin, /role:\s*"field_agent"/);
  assert.match(usersApi, /loadRoleAccess/);
  assert.match(usersApi, /Only admin can assign the admin role/);
  assert.match(usersApi, /DEFAULT_H5_ROLE_CODE|field_agent/);
  assert.match(usersApi, /requirePagePermission/);
});
