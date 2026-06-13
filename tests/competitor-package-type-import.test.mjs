import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const migration = readFileSync("supabase/migrations/202606120002_competitor_package_type_import.sql", "utf8");
const typesFile = readFileSync("src/lib/types.ts", "utf8");
const competitorMappingTable = readFileSync("src/components/competitor-mapping-table.tsx", "utf8");
const competitorRoute = readFileSync("src/app/api/competitors/route.ts", "utf8");
const aiPriceReview = readFileSync("src/lib/ai-price-review.ts", "utf8");
const offlineUploadConfirm = readFileSync("src/app/api/offline-uploads/[id]/confirm/route.ts", "utf8");
const offlineVisitImageConfirm = readFileSync("src/app/api/offline-visit-images/[id]/confirm/route.ts", "utf8");

test("competitor products have a separate package type field", () => {
  assert.match(migration, /add column if not exists package_type text not null default 'unknown'/);
  assert.match(typesFile, /package_type: string/);
  assert.match(competitorMappingTable, /packageType: isZh \? "包装类型" : "Package Type"/);
  assert.match(competitorMappingTable, /product\.package_type \?\? "unknown"/);
  assert.match(competitorMappingTable, /ProductDraft/);
  assert.match(competitorMappingTable, /saveProductFields/);
  assert.match(competitorMappingTable, /intent: "update_fields"/);
  assert.match(competitorRoute, /body\.intent === "update_package_type"/);
  assert.match(competitorRoute, /package_type: cleanPackageType/);
  assert.match(competitorMappingTable, /\{dict\.common\.brand\}/);
  assert.match(competitorMappingTable, /\{copy\.competitorGrade\}/);
});

test("competitor spec import keeps exact brand names and package tiers", () => {
  assert.match(migration, /'SWEETY BRONZE'/);
  assert.match(migration, /'SWEETY SILVER'/);
  assert.match(migration, /'BIG PACK'/);
  assert.match(migration, /'JUMBO'/);
  assert.match(migration, /'SUPER JUMBO'/);
  assert.doesNotMatch(migration, /'SWEETY', 'BRONZE'/);
});

test("competitor spec import inserts the 62 deduplicated specs", () => {
  const insertSourceStart = migration.lastIndexOf("with source_products");
  const insertStart = migration.indexOf("insert into public.competitor_products", insertSourceStart);
  const insertBlock = migration.slice(insertSourceStart, insertStart);
  const sourceRows = insertBlock.match(/^    \('[^']+'/gm) ?? [];
  assert.equal(sourceRows.length, 62);
  assert.match(migration, /'CONFIDENCE DAILY FRESH', 'BIG PACK', 'DAILY FRESH XL6', 'XL', null, 'unknown'/);
  assert.match(migration, /product\.piece_count is not distinct from source_products\.piece_count/);
});

test("automated competitor product creation defaults package type to unknown", () => {
  assert.match(competitorRoute, /package_type: String\(body\.package_type \?\? "unknown"\)/);
  assert.match(aiPriceReview, /package_type: "unknown"/);
  assert.match(offlineUploadConfirm, /package_type: "unknown"/);
  assert.match(offlineVisitImageConfirm, /package_type: "unknown"/);
});

test("photo review creates new competitor products with inferred size from candidate text", () => {
  assert.match(aiPriceReview, /function inferCompetitorSize/);
  assert.match(aiPriceReview, /candidate\.raw_product/);
  assert.match(aiPriceReview, /size: inferCompetitorSize\(productName\)/);
  assert.match(aiPriceReview, /nb-s\|nb\|s\|m\|l\|xl\|xxl\|xxxl\|xxxxl/i);
});
