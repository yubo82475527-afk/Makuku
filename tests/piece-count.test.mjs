import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveTrustedPieceCount } from "../src/lib/piece-count.ts";

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

test("store visit price image normalization carries a trusted piece-count source into candidate generation", () => {
  assert.match(storeVisitAi, /resolveTrustedPieceCount/);
  assert.match(storeVisitAi, /piece_count_source_label/);
  assert.match(candidateService, /resolveTrustedPieceCount/);
  assert.match(candidateService, /piece_count_source_label/);
});

test("AI price candidates preserve source row index while deduplicating by image, entity, and price", () => {
  assert.match(candidateService, /sourceRowIndex/);
  assert.match(candidateService, /source_row_index/);
  assert.match(candidateService, /"image_entity_price"/);
  assert.match(candidateService, /String\(item\.sourceRowIndex \?\? ""\)/);
  assert.match(candidateService, /matchedEntityId \?\? ""/);
  assert.doesNotMatch(candidateService, /const byKey = new Map/);
  assert.doesNotMatch(candidateService, /keySkuPricePieceKeys/);
  assert.doesNotMatch(candidateService, /if \(!item\.piece_count\) return false/);
});

test("store visit analysis sends source image row index to candidate generation", () => {
  assert.match(storeVisitAnalysis, /rowIndex/);
  assert.match(storeVisitAnalysis, /sourceRowIndex: rowIndex/);
});

test("piece count prefers an effective AI value over title-derived pack text", () => {
  assert.deepEqual(resolveTrustedPieceCount({
    productTitle: "CONFIDENCE CLASSIC NIGHT XL-6 (12)",
    extractedValue: 6,
    extractedText: "6",
    sourceLabel: "Q.Toko",
  }), { pieceCount: 6, source: "AI_EXTRACTED" });
  assert.deepEqual(resolveTrustedPieceCount({
    productTitle: "CONFIDENCE CLASSIC DAY L7 (12)",
    extractedValue: 258,
    extractedText: "258",
    sourceLabel: "Q.Toko",
  }), { pieceCount: 258, source: "AI_EXTRACTED" });
  assert.deepEqual(resolveTrustedPieceCount({
    productTitle: "MAKUKU PANTS M30+6",
    extractedValue: null,
    extractedText: null,
    sourceLabel: null,
  }), { pieceCount: 36, source: "TITLE_SIZE_PACK" });
  assert.deepEqual(resolveTrustedPieceCount({
    productTitle: "Merries Pants Good Skin XL 26",
    extractedValue: null,
    extractedText: null,
    sourceLabel: null,
  }), { pieceCount: 26, source: "TITLE_SIZE_PACK" });
  assert.deepEqual(resolveTrustedPieceCount({
    productTitle: "Merries Pants Good Skin XXL 18",
    extractedValue: null,
    extractedText: null,
    sourceLabel: null,
  }), { pieceCount: 18, source: "TITLE_SIZE_PACK" });
  assert.deepEqual(resolveTrustedPieceCount({
    productTitle: "Confidence Pants Daily Fresh L8S",
    extractedValue: null,
    extractedText: null,
    sourceLabel: null,
  }), { pieceCount: 8, source: "TITLE_SIZE_PACK" });
  assert.deepEqual(resolveTrustedPieceCount({
    productTitle: "Confidence Pants Daily Fresh M9S",
    extractedValue: null,
    extractedText: null,
    sourceLabel: null,
  }), { pieceCount: 9, source: "TITLE_SIZE_PACK" });
});

test("piece count keeps legacy AI evidence when its source label is missing", () => {
  assert.deepEqual(resolveTrustedPieceCount({
    productTitle: "MAKUKU Dry Care L",
    extractedValue: 54,
    extractedText: "44+10",
    sourceLabel: null,
  }), { pieceCount: 54, source: "AI_EXTRACTED" });
});

test("piece count accepts only explicitly labeled Pcs evidence when the title has no size-pack token", () => {
  assert.deepEqual(resolveTrustedPieceCount({
    productTitle: "GENERIC PRICE TAG XL",
    extractedValue: 24,
    extractedText: "24",
    sourceLabel: "Pcs",
  }), { pieceCount: 24, source: "LABELED_PCS" });
  assert.deepEqual(resolveTrustedPieceCount({
    productTitle: "GENERIC PRICE TAG XL",
    extractedValue: 258,
    extractedText: "258",
    sourceLabel: "Q.Toko",
  }), { pieceCount: 258, source: "AI_EXTRACTED" });
});

test("piece count does not treat spaced size-and-weight text as a title pack count", () => {
  assert.deepEqual(resolveTrustedPieceCount({
    productTitle: "MERRIES GOOD SKIN JUMBO XXL 15-25 KG",
    extractedValue: 28,
    extractedText: "28",
    sourceLabel: "Pcs",
  }), { pieceCount: 28, source: "LABELED_PCS" });
});
