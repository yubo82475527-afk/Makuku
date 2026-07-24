import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const appShell = readFileSync("src/components/app-shell.tsx", "utf8");
const dataFile = readFileSync("src/lib/data.ts", "utf8");
const loginRoute = readFileSync("src/app/api/auth/login/route.ts", "utf8");
const usersPage = readIfExists("src/app/[locale]/users/page.tsx");
const usersApi = readIfExists("src/app/api/app-users/route.ts");
const feishuResolveApi = readIfExists("src/app/api/app-users/resolve-feishu-open-id/route.ts");
const feishuHelper = readIfExists("src/lib/feishu.ts");
const userCreateDialog = readIfExists("src/components/app-user-create-dialog.tsx");
const userTable = readIfExists("src/components/app-user-management-table.tsx");
const migration = readIfExists("supabase/migrations/202606080004_app_user_management.sql");
const feishuMigration = readIfExists("supabase/migrations/202606160001_app_user_feishu_id.sql");
const feishuAutoProvisionMigration = readIfExists("supabase/migrations/202606250001_feishu_h5_auto_provision.sql");
const feishuOrgMismatchMigration = readIfExists("supabase/migrations/202606250003_app_user_feishu_org_mismatch.sql");
const feishuOrgSnapshotMigration = readIfExists("supabase/migrations/202607230001_app_user_feishu_org_snapshot.sql");

test("PC navigation exposes app user management", () => {
  assert.match(appShell, /href:\s*"\/users"/);
  assert.match(appShell, /Users/);
  assert.match(usersPage, /PageShellState/);
  assert.match(usersPage, /currentPath=\{currentPath\}/);
  assert.match(usersPage, /getFilteredAppUsers/);
  assert.match(usersPage, /app-user-management-table|AppUserManagementTable/);
  assert.match(usersPage, /searchParams:/);
  assert.match(usersPage, /name="q"/);
  assert.match(usersPage, /name="role"/);
  assert.match(usersPage, /Button type="submit"/);
});

test("app user management API hashes passwords and supports account status", () => {
  assert.match(dataFile, /export async function getAppUsers/);
  assert.match(dataFile, /export async function getFilteredAppUsers/);
  assert.match(dataFile, /password_login_enabled/);
  assert.match(dataFile, /feishu_org_mismatch/);
  assert.match(dataFile, /organization_members\(\*, organizations\(id,name,status\)\)/);
  assert.match(dataFile, /organizationNames/);
  assert.match(dataFile, /haystack/);
  assert.match(usersApi, /from\("app_users"\)/);
  assert.match(usersApi, /createHash\("sha256"\)/);
  assert.match(usersApi, /password_hash/);
  assert.match(usersApi, /password_login_enabled/);
  assert.match(usersApi, /status/);
  assert.match(usersApi, /role/);
  assert.match(usersApi, /disabled_at/);
  assert.match(usersApi, /email/);
  assert.match(usersApi, /feishu_user_id/);
  assert.doesNotMatch(usersApi, /password_hash:\s*password/);
  assert.match(usersPage, /AppUserCreateDialog/);
  assert.match(userCreateDialog, /name="email"/);
  assert.doesNotMatch(usersPage, /name="feishu_user_id"/);
  assert.match(userTable, /Feishu Open ID/);
  assert.match(userTable, /systemOrganizationLabel/);
  assert.match(userTable, /feishuOrganizationLabel/);
  assert.match(userTable, /assignmentSourceLabel/);
  assert.match(userTable, /feishuOrganization/);
  assert.match(userTable, /systemOrganization/);
  assert.match(userTable, /orgMismatch/);
  assert.match(userTable, /feishu_org_mismatch/);
  assert.match(userTable, /feishu_org_names/);
  assert.match(userTable, /organization_assignment_method/);
  assert.match(userTable, /AlertCircle/);
  assert.match(userTable, /organizations\?\.name/);
  assert.match(userTable, /SelectInput/);
  assert.match(userTable, /resolve-feishu-open-id/);
  assert.match(userTable, /Reset password/);
  assert.match(userTable, /Disable|Enable/);
  assert.match(userTable, /roleOptions/);
  assert.match(userTable, /roles\?: Array<\{ code: string; name: string \}>/);
});

test("app user management API hashes passwords and supports account status fields for feishu org snapshot", () => {
  assert.match(dataFile, /feishu_org_ids/);
  assert.match(dataFile, /feishu_org_names/);
  assert.match(dataFile, /organization_assignment_method/);
});

test("user management keeps table compact and moves actions into controls", () => {
  assert.match(userCreateDialog, /Add user/);
  assert.match(userCreateDialog, /fixed inset-0/);
  assert.match(userTable, /Get Open ID/);
  assert.match(userTable, /Reset password/);
  assert.match(userTable, /aria-label=\{isZh \? zh\.getOpenId : "Get Open ID"\}/);
  assert.match(userTable, /title=\{user\.feishu_user_id/);
  assert.doesNotMatch(userTable, /<th[^>]*>\{isZh \? zh\.resetPassword/);
  assert.doesNotMatch(userTable, /<th[^>]*>\{isZh \? .*Feishu Open ID/);
});

test("app user management resolves Feishu Open ID from email", () => {
  assert.match(dataFile, /email,feishu_user_id/);
  assert.match(feishuResolveApi, /requireAdminSession/);
  assert.match(feishuResolveApi, /resolveFeishuOpenIdByEmail/);
  assert.match(feishuResolveApi, /User email is empty/);
  assert.match(feishuResolveApi, /feishu_user_id/);
  assert.match(feishuResolveApi, /console\.error/);
  assert.match(feishuResolveApi, /resolve-feishu-open-id failed/);
  assert.match(feishuHelper, /FEISHU_APP_ID/);
  assert.match(feishuHelper, /FEISHU_APP_SECRET/);
  assert.match(feishuHelper, /tenant_access_token\/internal/);
  assert.match(feishuHelper, /contact\/v3\/users\/batch_get_id/);
  assert.match(feishuHelper, /open_id/);
  assert.match(feishuHelper, /console\.info/);
  assert.match(feishuHelper, /console\.error/);
  assert.match(feishuHelper, /x-tt-logid/);
  assert.match(feishuHelper, /resolveFeishuOpenIdByEmail success/);
  assert.match(feishuHelper, /Feishu batch_get_id failed/);
  assert.match(feishuHelper, /Feishu user lookup returned no open_id/);
  assert.match(feishuHelper, /query_email=/);
  assert.match(feishuHelper, /matched_users=/);
  assert.doesNotMatch(feishuResolveApi, /FEISHU_APP_SECRET/);
});

test("disabled app users cannot log in", () => {
  assert.match(loginRoute, /status/);
  assert.match(loginRoute, /disabled/);
  assert.match(loginRoute, /Account is disabled/);
  assert.match(loginRoute, /password_login_enabled/);
  assert.match(loginRoute, /仅支持飞书登录/);
});

test("migration adds app user lifecycle fields", () => {
  assert.match(migration, /create table if not exists public\.app_users/);
  assert.match(migration, /add column if not exists status/);
  assert.match(migration, /add column if not exists disabled_at/);
  assert.match(migration, /app_users_status_check/);
  assert.match(migration, /idx_app_users_status/);
  assert.match(feishuMigration, /add column if not exists email/);
  assert.match(feishuMigration, /idx_app_users_email/);
  assert.match(feishuMigration, /add column if not exists feishu_user_id/);
  assert.match(feishuMigration, /idx_app_users_feishu_user_id/);
  assert.match(feishuAutoProvisionMigration, /alter column email drop not null/);
  assert.match(feishuAutoProvisionMigration, /add column if not exists password_login_enabled/);
  assert.match(feishuAutoProvisionMigration, /create unique index if not exists uniq_app_users_feishu_user_id/);
  assert.match(feishuOrgMismatchMigration, /add column if not exists feishu_org_mismatch/);
  assert.match(feishuOrgSnapshotMigration, /add column if not exists feishu_org_ids/);
  assert.match(feishuOrgSnapshotMigration, /add column if not exists feishu_org_names/);
  assert.match(feishuOrgSnapshotMigration, /add column if not exists organization_assignment_method/);
  assert.match(feishuOrgSnapshotMigration, /feishu_auto/);
  assert.match(feishuOrgSnapshotMigration, /manual/);
});
