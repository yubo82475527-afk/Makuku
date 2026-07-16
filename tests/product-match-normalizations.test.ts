import assert from "node:assert/strict";
import test from "node:test";
import {
  compileProductMatchNormalizations,
  type ProductMatchNormalizationRule,
} from "../src/lib/product-match-normalizations.ts";

const rules: ProductMatchNormalizationRule[] = [
  {
    id: "brand-swety",
    field: "brand",
    brand_scope: null,
    source_value: "SWETY",
    canonical_value: "SWEETY",
    active: true,
  },
  {
    id: "series-slim-care",
    field: "series",
    brand_scope: null,
    source_value: "SLIMCARE",
    canonical_value: "SLIM CARE",
    active: true,
  },
  {
    id: "series-gold",
    field: "series",
    brand_scope: "SWEETY",
    source_value: "GOLD SERIES",
    canonical_value: "GOLD",
    active: true,
  },
  {
    id: "size-nbs-global",
    field: "size",
    brand_scope: null,
    source_value: "NBS",
    canonical_value: "NB-S",
    active: true,
  },
  {
    id: "size-nbs-makuku",
    field: "size",
    brand_scope: "MAKUKU",
    source_value: "NBS",
    canonical_value: "NB/NB-S",
    active: true,
  },
  {
    id: "pieces-bonus",
    field: "piece_count",
    brand_scope: null,
    source_value: "48+4",
    canonical_value: "52",
    active: true,
  },
];

const catalog = {
  brand: ["MAKUKU", "SWEETY"],
  series: ["SLIM", "SLIM CARE", "GOLD"],
  size: ["NB-S", "NB/NB-S", "M"],
  piece_count: [52],
};

test("normalization uses the longest series phrase from master values and aliases", () => {
  const normalizations = compileProductMatchNormalizations(rules, catalog);

  assert.deepEqual(normalizations.findInText("series", "MAKUKU SLIM CARE JUMBO PANTS L48", "MAKUKU"), {
    value: "SLIM CARE",
    ruleId: "series-slim-care",
  });
  assert.deepEqual(normalizations.findInText("series", "MAKUKU SLIM PANTS L30", "MAKUKU"), {
    value: "SLIM",
    ruleId: null,
  });
});

test("normalization applies a brand-scoped rule before its global fallback", () => {
  const normalizations = compileProductMatchNormalizations(rules, catalog);

  assert.deepEqual(normalizations.normalizeExact("size", "NBS", "MAKUKU"), {
    value: "NB/NB-S",
    ruleId: "size-nbs-makuku",
  });
  assert.deepEqual(normalizations.normalizeExact("size", "NBS", "SWEETY"), {
    value: "NB-S",
    ruleId: "size-nbs-global",
  });
});

test("normalization accepts configured piece expressions but never remaps a bare integer", () => {
  const normalizations = compileProductMatchNormalizations(rules, catalog);

  assert.deepEqual(normalizations.normalizeExact("piece_count", "48+4", "SWEETY"), {
    value: "52",
    ruleId: "pieces-bonus",
  });
  assert.deepEqual(normalizations.normalizeExact("piece_count", "52", "SWEETY"), {
    value: "52",
    ruleId: null,
  });
});
