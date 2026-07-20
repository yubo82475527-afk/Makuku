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

test("store visit price candidate sync carries persisted row evidence confidence", () => {
  assert.match(syncFile, /normal_package_price_confidence: row\.normal_package_price_confidence/);
  assert.match(syncFile, /promo_package_price_confidence: row\.promo_package_price_confidence/);
  assert.match(syncFile, /normal_per_piece_price_confidence: row\.normal_per_piece_price_confidence/);
  assert.match(syncFile, /promo_per_piece_price_confidence: row\.promo_per_piece_price_confidence/);
  assert.match(syncFile, /piece_count_confidence: row\.piece_count_confidence/);
  assert.match(syncFile, /row_binding_confidence: row\.row_binding_confidence/);
  assert.match(syncFile, /section_binding_confidence: row\.section_binding_confidence/);
  assert.match(syncFile, /product_identity_confidence: row\.product_identity_confidence/);
});

test("store visit price candidate sync recomputes review decision during rerun", () => {
  assert.doesNotMatch(syncFile, /review_decision: row\.review_decision/);
});

test("store visit price candidate sync only inserts missing row identities", () => {
  assert.match(syncFile, /source_image_id/);
  assert.match(syncFile, /source_row_index/);
  assert.match(syncFile, /existingRowKeys/);
  assert.match(syncFile, /preserveExistingCandidates: true/);
  assert.match(syncFile, /insertAiPriceCandidateRows/);
});
