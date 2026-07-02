import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pieceCountHelper = readFileSync("src/lib/piece-count.ts", "utf8");
const storeVisitAi = readFileSync("src/lib/store-visit-ai.ts", "utf8");
const candidateService = readFileSync("src/lib/ai-price-candidates.ts", "utf8");
const storeVisitAnalysis = readFileSync("src/lib/store-visit-analysis.ts", "utf8");

test("piece count helper supports bonus pack and size-pack text formats", () => {
  assert.match(pieceCountHelper, /parsePieceCountText/);
  assert.match(pieceCountHelper, /\\d\{1,3\}\)\\s\*\\\+\\s\*/);
  assert.match(pieceCountHelper, /Number\(bonusMatch\[1\]\) \+ Number\(bonusMatch\[2\]\)/);
  assert.match(pieceCountHelper, /openBonusMatch/);
  assert.match(pieceCountHelper, /nb-s\|nb\|s\|m\|l\|xl\|xxl\|xxxl\|xxxxl/);
  assert.match(pieceCountHelper, /const valueText = typeof value === "string" \? value : null/);
  assert.match(pieceCountHelper, /\[valueText, \.\.\.textCandidates\]/);
});

test("store visit price image normalization recovers piece count from sku text", () => {
  assert.match(storeVisitAi, /normalizePieceCountFromCandidates\(row\.piece_count, sku\)/);
  assert.match(storeVisitAi, /calculatePricePerPiece\(netPrice, pieceCount\)/);
  assert.match(storeVisitAi, /28\+6 pcs/);
  assert.match(storeVisitAi, /piece_count is the total pack piece count/);
});

test("AI price candidates preserve source row index while deduplicating by image, entity, and price", () => {
  assert.match(candidateService, /sourceRowIndex/);
  assert.match(candidateService, /"image_entity_price"/);
  assert.match(candidateService, /item\.sourceImageId,\s*matchedEntityType,\s*matchedEntityId,\s*String\(netPrice\)/s);
  assert.doesNotMatch(candidateService, /const byKey = new Map/);
  assert.doesNotMatch(candidateService, /keySkuPricePieceKeys/);
  assert.doesNotMatch(candidateService, /if \(!item\.piece_count\) return false/);
});

test("store visit analysis sends source image row index to candidate generation", () => {
  assert.match(storeVisitAnalysis, /rowIndex/);
  assert.match(storeVisitAnalysis, /sourceRowIndex: rowIndex/);
});
