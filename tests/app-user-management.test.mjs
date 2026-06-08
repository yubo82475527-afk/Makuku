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
const userTable = readIfExists("src/components/app-user-management-table.tsx");
const migration = readIfExists("supabase/migrations/202606080004_app_user_management.sql");

test("PC navigation exposes app user management", () => {
  assert.match(appShell, /href:\s*"\/users"/);
  assert.match(appShell, /User Management/);
  assert.ok(usersPage.includes("<AppShell"), "users page should use the PC app shell");
  assert.match(usersPage, /getAppUsers/);
  assert.match(usersPage, /app-user-management-table|AppUserManagementTable/);
});

test("app user management API hashes passwords and supports account status", () => {
  assert.match(dataFile, /export async function getAppUsers/);
  assert.match(usersApi, /from\("app_users"\)/);
  assert.match(usersApi, /createHash\("sha256"\)/);
  assert.match(usersApi, /password_hash/);
  assert.match(usersApi, /status/);
  assert.match(usersApi, /disabled_at/);
  assert.doesNotMatch(usersApi, /password_hash:\s*password/);
  assert.match(userTable, /Reset password/);
  assert.match(userTable, /Disable|Enable/);
});

test("disabled app users cannot log in", () => {
  assert.match(loginRoute, /status/);
  assert.match(loginRoute, /disabled/);
  assert.match(loginRoute, /Account is disabled/);
});

test("migration adds app user lifecycle fields", () => {
  assert.match(migration, /create table if not exists public\.app_users/);
  assert.match(migration, /add column if not exists status/);
  assert.match(migration, /add column if not exists disabled_at/);
  assert.match(migration, /app_users_status_check/);
  assert.match(migration, /idx_app_users_status/);
});
