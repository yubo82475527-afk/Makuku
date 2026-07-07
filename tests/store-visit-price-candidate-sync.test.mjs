import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const syncPath = "src/lib/store-visit-price-candidate-sync.ts";
const syncFile = existsSync(syncPath) ? readFileSync(syncPath, "utf8") : "";

test("store visit price candidate sync reads persisted price image rows", () => {
  assert.match(syncFile, /export async function syncStoreVisitPriceCandidatesFromImages/);
  assert.match(syncFile, /offline_visit_images/);
  assert.match(syncFile, /vision_result/);
  assert.match(syncFile, /schema_version !== "store_visit_price_image_v1"/);
  assert.match(syncFile, /sourceRowIndex: rowIndex/);
});

test("store visit price candidate sync only inserts missing row identities", () => {
  assert.match(syncFile, /source_image_id/);
  assert.match(syncFile, /source_row_index/);
  assert.match(syncFile, /existingRowKeys/);
  assert.match(syncFile, /preserveExistingCandidates: true/);
  assert.match(syncFile, /insertAiPriceCandidateRows/);
});
