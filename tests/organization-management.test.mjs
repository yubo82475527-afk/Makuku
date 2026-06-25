import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const migration = readIfExists("supabase/migrations/202606160002_organizations_store_assignment.sql");
const aiAssignmentMigration = readIfExists("supabase/migrations/202606160003_store_organization_ai_assignment.sql");
const replaceMembersMigration = readIfExists("supabase/migrations/202606250002_replace_user_organization_members.sql");
const typesFile = readIfExists("src/lib/types.ts");
const dataFile = readIfExists("src/lib/data.ts");
const helper = readIfExists("src/lib/organizations.ts");
const assignmentHelper = readIfExists("src/lib/store-organization-assignment.ts");
const appShell = readIfExists("src/components/app-shell.tsx");
const organizationsPage = readIfExists("src/app/[locale]/organizations/page.tsx");
const organizationsComponent = readIfExists("src/components/organization-management.tsx");
const organizationsApi = readIfExists("src/app/api/organizations/route.ts");
const organizationMembersApi = readIfExists("src/app/api/organizations/members/route.ts");
const organizationRulesApi = readIfExists("src/app/api/organizations/region-rules/route.ts");
const offlineStoresApi = readIfExists("src/app/api/offline-stores/route.ts");
const offlineStoresPage = readIfExists("src/app/[locale]/offline-stores/page.tsx");
const storeTable = readIfExists("src/components/store-master-table.tsx");
const storeCreateDialog = readIfExists("src/components/store-create-dialog.tsx");

test("organization migration creates master data, members, region rules, and store assignment fields", () => {
  assert.match(migration, /create table if not exists public\.organizations/);
  assert.match(migration, /create table if not exists public\.organization_members/);
  assert.match(migration, /create table if not exists public\.organization_region_rules/);
  assert.match(migration, /GREATER JAKARTA/);
  assert.match(migration, /BIG BALI/);
  assert.match(migration, /organization_id uuid references public\.organizations/);
  assert.match(migration, /organization_assignment_method/);
  assert.match(migration, /auto_region_rule/);
  assert.match(migration, /manual/);
  assert.match(migration, /uniq_organization_region_rules_active_scope/);
  assert.match(replaceMembersMigration, /create or replace function public\.replace_user_organization_members/);
  assert.match(replaceMembersMigration, /security definer/);
  assert.match(replaceMembersMigration, /delete from public\.organization_members/);
  assert.match(replaceMembersMigration, /insert into public\.organization_members/);
});

test("store organization AI assignment migration and helper are wired", () => {
  assert.match(aiAssignmentMigration, /organization_assignment_confidence numeric/);
  assert.match(aiAssignmentMigration, /organization_assignment_reason text/);
  assert.match(aiAssignmentMigration, /ai_suggested/);
  assert.match(typesFile, /"ai_suggested"/);
  assert.match(typesFile, /organization_assignment_confidence/);
  assert.match(typesFile, /organization_assignment_reason/);
  assert.match(assignmentHelper, /assignOrganizationForStore/);
  assert.match(assignmentHelper, /createJsonChatCompletion/);
  assert.match(assignmentHelper, /Manual assignment skipped/);
  assert.match(assignmentHelper, /Matched organization region rule/);
  assert.match(assignmentHelper, /AI not configured/);
});

test("organization types, data queries, and matching helper exist", () => {
  assert.match(typesFile, /export type Organization/);
  assert.match(typesFile, /OrganizationMember/);
  assert.match(typesFile, /OrganizationRegionRule/);
  assert.match(typesFile, /organization_assignment_method/);
  assert.match(dataFile, /export async function getOrganizations/);
  assert.match(dataFile, /organization_members\(\*, app_users/);
  assert.match(dataFile, /organization_region_rules/);
  assert.match(dataFile, /organizations\(id,name,status\)/);
  assert.match(helper, /resolveOrganizationForRegion/);
  assert.match(helper, /cityName\) query = query\.or/);
  assert.match(helper, /provinceRule/);
  assert.match(helper, /organizationAssignmentPatch/);
});

test("organization management UI and APIs are wired", () => {
  assert.match(appShell, /\/organizations/);
  assert.match(appShell, /Organization Management/);
  assert.match(organizationsPage, /getOrganizations/);
  assert.match(organizationsPage, /OrganizationManagement/);
  assert.match(organizationsComponent, /\/api\/organizations/);
  assert.match(organizationsComponent, /\/api\/organizations\/members/);
  assert.match(organizationsComponent, /\/api\/organizations\/region-rules/);
  assert.match(organizationsComponent, /Organization owner/);
  assert.match(organizationsComponent, /Link regions/);
  assert.match(organizationsComponent, /Link users/);
  assert.match(organizationsComponent, /Add row/);
  assert.match(organizationsApi, /requireAdminSession/);
  assert.match(organizationMembersApi, /organization_members/);
  assert.match(organizationRulesApi, /organization_region_rules/);
  assert.match(organizationRulesApi, /Array\.isArray\(body\.rules\)/);
});

test("store creation and store management use organization assignment", () => {
  assert.match(offlineStoresApi, /resolveOrganizationForRegion/);
  assert.match(offlineStoresApi, /organizationAssignmentPatch/);
  assert.match(offlineStoresApi, /organizationId/);
  assert.match(offlineStoresApi, /organization_assignment_method: "manual"/);
  assert.match(offlineStoresApi, /assignOrganizationForStore/);
  assert.match(offlineStoresApi, /assign_organization/);
  assert.match(offlineStoresApi, /auto_assign_organization/);
  assert.match(offlineStoresApi, /rule_matched_count/);
  assert.match(offlineStoresApi, /ai_suggested_count/);
  assert.match(offlineStoresApi, /manual_skipped_count/);
  assert.match(offlineStoresPage, /getOrganizations/);
  assert.match(offlineStoresPage, /organizationFilter/);
  assert.match(offlineStoresPage, /channels=\{offlineChannels\}/);
  assert.match(offlineStoresPage, /useChannelTypeFallback=\{useChannelTypeFallback\}/);
  assert.match(offlineStoresPage, /name="status"/);
  assert.match(offlineStoresPage, /name="organization"/);
  assert.match(storeTable, /StoreCreateDialog/);
  assert.match(storeCreateDialog, /name="province"/);
  assert.match(storeCreateDialog, /name="city_name"/);
  assert.match(storeCreateDialog, /name="district"/);
  assert.match(storeCreateDialog, /autoComplete="off"/);
  assert.match(storeCreateDialog, /name="organization_id"/);
  assert.match(storeTable, /selectedIds/);
  assert.match(storeTable, /rematchSelectedStores/);
  assert.match(storeTable, /Bulk Rematch Organizations/);
  assert.match(storeTable, /AI\\u5efa\\u8bae|AI/);
  assert.match(storeTable, /Rematch/);
  assert.match(storeTable, /organization_assignment_method/);
});
