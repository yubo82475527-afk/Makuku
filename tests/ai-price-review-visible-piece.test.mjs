import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";

function loadAiPriceReview() {
  const transpiled = ts.transpileModule(readFileSync("src/lib/ai-price-review.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(transpiled, {
    module: testModule,
    exports: testModule.exports,
    require: (id) => {
      if (id === "@/lib/business") {
        return {
          normalizePriceSnapshot: ({ net_price_idr, promo_price_idr, piece_count }) => {
            const netPrice = Number.isFinite(Number(net_price_idr)) ? Number(net_price_idr) : Number(promo_price_idr);
            return {
              net_price_idr: netPrice,
              price_per_piece: piece_count > 0 ? Number((netPrice / piece_count).toFixed(2)) : 0,
            };
          },
        };
      }
      if (id === "@/lib/data") {
        return { getAiPriceReviewRule: async () => null };
      }
      if (id === "@/lib/sku-master-bridge") {
        return { ensureSkuMasterFromMaterial: async () => null };
      }
      throw new Error(`Unexpected require: ${id}`);
    },
  });
  return testModule.exports;
}

const aiPriceReview = loadAiPriceReview();

test("AI price review keeps visible per-piece evidence ahead of package-derived review price", () => {
  assert.equal(
    aiPriceReview.resolveCandidateReviewPricePerPiece({
      visible_price_per_piece_idr: 1821,
      price_per_piece: 1821,
    }, 1821.43),
    1821,
  );
});

test("AI price review falls back to package-derived price when candidate has no per-piece evidence", () => {
  assert.equal(
    aiPriceReview.resolveCandidateReviewPricePerPiece({
      visible_price_per_piece_idr: null,
      price_per_piece: null,
    }, 1821.43),
    1821.43,
  );
});
