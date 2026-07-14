import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadPriceUtils() {
  const source = readFileSync("src/lib/price-utils.ts", "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(transpiled, { module: testModule, exports: testModule.exports });
  return testModule.exports;
}

test("price evidence assigns one specific operator reason instead of a combined fallback", () => {
  const priceUtils = loadPriceUtils();
  const derive = priceUtils.derivePriceEvidenceReasonCode;

  assert.equal(derive({
    status: "LOW_CONFIDENCE",
    detail: { row_binding_confidence: 0.6, section_binding_confidence: 0.9, threshold: 0.75 },
  }), "PRODUCT_PRICE_BINDING_UNCLEAR");
  assert.equal(derive({
    status: "LOW_CONFIDENCE",
    detail: { row_binding_confidence: 0.9, section_binding_confidence: 0.9, final_actual_price_confidence: 0.6, threshold: 0.75 },
  }), "PRICE_TAG_UNCLEAR");
  assert.equal(derive({
    status: "REVIEW_REQUIRED",
    detail: { visible_piece_count_clear: false, threshold: 0.75 },
  }), "PIECE_COUNT_UNCLEAR");
  assert.equal(derive({
    status: "DERIVED",
    detail: { package_price_status: "VISIBLE", per_piece_price_status: "DERIVED", threshold: 0.75 },
  }), "PRICE_DERIVED");
  assert.equal(derive({ status: "CONFLICT", detail: {} }), "PRICE_MATH_CONFLICT");
  assert.equal(derive({ status: "REVIEW_REQUIRED", detail: null }), "LEGACY_EVIDENCE_UNAVAILABLE");
});

test("new evidence reason is persisted and mapped by the server-owned operator view model", () => {
  const candidates = readFileSync("src/lib/ai-price-candidates.ts", "utf8");
  const operator = readFileSync("src/lib/operator-price-review.ts", "utf8");
  const types = readFileSync("src/lib/types.ts", "utf8");
  const migration = readFileSync("supabase/migrations/202607140001_price_evidence_reason_codes.sql", "utf8");

  assert.match(candidates, /price_evidence_reason_code/);
  assert.match(operator, /price_evidence_reason_code/);
  assert.match(operator, /PRODUCT_PRICE_BINDING_UNCLEAR/);
  assert.match(operator, /PRICE_TAG_UNCLEAR/);
  assert.match(operator, /LEGACY_EVIDENCE_UNAVAILABLE/);
  assert.match(types, /PriceEvidenceReasonCode/);
  assert.match(migration, /price_evidence_reason_code/);
  assert.match(migration, /product_price_binding_unclear/i);
});
