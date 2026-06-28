import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const offlineStoresPage = readFileSync("src/app/[locale]/offline-stores/page.tsx", "utf8");
const storeMasterTable = readFileSync("src/components/store-master-table.tsx", "utf8");
const offlineStoresApi = readFileSync("src/app/api/offline-stores/route.ts", "utf8");

test("store master page passes organizations into the table and removes PC create entry", () => {
  assert.match(offlineStoresPage, /organizations=\{organizationsResult\.data\}/);
  assert.doesNotMatch(storeMasterTable, /StoreCreateDialog/);
});

test("store master table supports batch organization assignment without method labels", () => {
  assert.match(storeMasterTable, /type \{ OfflineStore, Organization \}/);
  assert.match(storeMasterTable, /SelectInput/);
  assert.match(storeMasterTable, /bulkOrganizationId/);
  assert.match(storeMasterTable, /organizationDialogOpen/);
  assert.match(storeMasterTable, /openOrganizationDialog/);
  assert.match(storeMasterTable, /ConfirmOrganizationPanel/);
  assert.match(storeMasterTable, /selectedVisibleIds/);
  assert.match(storeMasterTable, /const organizationId = bulkOrganizationId === "unassigned" \? null : bulkOrganizationId/);
  assert.match(storeMasterTable, /organization_id: organizationId/);
  assert.match(storeMasterTable, /method: "PATCH"/);
  assert.match(storeMasterTable, /\u4fee\u6539\u7ec4\u7ec7|Change Organization/);
  assert.match(storeMasterTable, /\u786e\u8ba4|Confirm/);
  assert.doesNotMatch(storeMasterTable, /organization_assignment_method/);
  assert.doesNotMatch(storeMasterTable, /Bulk Rematch Organizations|Rematch|Save Org/);
});

test("offline stores PATCH can batch update organization id without auto assignment actions", () => {
  assert.match(offlineStoresApi, /hasOrganizationPatch/);
  assert.match(offlineStoresApi, /organization_id: organizationId/);
  assert.match(offlineStoresApi, /\.in\("id", uuidIds\)/);
  assert.doesNotMatch(offlineStoresApi, /assign_organization|auto_assign_organization/);
  assert.doesNotMatch(offlineStoresApi, /rule_matched_count|ai_suggested_count|manual_skipped_count/);
});
