import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const bridgeMigrationPath = "supabase/migrations/202606120003_price_snapshot_sku_link.sql";
const ownershipMigrationPath = "supabase/migrations/202606120004_price_snapshot_single_product_owner.sql";
const bridgeMigration = existsSync(bridgeMigrationPath) ? readFileSync(bridgeMigrationPath, "utf8") : "";
const ownershipMigration = existsSync(ownershipMigrationPath) ? readFileSync(ownershipMigrationPath, "utf8") : "";
const typesFile = readFileSync("src/lib/types.ts", "utf8");
const priceSnapshotsRoute = readFileSync("src/app/api/price-snapshots/route.ts", "utf8");
const dataFile = readFileSync("src/lib/data.ts", "utf8");
const aiPriceReview = readFileSync("src/lib/ai-price-review.ts", "utf8");
const operatorReviewMigration = readFileSync("supabase/migrations/202607130002_operator_price_review_phase2.sql", "utf8");
const pricesPage = readFileSync("src/app/[locale]/prices/page.tsx", "utf8");
const priceSnapshotsTable = readFileSync("src/components/price-snapshots-table.tsx", "utf8");
const priceExportRoute = readFileSync("src/app/api/price-snapshots/export/route.ts", "utf8");
const priceSnapshotBusiness = readFileSync("src/lib/price-snapshot-business.ts", "utf8");
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
  assert.match(aiPriceReview, /finalMatchType === "material_master"/);
  assert.match(aiPriceReview, /finalMatchType === "competitor_product"/);
  assert.match(operatorReviewMigration, /v_competitor_product_id uuid/);
  assert.match(operatorReviewMigration, /v_sku_master_id uuid/);
  assert.match(operatorReviewMigration, /Exactly one product owner is required/);
  assert.match(operatorReviewMigration, /insert into public\.price_snapshots[\s\S]*v_competitor_product_id,[\s\S]*v_sku_master_id,/);
  assert.match(aiPriceReview, /Please match a product before approving this candidate/);
  assert.doesNotMatch(aiPriceReview, /createCompetitorIfUnmatched/);
});

test("price snapshots PATCH switches owner without updating mapping rules", () => {
  assert.match(priceSnapshotsRoute, /export async function PATCH/);
  assert.match(priceSnapshotsRoute, /requireAdminSession\(request\)/);
  assert.match(priceSnapshotsRoute, /ownerType/);
  assert.match(priceSnapshotsRoute, /competitor_product_id: ownerType === "competitor" \? competitorProduct!?\.(id) : null/);
  assert.match(priceSnapshotsRoute, /sku_master_id: ownerType === "makuku" \? skuMasterId : null/);
  assert.match(priceSnapshotsRoute, /normalizePriceSnapshot/);
  assert.match(priceSnapshotsRoute, /\.update\(\{[\s\S]*material_sku_code:[\s\S]*piece_count:\s*pieceCount[\s\S]*price_per_piece:\s*normalized\.price_per_piece/);
  assert.doesNotMatch(priceSnapshotsRoute, /\.from\("sku_matches"\)\.(insert|update)/);
});

test("prices page and export show actual owner and filter by derived Makuku SKU code", () => {
  assert.doesNotMatch(pricesPage, /getMaterialMaster\(\)/);
  assert.match(pricesPage, /priceSnapshotMakukuMaterialCode/);
  assert.match(pricesPage, /params\.sku/);
  assert.doesNotMatch(priceSnapshotsTable, /商品类型|Product Type/);
  assert.match(priceSnapshotsTable, /priceBrandSeriesLabel/);
  assert.doesNotMatch(priceExportRoute, /Product Type/);
  assert.doesNotMatch(priceExportRoute, /Channel/);
  assert.match(priceExportRoute, /snapshotSkuCode\(snapshot\)/);
  assert.match(priceExportRoute, /priceSnapshotBusinessSegment\(snapshot\)/);
  assert.match(priceExportRoute, /sku_master\(\*, material_master\(\*\)\)/);
  assert.match(priceExportRoute, /priceSnapshotMakukuMaterialCode/);
});

test("real market price page supports captured_at date range filters in page and export", () => {
  assert.match(pricesPage, /name="createdFrom"/);
  assert.match(pricesPage, /name="createdTo"/);
  assert.match(pricesPage, /currentParams\.set\(key, params\[key\] as string\)/);
  assert.match(pricesPage, /params\.createdFrom/);
  assert.match(pricesPage, /params\.createdTo/);
  assert.match(pricesPage, /capturedFrom: params\.createdFrom \|\| undefined/);
  assert.match(pricesPage, /capturedTo: capturedToExclusive \?\? undefined/);
  assert.match(priceExportRoute, /const createdFrom = searchParams\.get\("createdFrom"\)/);
  assert.match(priceExportRoute, /const createdTo = searchParams\.get\("createdTo"\)/);
  assert.match(priceExportRoute, /matchesCreatedFrom\(snapshot\.captured_at, createdFrom\)/);
  assert.match(priceExportRoute, /matchesCreatedTo\(snapshot\.captured_at, createdTo\)/);
  assert.doesNotMatch(priceExportRoute, /matchesCreated(?:From|To)\(snapshot\.created_at/);
});

test("real market price visit and image ids link to filtered photo price review", () => {
  assert.match(priceSnapshotsTable, /import Link from "next\/link"/);
  assert.match(priceSnapshotsTable, /function photoReviewHref\(locale: string, filters: \{ visitCode\?: string \| null; imageId\?: string \| null \}\)/);
  assert.match(priceSnapshotsTable, /params\.set\("visit_code", visitCode\)/);
  assert.match(priceSnapshotsTable, /params\.set\("image_id", imageId\)/);
  assert.match(priceSnapshotsTable, /`\/\$\{locale\}\/offline-price-candidates\?\$\{params\.toString\(\)\}`/);
  assert.match(priceSnapshotsTable, /<LinkedReviewValue[\s\S]+value=\{visitCodeForSnapshot\(snapshot\)\}[\s\S]+href=\{photoReviewHref\(locale, \{ visitCode: visitCodeForSnapshot\(snapshot\) \}\)\}/);
  assert.match(priceSnapshotsTable, /<LinkedReviewValue[\s\S]+value=\{imageIdForSnapshot\(snapshot\)\}[\s\S]+href=\{photoReviewHref\(locale, \{ imageId: imageIdForSnapshot\(snapshot\) \}\)\}/);
});

test("real market price page shows activity type and three business prices", () => {
  assert.match(priceSnapshotsTable, /Activity Type/);
  assert.match(priceSnapshotsTable, /Discount/);
  assert.match(priceSnapshotsTable, /\[\&_th\]:whitespace-nowrap/);
  assert.match(priceSnapshotsTable, /snapshotDiscountAmount\(snapshot\)/);
  assert.match(priceSnapshotsTable, /snapshotPromoTypeLabel\(snapshot, isZh\)/);
  assert.doesNotMatch(priceSnapshotsTable, />\{isZh \? "券" : "Voucher"\}</);
  assert.doesNotMatch(priceSnapshotsTable, /formatIdr\(snapshot\.voucher_value_idr\)/);

  assert.match(priceExportRoute, /Activity Type/);
  assert.match(priceExportRoute, /Discount/);
  assert.match(priceExportRoute, /snapshotDiscountAmount\(snapshot\)/);
  assert.match(priceExportRoute, /snapshotPromoTypeLabel\(snapshot, locale === "zh"\)/);
  assert.doesNotMatch(priceExportRoute, /"Voucher"/);
});

test("real market price page treats package price as list price and calculates positive discount", () => {
  assert.match(typesFile, /package_price_idr\?: number \| null/);
  assert.match(priceSnapshotsTable, /snapshotPackagePrice\(snapshot\)/);
  assert.match(priceSnapshotsTable, /return snapshot\.package_price_idr \?\? null/);
  assert.doesNotMatch(priceSnapshotsTable, /snapshot\.package_price_idr \?\? snapshot\.promo_price_idr/);
  assert.match(priceSnapshotsTable, /return packagePrice - netPrice/);
  assert.doesNotMatch(priceSnapshotsTable, /return netPrice - packagePrice/);
  assert.match(priceExportRoute, /snapshotPackagePrice\(snapshot\)/);
  assert.match(priceExportRoute, /return snapshot\.package_price_idr \?\? null/);
  assert.doesNotMatch(priceExportRoute, /snapshot\.package_price_idr \?\? snapshot\.promo_price_idr/);
  assert.match(priceExportRoute, /return packagePrice - netPrice/);
  assert.doesNotMatch(priceExportRoute, /return netPrice - packagePrice/);
});

test("own price snapshots display brand and product from material master", () => {
  assert.match(typesFile, /material_master\?: MaterialMaster \| null/);
  assert.match(typesFile, /sku_master\?: SkuMaster \| null/);
  assert.match(dataFile, /material_master\(\*\)/);
  assert.match(priceExportRoute, /material_master\(\*\)/);
  assert.match(priceSnapshotsTable, /priceSnapshotBenchmarkMaterial\(snapshot\)\?\.tenant_sku_name/);
  assert.match(priceSnapshotBusiness, /priceSnapshotBenchmarkMaterial/);
  assert.match(priceSnapshotBusiness, /snapshot\.material_master[\s\S]*snapshot\.sku_master\?\.material_master/);
});

test("prices page and export use Makuku benchmark SKU business segment filters", () => {
  assert.match(priceSnapshotBusiness, /export function priceSnapshotBenchmarkSku/);
  assert.match(priceSnapshotBusiness, /export function priceSnapshotBusinessSegment/);
  assert.match(priceSnapshotBusiness, /export function priceSnapshotBusinessSize/);
  assert.match(priceSnapshotBusiness, /snapshot\.sku_master/);
  assert.doesNotMatch(priceSnapshotBusiness, /sku_matches/);
  assert.match(priceSnapshotBusiness, /priceSnapshotBenchmarkSku\(snapshot\)\?\.segment[\s\S]*snapshot\.competitor_products\?\.segment[\s\S]*"unknown"/);
  assert.match(pricesPage, /priceSnapshotBusinessSegment\(snapshot\)/);
  assert.match(pricesPage, /priceSnapshotBusinessSize\(snapshot\)/);
  assert.match(priceExportRoute, /priceSnapshotBusinessSegment\(snapshot\)/);
  assert.match(priceExportRoute, /priceSnapshotBusinessSize\(snapshot\)/);
  assert.doesNotMatch(pricesPage, /sku\?\.segment\s*\?\?\s*product\?\.segment/);
  assert.doesNotMatch(priceExportRoute, /skuMaster\?\.segment\s*\?\?\s*product\?\.segment/);
});

test("price snapshots query supports owner visibility while market price page shows all facts", () => {
  assert.match(dataFile, /export type PriceSnapshotOwnerFilter = "all" \| "makuku" \| "competitor"/);
  assert.match(dataFile, /export type PriceSnapshotFilters/);
  assert.match(dataFile, /filters: PriceSnapshotFilters = \{\}/);
  assert.match(dataFile, /const owner = filters\.owner \?\? "all"/);
  assert.match(dataFile, /filters\.limit \?\? 1000/);
  assert.doesNotMatch(dataFile, /\.limit\(100\)/);
  assert.match(dataFile, /\.order\("captured_at", \{ ascending: false \}\)/);
  assert.match(dataFile, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(dataFile, /\.order\("id", \{ ascending: true \}\)/);
  assert.match(dataFile, /owner === "makuku"[\s\S]*sku_master_id\.not\.is\.null,material_sku_code\.not\.is\.null[\s\S]*\.is\("competitor_product_id", null\)/);
  assert.match(dataFile, /owner === "competitor"[\s\S]*\.not\("competitor_product_id", "is", null\)/);

  assert.match(pricesPage, /getPriceSnapshotsPage\(\{/);
  assert.match(pricesPage, /page: requestedPage/);
  assert.match(pricesPage, /perPage/);
  assert.match(pricesPage, /name="brand"/);
  assert.doesNotMatch(pricesPage, /owner\?: "all" \| "makuku" \| "competitor"/);
  assert.doesNotMatch(pricesPage, /normalizeOwner\(params\.owner\)/);
  assert.doesNotMatch(pricesPage, /getPriceSnapshots\(\{ owner \}\)/);
  assert.doesNotMatch(pricesPage, /name="owner"/);
  assert.doesNotMatch(pricesPage, /value="makuku"/);
  assert.doesNotMatch(pricesPage, /owner !== "all"/);

  assert.match(priceExportRoute, /const owner = normalizeOwner\(searchParams\.get\("owner"\)\)/);
  assert.match(priceExportRoute, /applyOwnerFilter/);
  assert.match(priceExportRoute, /owner === "makuku"[\s\S]*snapshotOwnerType\(snapshot\) === "makuku"/);
  assert.match(priceExportRoute, /owner === "competitor"[\s\S]*snapshotOwnerType\(snapshot\) === "competitor"/);
});

test("real market price page removes ad hoc snapshot adjustment controls", () => {
  assert.doesNotMatch(priceSnapshotsTable, /璋冩暣鍏宠仈|Adjust/);
  assert.doesNotMatch(priceSnapshotsTable, /AdjustmentDialog/);
  assert.doesNotMatch(priceSnapshotsTable, /method: "PATCH"/);
  assert.doesNotMatch(priceSnapshotsTable, /owner_type/);
  assert.doesNotMatch(priceSnapshotsTable, /Pencil/);
});
