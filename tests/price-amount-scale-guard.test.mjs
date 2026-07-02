import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";

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
  const sandbox = {
    module: testModule,
    exports: testModule.exports,
    console,
    require: (id) => {
      if (id === "@/lib/ai-client") {
        return {
          createJsonChatCompletion: async () => {
            throw new Error("AI client should not be used in amount-scale guard tests.");
          },
          imageUrlPart: () => ({}),
          textPart: () => ({}),
        };
      }
      if (id === "@/lib/price-utils") return priceUtils;
      if (id === "@/lib/piece-count") {
        return {
          normalizePieceCountFromEvidence: (value, pieceCountText, sku) => {
            const text = String(pieceCountText ?? "");
            const bonus = text.match(/\b(\d{1,3})\s*\+\s*(\d{1,3})\b/);
            if (bonus) return Number(bonus[1]) + Number(bonus[2]);
            const fromText = text.match(/\b(\d{1,3})\b/);
            if (fromText) return Number(fromText[1]);
            const numeric = Number(value);
            if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric);
            const match = String(sku ?? "").match(/\b(\d{1,3})\s*(?:pcs?|pieces?)\b/i);
            return match ? Number(match[1]) : null;
          },
          normalizePieceCountFromCandidates: (value, sku) => {
            const numeric = Number(value);
            if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric);
            const match = String(sku ?? "").match(/\b(\d{1,3})\s*(?:pcs?|pieces?)\b/i);
            return match ? Number(match[1]) : null;
          },
        };
      }
      if (id === "@/lib/supabase") {
        return {
          createSupabaseServiceClient: () => {
            throw new Error("Supabase should not be used in amount-scale guard tests.");
          },
          hasSupabaseServiceConfig: () => false,
        };
      }
      throw new Error(`Unexpected require: ${id}`);
    },
  };
  vm.runInNewContext(transpiled, sandbox);
  return testModule.exports;
}

const priceUtils = loadPriceUtils();
const storeVisitAi = loadStoreVisitAi(priceUtils);
const rowEvidenceMigration = readFileSync("supabase/migrations/202607020002_ai_price_candidate_row_evidence.sql", "utf8");

test("price amount-scale guard repairs package prices that were divided by piece count", () => {
  const result = priceUtils.reconcilePackagePriceMetrics({
    listPriceIdr: 56000,
    packagePriceIdr: 56000,
    netPriceIdr: 1400,
    pieceCount: 40,
  });

  assert.equal(result.netPriceIdr, 56000);
  assert.equal(result.packagePriceIdr, 56000);
  assert.equal(result.listPriceIdr, 56000);
  assert.equal(result.correctedFromPerPiece, true);
  assert.match(result.warningMessage ?? "", /piece count/i);
});

test("price amount-scale guard leaves legitimate discount prices unchanged", () => {
  const result = priceUtils.reconcilePackagePriceMetrics({
    listPriceIdr: 81500,
    packagePriceIdr: 81500,
    netPriceIdr: 25000,
    pieceCount: 48,
  });

  assert.equal(result.netPriceIdr, 25000);
  assert.equal(result.correctedFromPerPiece, false);
  assert.equal(result.warningMessage, null);
});

test("price amount-scale guard reconstructs discounted package price from per-piece net values", () => {
  const result = priceUtils.reconcilePackagePriceMetrics({
    listPriceIdr: 197500,
    packagePriceIdr: 197500,
    netPriceIdr: 4580,
    pieceCount: 36,
  });

  assert.equal(result.listPriceIdr, 197500);
  assert.equal(result.packagePriceIdr, 164900);
  assert.equal(result.netPriceIdr, 164900);
  assert.equal(result.correctedFromPerPiece, true);
  assert.match(result.warningMessage ?? "", /discounted whole-package/i);
});

test("store visit price image normalization applies the package-amount guard and appends a parse risk warning", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        brand: "Merries",
        sku: "NB-S 3-8 kg 40 pcs",
        list_price_idr: 56000,
        package_price_idr: 56000,
        net_price_idr: 1400,
        piece_count: 40,
      },
    ],
    warnings: [],
  }, "competitor_shelf");

  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0].net_price_idr, 56000);
  assert.equal(normalized.rows[0].price_per_piece_idr, 1400);
  assert.match(normalized.warnings.at(-1)?.message ?? "", /whole-package/i);
});

test("store visit price image normalization reconstructs discounted package totals when list price stays at regular price", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        brand: "Makuku",
        sku: "Pro Care Pants M 6-11KG 36 pcs",
        list_price_idr: 197500,
        package_price_idr: 197500,
        net_price_idr: 4580,
        piece_count: 36,
      },
    ],
    warnings: [],
  }, "makuku_shelf");

  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0].list_price_idr, 197500);
  assert.equal(normalized.rows[0].package_price_idr, 164900);
  assert.equal(normalized.rows[0].net_price_idr, 164900);
  assert.equal(normalized.rows[0].price_per_piece_idr, 4580.56);
  assert.match(normalized.warnings.at(-1)?.message ?? "", /discounted whole-package/i);
});

test("store visit price image normalization prioritizes clear visible per-piece evidence", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        brand: "Merries",
        sku: "Good Skin Jumbo XXL 15-25 kg",
        list_price_idr: 78000,
        package_price_idr: 78000,
        net_price_idr: 62288,
        piece_count: 28,
        piece_count_text: "28",
        list_price_text: "78.000",
        package_price_text: "78.000",
        net_price_text: "75.000",
        visible_price_per_piece_text: "2.678",
      },
    ],
    warnings: [],
  }, "competitor_shelf");

  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0].piece_count, 28);
  assert.equal(normalized.rows[0].visible_price_per_piece_idr, 2678);
  assert.equal(normalized.rows[0].net_price_idr, 74984);
  assert.equal(normalized.rows[0].price_per_piece_idr, 2678);
  assert.equal(normalized.rows[0].price_basis, "VISIBLE_PRICE_PER_PIECE");
  assert.match(normalized.warnings.at(-1)?.message ?? "", /per-piece/i);
});

test("store visit price image normalization prefers visible bonus piece count text over base quantity", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        brand: "Makuku",
        sku: "Comfort Fit Super Jumbo M 6-11 KG",
        list_price_idr: 112900,
        package_price_idr: 112900,
        net_price_idr: 112900,
        piece_count: 60,
        piece_count_text: "60+6",
      },
    ],
    warnings: [],
  }, "makuku_shelf");

  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0].piece_count, 66);
  assert.equal(normalized.rows[0].piece_count_text, "60+6");
  assert.equal(normalized.rows[0].price_per_piece_idr, 1710.61);
  assert.match(normalized.warnings.at(-1)?.message ?? "", /piece count/i);
});

test("candidate generation source integrates the amount-scale guard before per-piece math", () => {
  const candidateService = readFileSync("src/lib/ai-price-candidates.ts", "utf8");
  assert.match(candidateService, /reconcilePackagePriceMetrics/);
  assert.match(candidateService, /const reconciledPrices = reconcilePackagePriceMetrics\(/);
  assert.match(candidateService, /const netPrice = reconciledPrices\.netPriceIdr/);
  assert.match(candidateService, /reconciledPrices\.priceBasis === "VISIBLE_PRICE_PER_PIECE"/);
  assert.match(candidateService, /calculatePricePerPiece\(netPrice, pieceCount\)/);
  assert.match(candidateService, /raw_piece_count_text/);
  assert.match(candidateService, /raw_price_per_piece_text/);
  assert.match(candidateService, /visible_price_per_piece_idr/);
  assert.match(candidateService, /price_basis/);
});

test("candidate row evidence migration adds raw evidence columns", () => {
  assert.match(rowEvidenceMigration, /raw_piece_count_text text/i);
  assert.match(rowEvidenceMigration, /raw_package_price_text text/i);
  assert.match(rowEvidenceMigration, /raw_net_price_text text/i);
  assert.match(rowEvidenceMigration, /raw_price_per_piece_text text/i);
  assert.match(rowEvidenceMigration, /visible_price_per_piece_idr numeric/i);
  assert.match(rowEvidenceMigration, /price_basis text/i);
});
