import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const bridgeMigrationPath = "supabase/migrations/202606120003_price_snapshot_sku_link.sql";
const ownershipMigrationPath = "supabase/migrations/202606120004_price_snapshot_single_product_owner.sql";
const bridgeMigration = existsSync(bridgeMigrationPath) ? readFileSync(bridgeMigrationPath, "utf8") : "";
const ownershipMigration = existsSync(ownershipMigrationPath) ? readFileSync(ownershipMigrationPath, "utf8") : "";
const typesFile = readFileSync("src/lib/types.ts", "utf8");
const priceSnapshotsRoute = readFileSync("src/app/api/price-snapshots/route.ts", "utf8");
const aiPriceReview = readFileSync("src/lib/ai-price-review.ts", "utf8");
const pricesPage = readFileSync("src/app/[locale]/prices/page.tsx", "utf8");
const priceSnapshotsTable = readFileSync("src/components/price-snapshots-table.tsx", "utf8");
const priceExportRoute = readFileSync("src/app/api/price-snapshots/export/route.ts", "utf8");
const skuBridge = existsSync("src/lib/sku-master-bridge.ts") ? readFileSync("src/lib/sku-master-bridge.ts", "utf8") : "";

test("migration preserves material SKU code and enforces single snapshot product owner", () => {
  assert.match(bridgeMigration, /alter table public\.sku_master[\s\S]*add column if not exists material_sku_code text/);
  assert.match(bridgeMigration, /alter table public\.price_snapshots[\s\S]*add column if not exists sku_master_id uuid/);
  assert.match(ownershipMigration, /alter table public\.price_snapshots[\s\S]*alter column competitor_product_id drop not null/);
  assert.match(ownershipMigration, /price_snapshots_single_product_owner_check/);
  assert.match(ownershipMigration, /competitor_product_id is not null and sku_master_id is null/);
  assert.match(ownershipMigration, /competitor_product_id is null and sku_master_id is not null/);
  assert.match(ownershipMigration, /set sku_master_id = null/);
});

test("types expose nullable competitor and Makuku snapshot owners", () => {
  assert.match(typesFile, /competitor_product_id: string \| null/);
  assert.match(typesFile, /sku_master_id: string \| null/);
  assert.match(typesFile, /sku_master\?: SkuMaster \| null/);
  assert.match(typesFile, /material_sku_code: string \| null/);
});

test("photo review writes only one product owner per snapshot", () => {
  assert.match(skuBridge, /export async function ensureSkuMasterFromMaterial/);
  assert.match(aiPriceReview, /candidateRow\.matched_entity_type === "material_master"/);
  assert.match(aiPriceReview, /competitor_product_id: null/);
  assert.match(aiPriceReview, /sku_master_id: skuMasterId/);
  assert.match(aiPriceReview, /candidateRow\.matched_entity_type === "competitor_product"/);
  assert.match(aiPriceReview, /competitor_product_id: competitorProduct!?\.(id)/);
  assert.match(aiPriceReview, /sku_master_id: null/);
  assert.match(aiPriceReview, /Unmatched candidates cannot be approved/);
});

test("price snapshots PATCH switches owner without updating mapping rules", () => {
  assert.match(priceSnapshotsRoute, /export async function PATCH/);
  assert.match(priceSnapshotsRoute, /requireAdminSession\(request\)/);
  assert.match(priceSnapshotsRoute, /ownerType/);
  assert.match(priceSnapshotsRoute, /competitor_product_id: ownerType === "competitor" \? competitorProduct!?\.(id) : null/);
  assert.match(priceSnapshotsRoute, /sku_master_id: ownerType === "makuku" \? skuMasterId : null/);
  assert.match(priceSnapshotsRoute, /normalizePriceSnapshot/);
  assert.doesNotMatch(priceSnapshotsRoute, /\.from\("sku_matches"\)\.(insert|update)/);
});

test("prices page and export show actual owner and filter by derived Makuku SKU code", () => {
  assert.match(pricesPage, /getMaterialMaster\(\)/);
  assert.match(pricesPage, /snapshotMakukuMaterialCode/);
  assert.match(pricesPage, /params\.sku/);
  assert.match(priceSnapshotsTable, /商品类型|Product Type/);
  assert.match(priceSnapshotsTable, /ownerType/);
  assert.match(priceSnapshotsTable, /Makuku SKU/);
  assert.match(priceExportRoute, /Product Type/);
  assert.match(priceExportRoute, /sku_master\(\*\)/);
  assert.match(priceExportRoute, /snapshotMakukuMaterialCode/);
});
