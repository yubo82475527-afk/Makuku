import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {
  buildSingleVariantProductTitle,
  extractSizePackVariantsFromTitle,
  normalizePieceCountFromCandidates,
  normalizePieceCountFromEvidence,
  resolveTrustedPieceCount,
} from "../src/lib/piece-count.ts";

const pieceCountHelper = readFileSync("src/lib/piece-count.ts", "utf8");
const storeVisitAiSource = readFileSync("src/lib/store-visit-ai.ts", "utf8");
const candidateService = readFileSync("src/lib/ai-price-candidates.ts", "utf8");
const storeVisitAnalysis = readFileSync("src/lib/store-visit-analysis.ts", "utf8");

function transpileModule(path) {
  return ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
}

function loadPriceUtils() {
  const transpiled = transpileModule("src/lib/price-utils.ts");
  const testModule = { exports: {} };
  vm.runInNewContext(transpiled, {
    module: testModule,
    exports: testModule.exports,
  });
  return testModule.exports;
}

function loadStoreVisitAi(priceUtils) {
  const transpiled = transpileModule("src/lib/store-visit-ai.ts");
  const testModule = { exports: {} };
  vm.runInNewContext(transpiled, {
    module: testModule,
    exports: testModule.exports,
    console,
    require: (id) => {
      if (id === "@/lib/ai-client") {
        return {
          createJsonChatCompletion: async () => {
            throw new Error("AI client should not be used in piece-count normalize tests.");
          },
          imageUrlPart: () => ({}),
          textPart: () => ({}),
        };
      }
      if (id === "@/lib/price-utils") return priceUtils;
      if (id === "@/lib/piece-count") {
        return {
          normalizePieceCountFromEvidence,
          normalizePieceCountFromCandidates,
          resolveTrustedPieceCount,
          extractSizePackVariantsFromTitle,
          buildSingleVariantProductTitle,
        };
      }
      if (id === "@/lib/supabase") {
        return {
          createSupabaseServiceClient: () => {
            throw new Error("Supabase should not be used in piece-count normalize tests.");
          },
          hasSupabaseServiceConfig: () => false,
        };
      }
      throw new Error(`Unexpected require: ${id}`);
    },
  });
  return testModule.exports;
}

const storeVisitAi = loadStoreVisitAi(loadPriceUtils());

test("piece count helper supports bonus pack and size-pack text formats", () => {
  assert.match(pieceCountHelper, /parsePieceCountText/);
  assert.match(pieceCountHelper, /\\d\{1,3\}\)\\s\*\\\+\\s\*/);
  assert.match(pieceCountHelper, /Number\(bonusMatch\[1\]\) \+ Number\(bonusMatch\[2\]\)/);
  assert.match(pieceCountHelper, /openBonusMatch/);
  assert.match(pieceCountHelper, /nb-s\|nb\|s\|m\|l\|xl\|xxl\|xxxl\|xxxxl/i);
  assert.match(pieceCountHelper, /extractSizePackVariantsFromTitle/);
  assert.match(pieceCountHelper, /const valueText = typeof value === "string" \? value : null/);
  assert.match(pieceCountHelper, /\[valueText, \.\.\.textCandidates\]/);
});

test("store visit price image normalization carries a trusted piece-count source into candidate generation", () => {
  assert.match(storeVisitAiSource, /resolveTrustedPieceCount/);
  assert.match(storeVisitAiSource, /piece_count_source_label/);
  assert.match(storeVisitAiSource, /expandMultiSizePackRawRows/);
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

test("extractSizePackVariantsFromTitle finds every SIZE+pack pair and ignores bare sizes", () => {
  assert.deepEqual(
    extractSizePackVariantsFromTitle("MAKUKU Dry Care Pants XL 24+4 / XXL 22+4"),
    [
      { size: "XL", pieceCount: 28, pieceCountText: "24+4", label: "XL 24+4" },
      { size: "XXL", pieceCount: 26, pieceCountText: "22+4", label: "XXL 22+4" },
    ],
  );
  assert.deepEqual(
    extractSizePackVariantsFromTitle("MAKUKU Dry Care Pants XL / XXL"),
    [],
  );
  assert.deepEqual(
    extractSizePackVariantsFromTitle("Merries Pants Good Skin XL 26"),
    [{ size: "XL", pieceCount: 26, pieceCountText: "26", label: "XL 26" }],
  );
  assert.deepEqual(
    extractSizePackVariantsFromTitle("MAKUKU PANTS M30+6"),
    [{ size: "M", pieceCount: 36, pieceCountText: "30+6", label: "M 30+6" }],
  );
  assert.equal(
    buildSingleVariantProductTitle("MAKUKU Dry Care Pants XL 24+4 / XXL 22+4", {
      size: "XL",
      pieceCount: 28,
      pieceCountText: "24+4",
      label: "XL 24+4",
    }),
    "MAKUKU Dry Care Pants XL 24+4",
  );
});

test("normalizeStoreVisitPriceImageAnalysis splits multi size-pack titles into one row per variant", () => {
  const result = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "ok" },
    rows: [{
      source_type: "PRICE_TAG",
      group_id: "tag-1",
      brand: "MAKUKU",
      product_family_text: "MAKUKU Dry Care Pants XL 24+4 / XXL 22+4",
      sku: "MAKUKU Dry Care Pants XL 24+4 / XXL 22+4",
      piece_count: 70,
      piece_count_text: "70",
      piece_count_source_label: "Pcs",
      normal_package_text: "58.990",
      normal_piece_text: "843",
    }],
  }, "price");

  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0]?.sku, "MAKUKU Dry Care Pants XL 24+4");
  assert.equal(result.rows[0]?.piece_count, 28);
  assert.equal(result.rows[0]?.piece_count_text, "24+4");
  assert.equal(result.rows[0]?.row_anchor, "XL|28");
  assert.equal(result.rows[0]?.net_price_idr, 58990);
  assert.equal(result.rows[1]?.sku, "MAKUKU Dry Care Pants XXL 22+4");
  assert.equal(result.rows[1]?.piece_count, 26);
  assert.equal(result.rows[1]?.piece_count_text, "22+4");
  assert.equal(result.rows[1]?.row_anchor, "XXL|26");
  assert.equal(result.rows[1]?.net_price_idr, 58990);
});

test("normalizeStoreVisitPriceImageAnalysis dedupes when AI already split but titles stay combined", () => {
  const combined = "MAKUKU Dry Care Pants XL 24+4 / XXL 22+4";
  const result = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "ok" },
    rows: [
      {
        source_type: "PRICE_TAG",
        group_id: "tag-a",
        brand: "MAKUKU",
        product_family_text: combined,
        sku: combined,
        piece_count: 70,
        piece_count_text: "70",
        normal_package_text: "58.990",
      },
      {
        source_type: "PRICE_TAG",
        group_id: "tag-b",
        brand: "MAKUKU",
        product_family_text: combined,
        sku: combined,
        piece_count: 70,
        piece_count_text: "70",
        normal_package_text: "58.990",
      },
    ],
  }, "price");

  assert.equal(result.rows.length, 2);
  const anchors = new Set(result.rows.map((row) => row.row_anchor));
  assert.equal(anchors.has("XL|28"), true);
  assert.equal(anchors.has("XXL|26"), true);
  assert.equal(result.rows.every((row) => row.net_price_idr === 58990), true);
});

test("normalizeStoreVisitPriceImageAnalysis keeps a single size-pack title as one row", () => {
  const result = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "ok" },
    rows: [{
      source_type: "PRICE_TAG",
      brand: "MAKUKU",
      sku: "MAKUKU Dry Care Pants XL 24+4",
      piece_count: 28,
      piece_count_text: "24+4",
      normal_package_text: "58.990",
    }],
  }, "price");

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.sku, "MAKUKU Dry Care Pants XL 24+4");
  assert.equal(result.rows[0]?.piece_count, 28);
});
