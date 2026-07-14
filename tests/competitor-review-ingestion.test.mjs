import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const candidateService = readFileSync("src/lib/ai-price-candidates.ts", "utf8");
const reviewService = readFileSync("src/lib/ai-price-review.ts", "utf8");
const bulkRunRoute = readFileSync("src/app/api/ai-price-candidates/bulk-review/[jobId]/run/route.ts", "utf8");
const idempotencyMigration = readFileSync("supabase/migrations/202606220001_offline_ai_price_snapshot_idempotency.sql", "utf8");
const qualityGateMigration = readFileSync("supabase/migrations/202607130001_price_quality_gate_phase1.sql", "utf8");

test("AI candidate generation assigns stable candidate keys for idempotent reanalysis", () => {
  assert.match(candidateService, /function candidateKey/);
  assert.match(candidateService, /candidate_key/);
  assert.match(candidateService, /activeCandidateKeys/);
  assert.match(candidateService, /existingActiveKeys/);
  assert.match(candidateService, /candidateKey\(\{[\s\S]*matchedEntityType/);
  assert.match(candidateService, /sourceImageId/);
  assert.match(candidateService, /sourceRowIndex/);
  assert.match(candidateService, /matchedEntityId/);
  assert.match(candidateService, /netPrice/);
  assert.match(candidateService, /String\(item\.sourceRowIndex \?\? ""\)/);
  assert.match(candidateService, /matchedEntityId \?\? ""/);
});

test("AI candidate generation keeps image row identity even when net price is not parseable", () => {
  assert.match(candidateService, /if \(item\.sourceImageId\) \{/);
  assert.doesNotMatch(candidateService, /if \(item\.sourceImageId && netPrice\) \{/);
});

test("AI candidate generation keeps H5 rows with structured price signals", () => {
  assert.match(candidateService, /function hasH5VisiblePriceSignal/);
  assert.match(candidateService, /if \(item\.sourceImageId\) return hasH5VisiblePriceSignal\(item\);/);
});

test("AI candidate generation deduplicates candidate keys before inserting", () => {
  assert.match(candidateService, /const seenInsertKeys = new Set<string>\(\)/);
  assert.match(candidateService, /if \(existingActiveKeys\.has\(row\.candidate_key\) \|\| seenInsertKeys\.has\(row\.candidate_key\)\) return false;/);
  assert.match(candidateService, /seenInsertKeys\.add\(row\.candidate_key\)/);
  assert.match(candidateService, /\.in\("status", \["pending", "approved"\]\)/);
});

test("AI price approval reuses existing offline AI snapshots for the same image product and net price", () => {
  assert.match(reviewService, /approve_ai_price_candidate_with_quality_gate/);
  assert.match(qualityGateMigration, /source_visit_id = v_candidate\.visit_id/);
  assert.match(qualityGateMigration, /source_image_id = v_candidate\.source_image_id/);
  assert.match(qualityGateMigration, /source_matched_entity_type = v_candidate\.matched_entity_type/);
  assert.match(qualityGateMigration, /source_matched_entity_id = v_source_matched_entity_id/);
  assert.match(qualityGateMigration, /snapshot\.net_price_idr = v_net_price/);
  assert.match(qualityGateMigration, /on conflict do nothing/);
  assert.match(qualityGateMigration, /price_snapshot_id = v_snapshot_id/);
});

test("offline AI price idempotency migration constrains candidates and snapshots by image product and net price", () => {
  assert.match(idempotencyMigration, /source_visit_id/);
  assert.match(idempotencyMigration, /source_image_id/);
  assert.match(idempotencyMigration, /source_matched_entity_type/);
  assert.match(idempotencyMigration, /source_matched_entity_id/);
  assert.match(idempotencyMigration, /idx_ai_price_candidates_visit_image_entity_price_active/);
  assert.match(idempotencyMigration, /idx_price_snapshots_offline_ai_source_unique/);
  assert.match(idempotencyMigration, /where source = 'offline_ai_confirmed'/);
});

test("store link repair migration backfills offline store ids for offline AI snapshots", () => {
  const repairMigration = readFileSync("supabase/migrations/202606260001_price_snapshot_store_link_repair.sql", "utf8");
  assert.match(repairMigration, /add column if not exists offline_store_id/);
  assert.match(repairMigration, /candidate_source\.store_id/);
  assert.match(repairMigration, /offline_store_id = coalesce\(ps\.offline_store_id, candidate_source\.store_id\)/);
  assert.match(repairMigration, /update public\.price_snapshots ps[\s\S]*set offline_store_id = visit\.store_id/);
});

test("AI candidate matching refuses to reuse competitor products from a different brand", () => {
  assert.match(candidateService, /function competitorBrandsMatch/);
  assert.match(candidateService, /const brandMatchedProducts = products\.filter\(\(item\) => competitorBrandsMatch\(candidate\.brand, item\.brands\?\.name\)\)/);
  assert.match(candidateService, /brandMatchedProducts\.flatMap/);
  assert.doesNotMatch(candidateService, /const candidateProducts = .*brandMatchedProducts/);
});

test("AI candidate competitor matching requires series size and piece count before ranking", () => {
  assert.match(candidateService, /export function pickBestCompetitorForCandidate/);
  assert.match(candidateService, /function competitorTargetAttributes/);
  assert.match(candidateService, /product_series/);
  assert.match(candidateService, /normalizedCompetitorSize/);
  assert.match(candidateService, /skuAttributesHardMatch\(candidateAttributes, target\)/);
  assert.match(candidateService, /rankHardMatchedSkuCandidate/);
  assert.match(candidateService, /active: item\.status !== "disabled"/);
  assert.doesNotMatch(candidateService, /competitorSizePieceExactMatches/);
  assert.doesNotMatch(candidateService, /competitorCandidateRank/);
  assert.match(candidateService, /pickBestCompetitor\(\{ brand: item\.brand, product: item\.product, pieceCount \}/);
});

test("AI candidate material matching requires series size and piece count before ranking", () => {
  assert.match(candidateService, /export function pickBestMaterialForCandidate/);
  assert.match(candidateService, /export function extractSkuMatchAttributes/);
  assert.match(candidateService, /export function skuAttributesHardMatch/);
  assert.match(candidateService, /export function pickUniqueHardMatchedCandidate/);
  assert.match(candidateService, /function materialTargetAttributes/);
  assert.match(candidateService, /extractCandidateSize/);
  assert.match(candidateService, /pack_count/);
  assert.match(candidateService, /sub_type/);
  assert.match(candidateService, /sub_brand/);
  assert.match(candidateService, /skuAttributesHardMatch\(candidateAttributes, target\)/);
  assert.doesNotMatch(candidateService, /sizePieceExactMatches/);
  assert.match(candidateService, /pickBestMaterial\(\{ brand: item\.brand, product: item\.product, parsedPrice, pieceCount \}/);
  assert.match(candidateService, /const isOwnBrandCandidate = isMakukuBrand\(item\.brand\)/);
  assert.match(candidateService, /!materialMatch && !isOwnBrandCandidate/);
});

test("price review approval validates matched competitor brand before reusing it", () => {
  assert.match(reviewService, /async function findReusableMatchedCompetitorProduct/);
  assert.match(reviewService, /candidateBrandMatchesProductBrand\(candidate, product\)/);
  assert.match(reviewService, /const reusableProduct = await findReusableMatchedCompetitorProduct/);
  assert.match(reviewService, /if \(reusableProduct\) return reusableProduct as CompetitorProduct;/);
});

test("bulk manual approval revalidates competitor mapping pages after creating competitor products", () => {
  assert.match(bulkRunRoute, /revalidatePath\("\/zh\/competitors"\)/);
  assert.match(bulkRunRoute, /revalidatePath\("\/en\/competitors"\)/);
});

test("AI candidate price range filter keeps single IDR package prices", () => {
  const line = candidateService.split(/\r?\n/).find((item) => item.includes("const priceRangePattern ="));
  assert.ok(line, "priceRangePattern should be defined");
  const literal = line.match(/=\s*(\/.+\/[a-z]*)\s*;/)?.[1];
  assert.ok(literal, "priceRangePattern should use a regex literal");
  const priceRangePattern = Function(`return ${literal}`)();

  assert.equal(priceRangePattern.test("52000"), false);
  assert.equal(priceRangePattern.test("Rp 52.000"), false);
  assert.equal(priceRangePattern.test("52000-53000"), true);
  assert.equal(priceRangePattern.test("52000 sampai 53000"), true);
});

test("AI candidate generation scopes inserts to image-backed rows without legacy three-price fallback", () => {
  assert.match(candidateService, /function isExtendedCandidateColumnError/);
  assert.match(candidateService, /list_price_idr/);
  assert.match(candidateService, /package_price_idr/);
  assert.match(candidateService, /net_price_idr/);
  assert.match(candidateService, /promo_type/);
  assert.match(candidateService, /const scopedItems = items\.filter\(\(item\) => item\.sourceImageId\)/);
  assert.match(candidateService, /if \(scopedItems\.length === 0\) return \[\]/);
  assert.match(candidateService, /return scopedItems\.map/);
  assert.match(candidateService, /const legacyRows = rows\.map/);
  assert.match(candidateService, /source_row_index: _sourceRowIndex/);
  assert.doesNotMatch(candidateService, /error\?\.message\.includes\("ai_price_candidates"\)\)\s*\{\s*return \[\]/);
});
