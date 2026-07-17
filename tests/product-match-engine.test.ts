import assert from "node:assert/strict";
import test from "node:test";
import {
  compileProductMatchIndex,
  matchProduct,
  type MatchRuleSet,
  type NormalizedMatchInput,
  type ProductMatchEvidence,
  type ProductMatchMaster,
} from "../src/lib/product-match-engine.ts";

const rules: MatchRuleSet = {
  version: "test-rules",
  normalizeProduct(product) {
    return { ...product, signature: product.signature! };
  },
  normalizeEvidence(evidence) {
    return evidence as NormalizedMatchInput;
  },
  coreKey(signature) {
    return [signature.brand, signature.series, signature.size, signature.pieceCount].join("|");
  },
  isCompatible(evidence, product) {
    return !evidence.signature.shape || !product.signature.shape || evidence.signature.shape === product.signature.shape;
  },
  isFullSignature(evidence, product) {
    return JSON.stringify(evidence.signature) === JSON.stringify(product.signature);
  },
};

function master(overrides: Partial<ProductMatchMaster> = {}): ProductMatchMaster {
  return {
    id: "p1",
    entityType: "competitor_product",
    code: null,
    active: true,
    raw: {},
    signature: {
      brand: "SWEETY",
      series: "DRY CARE",
      packageLevel: "BIG PACK",
      shape: "PANTS",
      size: "M",
      pieceCount: 14,
      version: null,
    },
    ...overrides,
  };
}

function evidence(overrides: Partial<ProductMatchEvidence> = {}): ProductMatchEvidence {
  return {
    code: null,
    entityType: "competitor_product",
    signature: master().signature,
    sources: ["sku"],
    raw: {},
    ...overrides,
  } as ProductMatchEvidence;
}

test("exact code wins with an explicit method", () => {
  const product = master({ code: "SW00001" });
  const index = compileProductMatchIndex([product], rules);
  const result = matchProduct(evidence({ code: "SW00001" }), index, rules);
  assert.equal(result.method, "EXACT_CODE");
  assert.equal(result.product?.id, product.id);
});

test("a complete unique signature returns FULL_SIGNATURE", () => {
  const index = compileProductMatchIndex([master()], rules);
  const result = matchProduct(evidence(), index, rules);
  assert.equal(result.method, "FULL_SIGNATURE");
});

test("one compatible candidate with optional evidence missing returns UNIQUE_SIGNATURE", () => {
  const index = compileProductMatchIndex([master()], rules);
  const signature = { ...master().signature!, packageLevel: null };
  const result = matchProduct(evidence({ signature }), index, rules);
  assert.equal(result.method, "UNIQUE_SIGNATURE");
});

test("duplicate compatible candidates are classified as duplicate master data", () => {
  const index = compileProductMatchIndex([master(), master({ id: "p2" })], rules);
  const result = matchProduct(evidence(), index, rules);
  assert.equal(result.method, "MASTER_DATA_DUPLICATE");
  assert.equal(result.reason, "AMBIGUOUS_CANDIDATES");
});

test("inactive products never match", () => {
  const index = compileProductMatchIndex([master({ active: false })], rules);
  const result = matchProduct(evidence(), index, rules);
  assert.equal(result.method, "UNMATCHED");
  assert.equal(result.reason, "NO_ACTIVE_CANDIDATE");
});
