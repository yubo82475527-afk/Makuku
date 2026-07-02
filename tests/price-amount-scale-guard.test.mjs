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

test("candidate generation source integrates the amount-scale guard before per-piece math", () => {
  const candidateService = readFileSync("src/lib/ai-price-candidates.ts", "utf8");
  assert.match(candidateService, /reconcilePackagePriceMetrics/);
  assert.match(candidateService, /const reconciledPrices = reconcilePackagePriceMetrics\(/);
  assert.match(candidateService, /const netPrice = reconciledPrices\.netPriceIdr/);
  assert.match(candidateService, /const pricePerPiece = calculatePricePerPiece\(netPrice, pieceCount\)/);
});
