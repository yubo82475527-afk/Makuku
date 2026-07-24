import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const offlineStoresApi = readFileSync("src/app/api/offline-stores/route.ts", "utf8");
const dataFile = readFileSync("src/lib/data.ts", "utf8");
const typesFile = readFileSync("src/lib/types.ts", "utf8");
const offlineStoresPage = readFileSync("src/app/[locale]/offline-stores/page.tsx", "utf8");
const creatorMigration = readFileSync("supabase/migrations/202606100002_offline_store_creator_fields.sql", "utf8");
const storeMasterTable = existsSync("src/components/store-master-table.tsx")
  ? readFileSync("src/components/store-master-table.tsx", "utf8")
  : "";

test("offline stores support logical delete without physical delete", () => {
  assert.equal(existsSync("supabase/migrations/202606080002_offline_store_soft_delete.sql"), true);
  const migration = readFileSync("supabase/migrations/202606080002_offline_store_soft_delete.sql", "utf8");
  assert.match(migration, /add column if not exists deleted_at timestamptz/i);
  assert.match(migration, /idx_offline_stores_deleted_at/i);
  assert.equal(existsSync("supabase/migrations/202606080003_offline_store_status.sql"), true);
  const statusMigration = readFileSync("supabase/migrations/202606080003_offline_store_status.sql", "utf8");
  assert.match(statusMigration, /add column if not exists status text/i);
  assert.match(statusMigration, /add column if not exists disabled_at timestamptz/i);
  assert.match(statusMigration, /idx_offline_stores_status/i);

  assert.match(offlineStoresApi, /export async function DELETE/);
  assert.match(offlineStoresApi, /\.update\(\{\s*status:\s*"disabled",\s*disabled_at:/s);
  assert.doesNotMatch(offlineStoresApi, /\.delete\(\)/);
  assert.doesNotMatch(offlineStoresApi, /offline_store_visits[\s\S]+\.update\(/);
  assert.match(offlineStoresApi, /readRequestBody/);
  assert.match(offlineStoresApi, /isUuid/);
  assert.match(offlineStoresApi, /uuidIds/);
  assert.match(offlineStoresApi, /parseStoreRefs/);
  assert.match(offlineStoresApi, /\.in\("id", uuidIds\)/);
  assert.match(offlineStoresApi, /\.insert\(derivedDisablePayloads\)/);
  assert.doesNotMatch(offlineStoresApi, /stores:\s*ids\.map/);
});

test("deleted stores stay out of store master selection without changing visit history", () => {
  assert.match(typesFile, /deleted_at\?: string \| null/);
  assert.match(typesFile, /status\?: "enabled" \| "disabled" \| null/);
  assert.match(typesFile, /disabled_at\?: string \| null/);
  assert.match(dataFile, /disabledStoreKeys/);
  assert.match(dataFile, /disabledStoreIds/);
  assert.match(dataFile, /isDisabledOfflineStore/);
  assert.match(dataFile, /filterDisabledOfflineStores/);
  assert.match(dataFile, /status\s*:\s*store\.status/);
  assert.match(dataFile, /disabled_at\s*:\s*store\.disabled_at/);
});

test("store master page exposes delete action for stores", () => {
  assert.match(offlineStoresPage, /StoreMasterTable/);
  assert.match(offlineStoresPage, /organizations=\{organizationsResult\.data\}/);
  assert.match(offlineStoresPage, /storesResult\.data/);
  assert.match(offlineStoresPage, /searchParams: Promise/);
  assert.match(offlineStoresPage, /statusFilter/);
  assert.match(offlineStoresPage, /getOfflineStores\(\{ status: statusFilter, organization: organizationFilter \}\)/);
  assert.match(offlineStoresPage, /name="status"/);
  assert.match(offlineStoresPage, /name="organization"/);
  assert.match(offlineStoresPage, /name="per_page"/);
  assert.match(offlineStoresPage, /pagedStores/);
  assert.match(offlineStoresPage, /total=\{total\}/);
  assert.match(offlineStoresPage, /page=\{currentPage\}/);
  assert.match(offlineStoresPage, /perPage=\{perPage\}/);
  assert.match(storeMasterTable, /PaginationLink/);
  assert.match(storeMasterTable, /buildHref/);
  assert.match(storeMasterTable, /上一页|Previous/);
  assert.match(storeMasterTable, /下一页|Next/);
  assert.doesNotMatch(storeMasterTable, /StoreCreateDialog/);
  assert.match(dataFile, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(storeMasterTable, /selectedIds/);
  assert.match(storeMasterTable, /bulkOrganizationId/);
  assert.match(storeMasterTable, /storeStatusPayload/);
  assert.match(storeMasterTable, /JSON\.stringify\(storeStatusPayload/);
  assert.match(storeMasterTable, /ConfirmDeletePanel/);
  assert.match(storeMasterTable, /Disable Store/);
  assert.match(storeMasterTable, /formatCreatedAt/);
  assert.match(storeMasterTable, /storeCreator/);
  assert.doesNotMatch(storeMasterTable, /rematchSelectedStores/);
  assert.doesNotMatch(storeMasterTable, /Save Org/);
  assert.doesNotMatch(storeMasterTable, /Rematch/);
  assert.match(storeMasterTable, /\u521b\u5efa\u65f6\u95f4|Created At/);
  assert.match(storeMasterTable, /\u521b\u5efa\u4eba|Created By/);
  assert.match(storeMasterTable, /whitespace-nowrap py-3 pr-3/);
  assert.match(typesFile, /created_by\?: string \| null/);
  assert.match(typesFile, /created_by_user_id\?: string \| null/);
  assert.match(creatorMigration, /add column if not exists created_by text/i);
  assert.match(creatorMigration, /add column if not exists created_by_user_id text/i);
  assert.match(creatorMigration, /add column if not exists created_by_name text/i);
  assert.match(creatorMigration, /from public\.offline_store_visits/i);
  assert.match(creatorMigration, /with first_visit_creator as/i);
  assert.match(creatorMigration, /distinct on \(store_id\)/i);
  assert.match(creatorMigration, /uploader_user_id/i);
  assert.match(creatorMigration, /uploader_name/i);
  assert.doesNotMatch(creatorMigration, /from lateral/i);
  assert.match(offlineStoresApi, /createdByUserId/);
  assert.match(offlineStoresApi, /created_by_user_id: createdByUserId/);
  assert.match(offlineStoresApi, /created_by_name: createdByName/);
  assert.match(offlineStoresApi, /isStoreCreatorColumnError/);
  assert.doesNotMatch(storeMasterTable, /window\.confirm/);
  assert.doesNotMatch(storeMasterTable, /Delete Store|Bulk Delete|Confirm Delete/);
});
