import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const candidateService = readFileSync("src/lib/ai-price-candidates.ts", "utf8");
const reviewService = readFileSync("src/lib/ai-price-review.ts", "utf8");
const bulkRunRoute = readFileSync("src/app/api/ai-price-candidates/bulk-review/[jobId]/run/route.ts", "utf8");
const idempotencyMigration = readFileSync("supabase/migrations/202606220001_offline_ai_price_snapshot_idempotency.sql", "utf8");

test("AI candidate generation assigns stable candidate keys for idempotent reanalysis", () => {
  assert.match(candidateService, /function candidateKey/);
  assert.match(candidateService, /candidate_key/);
  assert.match(candidateService, /approvedCandidateKeys/);
  assert.match(candidateService, /existingApprovedKeys/);
  assert.match(candidateService, /candidateKey\(\{[\s\S]*matchedEntityType/);
  assert.match(candidateService, /sourceImageId/);
  assert.match(candidateService, /matchedEntityId/);
  assert.match(candidateService, /netPrice/);
  assert.doesNotMatch(candidateService, /return \["image_row", item\.sourceImageId, item\.sourceRowIndex\]\.join\("\|"\)/);
});

test("AI price approval reuses existing offline AI snapshots for the same image product and net price", () => {
  assert.match(reviewService, /findExistingOfflineAiSnapshot/);
  assert.match(reviewService, /source_visit_id/);
  assert.match(reviewService, /source_image_id/);
  assert.match(reviewService, /source_matched_entity_type/);
  assert.match(reviewService, /source_matched_entity_id/);
  assert.match(reviewService, /\.eq\("net_price_idr", netPrice\)/);
  assert.match(reviewService, /if \(existingSnapshot\)/);
  assert.match(reviewService, /price_snapshot_id: existingSnapshot\.id/);
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

test("AI candidate matching refuses to reuse competitor products from a different brand", () => {
  assert.match(candidateService, /function competitorBrandsMatch/);
  assert.match(candidateService, /const brandMatchedProducts = products\.filter\(\(item\) => competitorBrandsMatch\(candidate\.brand, item\.brands\?\.name\)\)/);
  assert.match(candidateService, /const brandScore = tokenScore\(candidate\.brand, item\.brands\?\.name \?\? ""\);/);
});

test("AI candidate competitor matching prioritizes exact size and piece count without price", () => {
  assert.match(candidateService, /export function pickBestCompetitorForCandidate/);
  assert.match(candidateService, /competitorSizePieceExactMatches/);
  assert.match(candidateService, /normalizedCompetitorSize/);
  assert.match(candidateService, /competitorCandidateRank/);
  assert.match(candidateService, /pieceScore \* 0\.4 \+ sizeScore \* 0\.3 \+ brandScore \* 0\.15 \+ productScore \* 0\.15/);
  assert.doesNotMatch(candidateService, /competitorCandidateRank[\s\S]*priceScore/);
  assert.match(candidateService, /pickBestCompetitor\(\{ brand: item\.brand, product: item\.product, pieceCount \}/);
});

test("AI candidate material matching prioritizes exact size and piece count", () => {
  assert.match(candidateService, /export function pickBestMaterialForCandidate/);
  assert.match(candidateService, /extractCandidateSize/);
  assert.match(candidateService, /pack_count/);
  assert.match(candidateService, /sub_type/);
  assert.match(candidateService, /sizePieceExactMatches/);
  assert.match(candidateService, /pieceScore/);
  assert.match(candidateService, /sizeScore/);
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

test("AI candidate generation falls back when three-price columns are not migrated", () => {
  assert.match(candidateService, /function isExtendedCandidateColumnError/);
  assert.match(candidateService, /list_price_idr/);
  assert.match(candidateService, /package_price_idr/);
  assert.match(candidateService, /net_price_idr/);
  assert.match(candidateService, /promo_type/);
  assert.match(candidateService, /const legacyRows = rows\.map/);
  assert.match(candidateService, /legacyRow/);
  assert.doesNotMatch(candidateService, /error\?\.message\.includes\("ai_price_candidates"\)\)\s*\{\s*return \[\]/);
});
